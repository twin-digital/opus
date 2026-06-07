import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Ajv, type AnySchema } from 'ajv'

import type { Llm, LlmOptions } from './chronicle.js'

const SCHEMAS_DIR = join(import.meta.dirname, '..', 'schemas')

/** Load a JSON Schema by name from `schemas/<name>.json`. */
export const loadSchema = (name: string): AnySchema => {
  const parsed: unknown = JSON.parse(readFileSync(join(SCHEMAS_DIR, `${name}.json`), 'utf8'))
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error(`chronicler: schema "${name}" is not a JSON object`)
  }
  return parsed as AnySchema
}

/** Pull a JSON value out of a completion that may wrap it in prose or a ```json fence. */
const extractJson = (text: string): string => {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const candidate = (fenced ? fenced[1] : text).trim()
  const start = candidate.search(/[[{]/)
  if (start < 0) {
    return candidate
  }
  const close = candidate[start] === '{' ? '}' : ']'
  const end = candidate.lastIndexOf(close)
  return end > start ? candidate.slice(start, end + 1) : candidate
}

const ajv = new Ajv({ allErrors: true, strict: false })

/**
 * Ask an LLM for structured output and return it validated against `schemas/<schemaName>.json`.
 *
 * The backend seam stays text-in/text-out: this appends the schema and a JSON-only instruction to
 * the prompt, extracts and parses the JSON from the completion, validates it, and on failure
 * re-prompts with the error — up to `retries` times. This is the portable path every backend gets;
 * one with native structured output (ollama `format`, Anthropic tool-use) can override it later
 * behind the same call, with no change to templates or pipelines.
 */
export const requestStructured = async (
  llm: Llm,
  prompt: string,
  schemaName: string,
  options?: LlmOptions,
  retries = 2,
  arrayLengths?: Readonly<Record<string, number>>,
): Promise<unknown> => {
  const schema = loadSchema(schemaName)
  // Pin a top-level array output to an exact length (e.g. one `trials` outline entry per adventure
  // trial) so a model can't over- or under-generate it — enforced by the grammar natively, by
  // validation + retry otherwise.
  if (arrayLengths !== undefined) {
    const props = (schema as { properties?: Record<string, unknown> }).properties
    for (const [name, length] of Object.entries(arrayLengths)) {
      const prop = props?.[name]
      if (prop !== null && typeof prop === 'object' && (prop as { type?: unknown }).type === 'array') {
        Object.assign(prop, { minItems: length, maxItems: length })
      }
    }
  }
  const validate = ajv.compile(schema)
  const instruction = `\n\nRespond with ONLY a JSON value conforming to this JSON Schema — no prose, no explanation, no code fences:\n\n${JSON.stringify(schema, null, 2)}`

  let lastError = 'no attempts made'
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const repair =
      attempt === 0 ? '' : `\n\nYour previous reply was invalid (${lastError}). Return only the corrected JSON.`
    // Pass the schema down: a backend with native structured output (ollama `format`) constrains
    // generation to it; the rest ignore it and rely on the instruction + the validation below.
    const raw = await llm(prompt + instruction + repair, { ...options, schema })
    let parsed: unknown
    try {
      parsed = JSON.parse(extractJson(raw))
    } catch (error) {
      lastError = `not valid JSON: ${error instanceof Error ? error.message : String(error)}`
      continue
    }
    if (validate(parsed)) {
      return parsed
    }
    lastError = ajv.errorsText(validate.errors)
  }
  throw new Error(
    `chronicler: structured output for "${schemaName}" failed after ${retries + 1} attempts: ${lastError}`,
  )
}
