import type { LimitScope, ResourceOpResult } from '@twin-digital/grinbox-shared'
import { describe, expect, it } from 'vitest'
import { runOperator } from '../run.js'
import { createFakeResourceClients } from '../testing.js'
import type { MessageView } from '../types.js'
import { LlmTaggerModelError, LlmTaggerParseError, LlmTaggerSkippedByLimitError } from './llm-tagger.js'

function message(over: Partial<MessageView> = {}): MessageView {
  return {
    id: 1,
    accountId: 1,
    backendMessageId: 'm1',
    from: 'alice@example.com',
    from_email: 'alice@example.com',
    from_domain: 'example.com',
    to: 'me@example.com',
    subject: 'Invoice #42 due',
    snippet: 'please pay',
    bodyText: 'the full body text',
    bodyHtml: null,
    receivedAt: 0,
    headers: new Map(),
    thread: null,
    ...over,
  }
}

const CONFIG = {
  model_id: 'anthropic.claude-fast',
  prompt_template: 'Subject: {{subject}} | hint={{tag.hint}} | x={{bogus}}',
  outputs: [
    { tag_key: 'category', value_enum: ['personal', 'work', 'spam'] },
    { tag_key: 'urgency', value_enum: ['high', 'low'] },
  ],
}

function snapshot(configOver: Partial<typeof CONFIG> = {}) {
  return {
    type_key: 'llm_tagger',
    type_code_version: '1',
    op_config_json: JSON.stringify({ ...CONFIG, ...configOver }),
  }
}

/** Builds args for `runOperator`, wiring a fake llm_bedrock canned result. */
function args(canned: ResourceOpResult<unknown> | undefined, tags: Record<string, string> = {}) {
  const fake = createFakeResourceClients(canned ? { canned: { 'llm_bedrock.invoke_model': canned } } : {})
  return {
    fake,
    runArgs: {
      message: message(),
      tags: new Map(Object.entries(tags)),
      makeResourceClient: fake.factory,
      signal: new AbortController().signal,
    },
  }
}

function llmSucceeded(text: string): ResourceOpResult<unknown> {
  return {
    outcome: 'succeeded',
    value: { text, usage: { inputTokens: 1, outputTokens: 1 } },
  }
}

describe('llm-tagger run', () => {
  it('happy path: one model call yields all declared output Tags', async () => {
    const { runArgs } = args(llmSucceeded('{"category": "work", "urgency": "high"}'))
    const result = await runOperator(snapshot(), runArgs)
    expect(result.tags).toEqual([
      { key: 'category', value: 'work' },
      { key: 'urgency', value: 'high' },
    ])
  })

  it('salvages a JSON object wrapped in prose, per-key', async () => {
    const { runArgs } = args(llmSucceeded('Here is my answer: {"category": "SPAM", "urgency": "HIGH"} — done.'))
    const result = await runOperator(snapshot(), runArgs)
    expect(result.tags).toEqual([
      { key: 'category', value: 'spam' },
      { key: 'urgency', value: 'high' },
    ])
  })

  it('renders prompt placeholders and the multi-output instruction', async () => {
    const { fake, runArgs } = args(llmSucceeded('{"category": "personal", "urgency": "low"}'), { hint: 'home' })
    await runOperator(snapshot(), runArgs)

    const call = fake.calls.find((c) => c.operation === 'invoke_model')
    expect(call).toBeDefined()
    const sent = call?.args as { modelId: string; prompt: string }
    expect(sent.modelId).toBe('anthropic.claude-fast')
    // {{subject}} and {{tag.hint}} substituted; unknown {{bogus}} -> empty.
    expect(sent.prompt).toContain('Subject: Invoice #42 due')
    expect(sent.prompt).toContain('hint=home | x=')
    // Both output keys and their allowed values are enumerated for the model.
    expect(sent.prompt).toContain('"category" must be exactly one of:')
    expect(sent.prompt).toContain('- personal')
    expect(sent.prompt).toContain('- work')
    expect(sent.prompt).toContain('- spam')
    expect(sent.prompt).toContain('"urgency" must be exactly one of:')
    expect(sent.prompt).toContain('- high')
    expect(sent.prompt).toContain('- low')
    // The structured-response skeleton names every key.
    expect(sent.prompt).toContain('"category": "<value>"')
    expect(sent.prompt).toContain('"urgency": "<value>"')
  })

  it('off-enum value for any output key makes the run throw', async () => {
    // "maybe" is neither an exact, case-insensitive, nor unique-token match.
    const { runArgs } = args(llmSucceeded('{"category": "maybe", "urgency": "high"}'))
    await expect(runOperator(snapshot(), runArgs)).rejects.toBeInstanceOf(LlmTaggerParseError)
  })

  it('a missing output key makes the run throw', async () => {
    const { runArgs } = args(llmSucceeded('{"category": "work"}'))
    await expect(runOperator(snapshot(), runArgs)).rejects.toBeInstanceOf(LlmTaggerParseError)
  })

  it('a non-JSON-object response makes the run throw', async () => {
    const { runArgs } = args(llmSucceeded('work and high'))
    await expect(runOperator(snapshot(), runArgs)).rejects.toBeInstanceOf(LlmTaggerParseError)
  })

  it('a malformed brace slice (text with {} but invalid JSON) throws', async () => {
    // `{bad}` has braces, so the first-`{`/last-`}` slice IS attempted, but the
    // sliced text fails JSON.parse — the parse-failure branch of
    // extractJsonObject, distinct from the no-object-found branch above.
    const { runArgs } = args(llmSucceeded('here: {bad} ok'))
    await expect(runOperator(snapshot(), runArgs)).rejects.toBeInstanceOf(LlmTaggerParseError)
    await expect(runOperator(snapshot(), runArgs)).rejects.toThrow(/could not be parsed/i)
  })

  it('an array JSON response is rejected as not an object', async () => {
    // A bare JSON array carries no `{`/`}`, so the slice never finds an object —
    // the "did not contain a JSON object" guard fires rather than yielding an
    // array that downstream per-key resolution would mis-handle.
    const { runArgs } = args(llmSucceeded('["high", "low"]'))
    await expect(runOperator(snapshot(), runArgs)).rejects.toBeInstanceOf(LlmTaggerParseError)
    await expect(runOperator(snapshot(), runArgs)).rejects.toThrow(/did not contain a JSON object/i)
  })

  it('rejects an ambiguous per-key answer naming multiple enum values', async () => {
    const { runArgs } = args(llmSucceeded('{"category": "either work or personal", "urgency": "low"}'))
    await expect(runOperator(snapshot(), runArgs)).rejects.toBeInstanceOf(LlmTaggerParseError)
  })

  it('skipped_by_limit makes the run throw (required Tag rationale)', async () => {
    const skipped: ResourceOpResult<unknown> = {
      outcome: 'skipped_by_limit',
      limit_id: 7,
      scope: 'per_window' satisfies LimitScope,
    }
    const { runArgs } = args(skipped)
    await expect(runOperator(snapshot(), runArgs)).rejects.toBeInstanceOf(LlmTaggerSkippedByLimitError)
    await expect(runOperator(snapshot(), runArgs)).rejects.toThrow(/required.*output Tag/i)
  })

  it('failed result makes the run throw', async () => {
    const failed: ResourceOpResult<unknown> = {
      outcome: 'failed',
      error: new Error('bedrock 500'),
    }
    const { runArgs } = args(failed)
    await expect(runOperator(snapshot(), runArgs)).rejects.toBeInstanceOf(LlmTaggerModelError)
  })

  it('throws if the signal is already aborted before the call', async () => {
    const controller = new AbortController()
    controller.abort()
    const fake = createFakeResourceClients()
    await expect(
      runOperator(snapshot(), {
        message: message(),
        tags: new Map(),
        makeResourceClient: fake.factory,
        signal: controller.signal,
      }),
    ).rejects.toThrow()
    // The model was never called.
    expect(fake.calls.find((c) => c.operation === 'invoke_model')).toBeUndefined()
  })
})
