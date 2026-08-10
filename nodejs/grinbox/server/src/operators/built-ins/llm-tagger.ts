/**
 * O2 — LLM Tagger. A Tagger that produces its declared output Tags from a
 * single constrained LLM call (glossary "LLM Tagger", architecture.md "Tagger
 * types" → LLM Tagger). This single-call-many-Tags behavior is the main reason
 * to use an LLM Tagger over multiple Rule-based Taggers. Outputs come in two
 * forms (docs/digest-design.md "Field extraction"):
 *
 *  - **Enum outputs** (`value_enum`) — the model must answer with exactly one
 *    of the enum's values; every enum output is contractually required, so a
 *    missing/ambiguous value fails the run.
 *  - **Extracted outputs** (`value_type`) — the model produces the value
 *    freely (or `null` when the Message doesn't carry it); the server then
 *    normalizes it (`normalize-extracted.ts`). A missing, null, or
 *    unnormalizable value drops that Tag — extraction is conditionally absent
 *    by design and never fails the run on its own.
 *
 * The optional `when` gate (shared with Actions; `action-gate.ts`) skips the
 * whole call — a gated Tagger that doesn't fire emits nothing and consumes no
 * model budget, the idiom for extraction Operators scoped to the digest
 * categories that need their fields.
 *
 * Declares `llm_bedrock.invoke_model` (the static Contract for `llm_tagger`).
 * The **real** Bedrock client (S4) owns HTTP retries, the inference-profile
 * ARN, token metering, and event accumulation — this operator only calls
 * `invoke_model`, consumes the {@link ResourceOpResult}, and parses the text.
 */

import { type LlmTaggerOutput, contractFromConfig, operatorConfigSchemas } from '@grinbox/shared'
import type { LlmBedrockClient, OperatorRunInput, OperatorRunResult, OperatorType } from '../types.js'
import { shouldFire } from './action-gate.js'
import { normalizeExtractedValue } from './normalize-extracted.js'
import { renderTemplate } from './template.js'

/**
 * Thrown when the model's response cannot be reduced to a valid value for every
 * declared **enum** output key — the response isn't a JSON object, an enum key
 * is missing, or its value doesn't resolve to exactly one of its `value_enum`.
 * (Extracted outputs never throw here; they drop instead.) `runOperator`'s
 * output-Tag validation is the backstop, but parsing defensively here yields a
 * clearer failure that names the offending text/key.
 */
export class LlmTaggerParseError extends Error {
  override readonly name = 'LlmTaggerParseError'
}

/**
 * Thrown when the model call is denied by a Limit (`skipped_by_limit`). A
 * Tagger's enum output Tags are **contractually required** — without the model
 * it has no values to emit and cannot satisfy its Contract. This differs
 * from the pipeline's default "skipped_by_limit → clean no-op" posture, which
 * applies to Actions whose external effect is optional (a missed notification
 * is tolerable; a missing required Tag is not). So the LLM Tagger turns a Limit
 * skip into a failed run, and the downstream Operators cascade-skip.
 */
export class LlmTaggerSkippedByLimitError extends Error {
  override readonly name = 'LlmTaggerSkippedByLimitError'
}

/** Thrown when the model call itself failed after the client's retry policy. */
export class LlmTaggerModelError extends Error {
  override readonly name = 'LlmTaggerModelError'
}

/** Per-type instruction for an extracted output in the prompt. */
const EXTRACTION_INSTRUCTIONS: Record<string, string> = {
  string: 'a short string extracted from the message',
  money: 'a monetary amount with its currency, e.g. "195.03 USD"',
  date: 'a calendar date in YYYY-MM-DD form',
}

/**
 * Builds the prompt sent to the model: the User's rendered `prompt_template`
 * followed by an instruction block that, for each declared output key, either
 * enumerates the allowed values (enum outputs) or describes the value to
 * extract with `null` for "not present" (extracted outputs), and asks for a
 * single JSON object. Constraining the model to a small structured response
 * keeps {@link parseResponse}'s per-key job simple, and `runOperator`'s
 * output validation is the final guard.
 */
function buildPrompt(renderedTemplate: string, outputs: readonly LlmTaggerOutput[]): string {
  const perKey = outputs
    .map((o) => {
      if ('value_enum' in o) {
        const choices = o.value_enum.map((v) => `  - ${v}`).join('\n')
        return `"${o.tag_key}" must be exactly one of:\n${choices}`
      }
      return `"${o.tag_key}" is ${EXTRACTION_INSTRUCTIONS[o.value_type]}; use null if the message does not contain it`
    })
    .join('\n')
  const skeleton = `{${outputs
    .map((o) => `"${o.tag_key}": ${'value_enum' in o ? '"<value>"' : '"<value>" or null'}`)
    .join(', ')}}`
  return [
    renderedTemplate,
    '',
    'Classify the message above for each of the following keys.',
    perKey,
    '',
    'Reply with a single JSON object and nothing else, of the form:',
    skeleton,
  ].join('\n')
}

/**
 * Reduces the model's raw text to a single value from `valueEnum`, or throws.
 * Resolution order:
 *  1. Trimmed text exactly equals an allowed value.
 *  2. The trimmed text matches an allowed value case-insensitively (exactly
 *     one such match).
 *  3. Exactly one allowed value appears as a whole-word token in the text
 *     (the one corrective behavior, kept cheap and non-looping — it salvages a
 *     model that wrapped its answer in a sentence). Ambiguity (zero or
 *     multiple matches) throws rather than guessing.
 */
function parseEnumValue(text: string, valueEnum: readonly string[]): string {
  const trimmed = text.trim()

  // 1. Exact match.
  if (valueEnum.includes(trimmed)) {
    return trimmed
  }

  // 2. Case-insensitive exact match (unique).
  const lower = trimmed.toLowerCase()
  const ciMatches = valueEnum.filter((v) => v.toLowerCase() === lower)
  if (ciMatches.length === 1) {
    return ciMatches[0]
  }

  // 3. Unique whole-token occurrence within a longer response.
  const tokens = new Set(
    trimmed
      .toLowerCase()
      .split(/[^a-z0-9_-]+/i)
      .filter((t) => t.length > 0),
  )
  const tokenMatches = valueEnum.filter((v) => tokens.has(v.toLowerCase()))
  if (tokenMatches.length === 1) {
    return tokenMatches[0]
  }

  throw new LlmTaggerParseError(
    `model output ${JSON.stringify(trimmed)} did not resolve to exactly one value of [${valueEnum.join(', ')}]`,
  )
}

/**
 * Extracts the JSON object from the model's raw text. Tolerates leading/trailing
 * prose by slicing from the first `{` to the last `}` (a model that wrapped its
 * object in a sentence still parses); throws a clear error otherwise.
 */
function extractJsonObject(text: string): Record<string, unknown> {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    throw new LlmTaggerParseError(`model output ${JSON.stringify(text.trim())} did not contain a JSON object`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch (err) {
    throw new LlmTaggerParseError(`model output JSON could not be parsed: ${(err as Error).message}`)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new LlmTaggerParseError('model output JSON was not an object')
  }
  return parsed as Record<string, unknown>
}

/**
 * Parses the model's text into output Tags. Enum outputs are required: a
 * missing entry, non-string entry, or unresolvable value throws
 * ({@link parseEnumValue}). Extracted outputs are optional: a missing entry, a
 * `null`, a non-string, or a value that fails normalization simply yields no
 * Tag for that key.
 */
function parseResponse(text: string, outputs: readonly LlmTaggerOutput[]): { key: string; value: string }[] {
  const obj = extractJsonObject(text)
  const tags: { key: string; value: string }[] = []
  for (const o of outputs) {
    const raw = obj[o.tag_key]
    if ('value_enum' in o) {
      if (typeof raw !== 'string') {
        throw new LlmTaggerParseError(`model output is missing a string value for required output key '${o.tag_key}'`)
      }
      tags.push({ key: o.tag_key, value: parseEnumValue(raw, o.value_enum) })
      continue
    }
    // Extracted output: absent / null / unnormalizable → the Tag is dropped.
    if (typeof raw !== 'string') {
      continue
    }
    const normalized = normalizeExtractedValue(o.value_type, raw)
    if (normalized !== null) {
      tags.push({ key: o.tag_key, value: normalized })
    }
  }
  return tags
}

/**
 * Evaluates the `when` gate; when it fires, renders the prompt, makes the
 * single constrained model call, and emits the parsed Tags. Reacts to each
 * {@link ResourceOpResult} outcome:
 *  - `succeeded`: parse the text ({@link parseResponse}).
 *  - `skipped_by_limit`: throw (required enum Tags, see
 *    {@link LlmTaggerSkippedByLimitError}).
 *  - `failed`: throw, surfacing the client's error.
 */
async function run(input: OperatorRunInput<'llm_tagger'>): Promise<OperatorRunResult> {
  const { config, message, tags, resources, signal } = input

  if (!shouldFire(config.when, tags)) {
    // Gate didn't match: emit nothing (no model call). Downstream Operators
    // that depend on this Tagger's outputs cascade-skip.
    return { tags: [] }
  }

  // The Contract declares llm_bedrock, so the factory always provides it; guard
  // defensively rather than assume the partial map is populated.
  const client: LlmBedrockClient | undefined = resources.llm_bedrock
  if (!client) {
    throw new LlmTaggerModelError('llm_tagger requires the llm_bedrock client but it was not provided')
  }

  const keys = config.outputs.map((o) => o.tag_key).join(', ')

  const rendered = renderTemplate(config.prompt_template, message, tags)
  const prompt = buildPrompt(rendered, config.outputs)

  signal.throwIfAborted()

  const result = await client.invoke_model({
    modelId: config.model_id,
    prompt,
  })

  switch (result.outcome) {
    case 'succeeded':
      return { tags: parseResponse(result.value.text, config.outputs) }
    case 'skipped_by_limit':
      throw new LlmTaggerSkippedByLimitError(
        `llm_tagger [${keys}] could not produce its required ` +
          `output Tags: the model call was skipped by limit ${result.limit_id} ` +
          `(scope ${result.scope})`,
      )
    case 'failed':
      throw new LlmTaggerModelError(`llm_tagger [${keys}] model call failed: ${result.error.message}`)
  }
}

/** LLM Tagger uses no Credentials (Bedrock auth is client-side, in S4). */
function extractCredentialRefsFromOperatorConfig(): number[] {
  return []
}

export const llmTaggerType: OperatorType<'llm_tagger'> = {
  type_key: 'llm_tagger',
  code_version: '1',
  configSchema: operatorConfigSchemas.llm_tagger,
  contractFromConfig: (c) => contractFromConfig('llm_tagger', c),
  run,
  extractCredentialRefsFromOperatorConfig,
}
