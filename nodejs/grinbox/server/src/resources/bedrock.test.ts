import type { InvokeModelCommandOutput } from '@aws-sdk/client-bedrock-runtime'
import { MODEL_IDS } from '@grinbox/shared'
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

  it('throws a clear error for an unmapped model id', () => {
    expect(() => resolveInferenceProfile('made-up-model')).toThrow(UnmappedModelError)
    expect(() => resolveInferenceProfile('made-up-model')).toThrow(/inference.profile/i)
  })
})

describe('every offered model is invokable', () => {
  // d-kv9ipb56: a user picks a model from the closed set grinbox ships, which
  // `@grinbox/shared` owns. An offered id with no inference profile would be
  // saveable and then throw at run time, so the two sets must agree exactly.
  it('every id in the offered set maps to an inference profile', () => {
    for (const id of MODEL_IDS) {
      expect(MODEL_INFERENCE_PROFILES[id]).toBeDefined()
      expect(() => resolveInferenceProfile(id)).not.toThrow()
    }
  })

  it('maps nothing the offered set does not name', () => {
    expect(Object.keys(MODEL_INFERENCE_PROFILES).sort()).toEqual([...MODEL_IDS].sort())
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
    const send: BedrockSend = vi.fn<BedrockSend>(async (input) => {
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
    const send: BedrockSend = vi.fn<BedrockSend>(async (input) => {
      captured = input.body as string
      return fakeOutput({
        content: [{ type: 'text', text: 'ok' }],
        usage: {},
      })
    })
    await invokeModel(send, { modelId: HAIKU, prompt: 'classify me' }, new AbortController().signal)
    const body = JSON.parse(captured ?? '{}') as {
      anthropic_version: string
      max_tokens: number
      messages: unknown
    }
    expect(body.anthropic_version).toBe('bedrock-2023-05-31')
    expect(body.max_tokens).toBe(1024)
    expect(body.messages).toEqual([{ role: 'user', content: 'classify me' }])
  })

  it('honors a maxTokens override in the request body', async () => {
    let captured: string | undefined
    const send: BedrockSend = vi.fn<BedrockSend>(async (input) => {
      captured = input.body as string
      return fakeOutput({
        content: [{ type: 'text', text: 'ok' }],
        usage: {},
      })
    })
    await invokeModel(send, { modelId: HAIKU, prompt: 'x', maxTokens: 256 }, new AbortController().signal)
    expect((JSON.parse(captured ?? '{}') as { max_tokens: number }).max_tokens).toBe(256)
  })
})
