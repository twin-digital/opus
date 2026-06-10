/**
 * The underlying Bedrock invocation for `llm_bedrock.invoke_model`, beneath the
 * metering/Limit layer. This module owns:
 *  - building the `BedrockRuntimeClient` (region from config),
 *  - mapping the configured model id to its `global.*` cross-region
 *    inference-profile ARN (architecture.md / implementation-plan.md M1
 *    operational notes: Claude must be invoked via the `global.` inference
 *    profile, never the bare foundation-model ARN, or the call fails with
 *    "on-demand throughput isn't supported"),
 *  - sending the `InvokeModelCommand` (Anthropic Messages API body) with the
 *    Operator-timeout `abortSignal`,
 *  - parsing the response text + token usage and computing `cost_usd_micros`.
 *
 * The Bedrock send-fn is injected ({@link BedrockSend}) so tests mock it without
 * touching the network or constructing a real client. Production callers use
 * {@link makeBedrockSend} to build a send-fn over a real client.
 *
 * `verbatimModuleSyntax` is on: `BedrockRuntimeClient` and `InvokeModelCommand`
 * are *instantiated*, so they are VALUE imports; the command input/output shapes
 * are type-only.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import type { InvokeModelCommandInput, InvokeModelCommandOutput } from '@aws-sdk/client-bedrock-runtime'
import type { LlmInvokeArgs, LlmUsage } from '../operators/types.js'

/** Thrown when a configured model id has no mapped inference-profile ARN. */
export class UnmappedModelError extends Error {
  override readonly name = 'UnmappedModelError'
}

/** Thrown when the Bedrock response body can't be parsed into text + usage. */
export class BedrockResponseError extends Error {
  override readonly name = 'BedrockResponseError'
}

/**
 * Map from a configured `model_id` to the `global.*` cross-region
 * inference-profile id it must actually be invoked through. Claude on Bedrock
 * rejects a bare foundation-model id for on-demand invocation with "on-demand
 * throughput isn't supported"; the `global.` profile carries no pricing premium
 * (implementation-plan.md M1).
 *
 * Both the bare id and the already-prefixed profile id map to the profile, so a
 * config that already names the profile is accepted unchanged. Unmapped ids
 * raise {@link UnmappedModelError} rather than silently passing a value Bedrock
 * will reject at call time.
 */
export const MODEL_INFERENCE_PROFILES: Readonly<Partial<Record<string, string>>> = {
  'anthropic.claude-haiku-4-5-20251001-v1:0': 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
  'global.anthropic.claude-haiku-4-5-20251001-v1:0': 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
  'anthropic.claude-sonnet-4-5-20250929-v1:0': 'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
  'global.anthropic.claude-sonnet-4-5-20250929-v1:0': 'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
}

/**
 * Per-1M-token USD pricing by inference-profile id, used to compute
 * `cost_usd_micros`. Keyed by the resolved profile id so a bare/profile config
 * id share one price. An unpriced model yields a zero cost rather than failing
 * (the call already succeeded; metering a missing price as 0 is preferable to
 * losing the token counts).
 */
const MODEL_PRICING_USD_PER_1M: Readonly<Partial<Record<string, { input: number; output: number }>>> = {
  'global.anthropic.claude-haiku-4-5-20251001-v1:0': { input: 1, output: 5 },
  'global.anthropic.claude-sonnet-4-5-20250929-v1:0': { input: 3, output: 15 },
}

/**
 * Resolve the inference-profile id for a configured model id, or throw
 * {@link UnmappedModelError} (citing the M1 note) when unmapped.
 */
export function resolveInferenceProfile(modelId: string): string {
  const profile = MODEL_INFERENCE_PROFILES[modelId]
  if (profile === undefined) {
    throw new UnmappedModelError(
      `model id '${modelId}' has no mapped global.* inference-profile ARN; Claude on Bedrock must be invoked via a cross-region inference profile, not the bare foundation-model id (implementation-plan.md M1)`,
    )
  }
  return profile
}

/** Compute `cost_usd_micros` (integer micro-USD) from token counts. */
export function computeCostUsdMicros(profileId: string, usage: LlmUsage): number {
  const pricing = MODEL_PRICING_USD_PER_1M[profileId]
  if (!pricing) {
    return 0
  }
  const usd = (usage.inputTokens / 1_000_000) * pricing.input + (usage.outputTokens / 1_000_000) * pricing.output
  return Math.round(usd * 1_000_000)
}

/**
 * The injected Bedrock transport: sends an already-built command input and
 * resolves the raw command output. `makeBedrockSend` wraps a real client; tests
 * pass a fake.
 */
export type BedrockSend = (input: InvokeModelCommandInput, signal: AbortSignal) => Promise<InvokeModelCommandOutput>

/**
 * Build a {@link BedrockSend} over a real `BedrockRuntimeClient` for `region`.
 * `BedrockRuntimeClient`/`InvokeModelCommand` are value imports because they are
 * instantiated here.
 */
export function makeBedrockSend(region: string): BedrockSend {
  const client = new BedrockRuntimeClient({ region })
  return (input, signal) =>
    client.send(new InvokeModelCommand(input), {
      abortSignal: signal,
      requestTimeout: 30_000,
    })
}

/** The result of a successful Bedrock invocation. */
export interface BedrockInvokeResult {
  readonly text: string
  readonly usage: LlmUsage
  readonly costUsdMicros: number
}

/** Parse the Anthropic Messages API response body into text + token usage. */
function parseResponse(output: InvokeModelCommandOutput): {
  text: string
  usage: LlmUsage
} {
  // The SDK types `body` as always present; guard anyway for malformed responses.
  const rawBody = output.body as Uint8Array | undefined
  if (!rawBody) {
    throw new BedrockResponseError('Bedrock response had no body')
  }
  let parsed: unknown
  try {
    const text = new TextDecoder().decode(rawBody)
    parsed = JSON.parse(text)
  } catch (err) {
    throw new BedrockResponseError(`Bedrock response body was not valid JSON: ${(err as Error).message}`)
  }
  const body = parsed as {
    content?: readonly { type?: string; text?: string }[]
    usage?: { input_tokens?: number; output_tokens?: number }
  }
  const text = (body.content ?? [])
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('')
  if (text.length === 0) {
    throw new BedrockResponseError('Bedrock response contained no text content blocks')
  }
  return {
    text,
    usage: {
      inputTokens: body.usage?.input_tokens ?? 0,
      outputTokens: body.usage?.output_tokens ?? 0,
    },
  }
}

/**
 * Invoke a Claude model via the resolved inference profile. Builds the Anthropic
 * Messages API request body, sends it through the injected `send` (with the
 * abort signal), parses text + usage, and computes cost.
 */
export async function invokeModel(
  send: BedrockSend,
  args: LlmInvokeArgs,
  signal: AbortSignal,
): Promise<BedrockInvokeResult> {
  const profileId = resolveInferenceProfile(args.modelId)
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: args.maxTokens ?? 1024,
    messages: [{ role: 'user', content: args.prompt }],
  })
  const input: InvokeModelCommandInput = {
    modelId: profileId,
    contentType: 'application/json',
    accept: 'application/json',
    body,
  }
  const output = await send(input, signal)
  const { text, usage } = parseResponse(output)
  return { text, usage, costUsdMicros: computeCostUsdMicros(profileId, usage) }
}
