import type { InvokeModelCommandOutput } from '@aws-sdk/client-bedrock-runtime'
import { describe, expect, it, vi } from 'vitest'
import {
  BedrockResponseError,
  type BedrockSend,
  MODEL_INFERENCE_PROFILES,
  UnmappedModelError,
  computeCostUsdMicros,
  invokeModel,
  resolveInferenceProfile,
} from './bedrock.js'

/**
 * Bedrock underlying client with a mocked send-fn (no network). Covers
 * model→inference-profile mapping (and unmapped → clear error), response parse,
 * and cost computation.
 */

const HAIKU = 'anthropic.claude-haiku-4-5-20251001-v1:0'
const HAIKU_PROFILE = 'global.anthropic.claude-haiku-4-5-20251001-v1:0'

function fakeOutput(body: unknown): InvokeModelCommandOutput {
  return {
    body: new TextEncoder().encode(JSON.stringify(body)),
    $metadata: {},
  } as unknown as InvokeModelCommandOutput
}

describe('resolveInferenceProfile', () => {
  it('maps a bare foundation-model id to its global.* profile', () => {
    expect(resolveInferenceProfile(HAIKU)).toBe(HAIKU_PROFILE)
  })

  it('accepts an already-prefixed profile id unchanged', () => {
    expect(resolveInferenceProfile(HAIKU_PROFILE)).toBe(HAIKU_PROFILE)
  })

  it('throws a clear error for an unmapped model id', () => {
    expect(() => resolveInferenceProfile('made-up-model')).toThrow(UnmappedModelError)
    expect(() => resolveInferenceProfile('made-up-model')).toThrow(/inference.profile/i)
  })
})

describe('model-id alignment with MODEL_INFERENCE_PROFILES', () => {
  // The seed-demo LLM Tagger config and the web MODEL_OPTIONS pickers offer
  // model ids that the daemon must be able to map, or an LLM Tagger throws
  // UnmappedModelError at run time. These literals mirror those sources
  // (seed-demo.ts llmConfig.model_id; web operator-types.ts MODEL_OPTIONS).
  // seed-demo.ts runs main() on import, and the web id list lives in another
  // package, so both are asserted as hardcoded literals here rather than
  // imported — keep them in sync if those sources change.
  const SUPPORTED = [
    'anthropic.claude-haiku-4-5-20251001-v1:0', // tagger / fast (seed + web default)
    'anthropic.claude-sonnet-4-5-20250929-v1:0', // summary / capable (web)
  ] as const

  it('every offered model id is a key in MODEL_INFERENCE_PROFILES', () => {
    for (const id of SUPPORTED) {
      expect(MODEL_INFERENCE_PROFILES[id]).toBeDefined()
      expect(() => resolveInferenceProfile(id)).not.toThrow()
    }
  })

  it("seed-demo's chosen tagger model id is the supported Haiku 4.5 id", () => {
    expect(MODEL_INFERENCE_PROFILES['anthropic.claude-haiku-4-5-20251001-v1:0']).toBeDefined()
  })
})

describe('computeCostUsdMicros', () => {
  it('computes cost from per-1M pricing', () => {
    // Haiku: $1/1M in, $5/1M out. 1000 in → 1000 micro-USD; 200 out → 1000.
    const cost = computeCostUsdMicros(HAIKU_PROFILE, {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    })
    expect(cost).toBe(1_000_000 + 5_000_000)
  })

  it('returns 0 for an unpriced profile', () => {
    expect(
      computeCostUsdMicros('global.unknown', {
        inputTokens: 100,
        outputTokens: 100,
      }),
    ).toBe(0)
  })
})

describe('invokeModel', () => {
  it('sends through the profile id, parses text + usage, computes cost', async () => {
    const send: BedrockSend = vi.fn(async (input) => {
      expect(input.modelId).toBe(HAIKU_PROFILE)
      return fakeOutput({
        content: [{ type: 'text', text: 'spam' }],
        usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
      })
    })
    const result = await invokeModel(send, { modelId: HAIKU, prompt: 'classify this' }, new AbortController().signal)
    expect(result.text).toBe('spam')
    expect(result.usage).toEqual({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    })
    expect(result.costUsdMicros).toBe(6_000_000)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('throws on an unmapped model before sending', async () => {
    const send: BedrockSend = vi.fn()
    await expect(
      invokeModel(send, { modelId: 'nope', prompt: 'x' }, new AbortController().signal),
    ).rejects.toBeInstanceOf(UnmappedModelError)
    expect(send).not.toHaveBeenCalled()
  })

  it('throws when the response has no text content', async () => {
    const send: BedrockSend = vi.fn(async () => fakeOutput({ content: [], usage: {} }))
    await expect(invokeModel(send, { modelId: HAIKU, prompt: 'x' }, new AbortController().signal)).rejects.toThrow(
      /no text content/i,
    )
  })

  it('throws when the response has no body', async () => {
    const send: BedrockSend = vi.fn(async () => ({ $metadata: {} }) as never)
    await expect(
      invokeModel(send, { modelId: HAIKU, prompt: 'x' }, new AbortController().signal),
    ).rejects.toBeInstanceOf(BedrockResponseError)
  })

  it('throws when the response body is not valid JSON', async () => {
    const send: BedrockSend = vi.fn(
      async () =>
        ({
          body: new TextEncoder().encode('not json'),
          $metadata: {},
        }) as never,
    )
    await expect(invokeModel(send, { modelId: HAIKU, prompt: 'x' }, new AbortController().signal)).rejects.toThrow(
      /not valid JSON/i,
    )
  })

  it('joins multiple text content blocks and ignores non-text blocks', async () => {
    const send: BedrockSend = vi.fn(async () =>
      fakeOutput({
        content: [
          { type: 'text', text: 'foo' },
          { type: 'tool_use', text: 'IGNORED' },
          { type: 'text', text: 'bar' },
        ],
        usage: { input_tokens: 1, output_tokens: 2 },
      }),
    )
    const result = await invokeModel(send, { modelId: HAIKU, prompt: 'x' }, new AbortController().signal)
    expect(result.text).toBe('foobar')
  })

  it('builds the request body with the prompt and default max_tokens', async () => {
    let captured: string | undefined
    const send: BedrockSend = vi.fn(async (input) => {
      captured = input.body as string
      return fakeOutput({
        content: [{ type: 'text', text: 'ok' }],
        usage: {},
      })
    })
    await invokeModel(send, { modelId: HAIKU, prompt: 'classify me' }, new AbortController().signal)
    const body = JSON.parse(captured ?? '{}')
    expect(body.anthropic_version).toBe('bedrock-2023-05-31')
    expect(body.max_tokens).toBe(1024)
    expect(body.messages).toEqual([{ role: 'user', content: 'classify me' }])
  })

  it('honors a maxTokens override in the request body', async () => {
    let captured: string | undefined
    const send: BedrockSend = vi.fn(async (input) => {
      captured = input.body as string
      return fakeOutput({
        content: [{ type: 'text', text: 'ok' }],
        usage: {},
      })
    })
    await invokeModel(send, { modelId: HAIKU, prompt: 'x', maxTokens: 256 }, new AbortController().signal)
    expect(JSON.parse(captured ?? '{}').max_tokens).toBe(256)
  })
})
