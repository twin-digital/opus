import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * {@link buildUnderlyingClients} gating, plus an end-to-end proof that a real
 * (mocked-transport) Bedrock client drives an `llm_tagger` through the execution
 * loop when `bedrockRegion` is set.
 *
 * `@aws-sdk/client-bedrock-runtime` is mocked so `makeBedrockSend` builds a
 * client whose `.send` returns a canned Anthropic Messages response — no network,
 * no real AWS client. `gmail_api` / `pushover_api` stay "not configured" stubs
 * (M2), so we assert those still throw.
 */

// --- bedrock SDK mock -------------------------------------------------------

const send = vi.fn()
class FakeBedrockRuntimeClient {
  send = send
}
class FakeInvokeModelCommand {
  constructor(public readonly input: unknown) {}
}

vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: FakeBedrockRuntimeClient,
  InvokeModelCommand: FakeInvokeModelCommand,
}))

const { buildUnderlyingClients, staticMakeUnderlyingClients } = await import('./underlying-clients.js')
const { freshDb, seedBase } = await import('../pipeline/test-helpers.js')
const { seedDefaultLimits } = await import('../db/seed.js')
const { createOperator } = await import('../pipeline/operator-save.js')
const { enqueueTriage } = await import('../pipeline/triage-enqueue.js')
const { createExecutionLoop } = await import('../execution/execution-loop.js')

import type { Config } from '../config.js'
import type { Database } from '../db/schema.js'

function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    dbPath: ':memory:',
    httpPort: 8787,
    httpHost: '127.0.0.1',
    tokenEncKey: Buffer.alloc(32),
    operatorTimeoutMs: 30_000,
    workerPoolSize: 3,
    pollSchedulerTickSeconds: 60,
    ...overrides,
  } as Config
}

/** A canned Anthropic Messages response body the mocked client returns. */
function bedrockOutput(text: string) {
  return {
    body: new TextEncoder().encode(
      JSON.stringify({
        content: [{ type: 'text', text }],
        usage: { input_tokens: 11, output_tokens: 3 },
      }),
    ),
    $metadata: {},
  }
}

describe('buildUnderlyingClients gating', () => {
  beforeEach(() => {
    send.mockReset()
  })

  it('leaves llm_bedrock a "not configured" stub when bedrockRegion is unset', () => {
    const clients = buildUnderlyingClients(testConfig())
    expect(() => clients.llm_bedrock.invoke_model({ modelId: 'm', prompt: 'p' }, new AbortController().signal)).toThrow(
      /no Resource client is configured/i,
    )
  })

  it('always leaves the gmail/pushover Action clients "not configured" (M2)', () => {
    const clients = buildUnderlyingClients(testConfig({ bedrockRegion: 'us-east-1' }))
    const sig = new AbortController().signal
    expect(() => clients.gmail_api.apply_label({ backendMessageId: 'x', label: 'L' }, sig)).toThrow(
      /no Resource client is configured/i,
    )
    expect(() => clients.pushover_api.send_notification({ message: 'hi', credentialsId: 1 } as never, sig)).toThrow(
      /no Resource client is configured/i,
    )
  })

  it('builds a real (mocked-transport) llm_bedrock client when bedrockRegion is set', async () => {
    send.mockResolvedValue(bedrockOutput('{"urgency": "high"}'))
    const clients = buildUnderlyingClients(testConfig({ bedrockRegion: 'us-east-1' }))
    const result = await clients.llm_bedrock.invoke_model(
      { modelId: 'anthropic.claude-haiku-4-5-20251001-v1:0', prompt: 'hi' },
      new AbortController().signal,
    )
    expect(result.text).toBe('{"urgency": "high"}')
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 3 })
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('llm_tagger end-to-end over the real (mocked) Bedrock client', () => {
  let db: Kysely<Database>

  beforeEach(async () => {
    send.mockReset()
    db = await freshDb()
  })
  afterEach(async () => {
    await db.destroy()
    vi.restoreAllMocks()
  })

  it('runs an llm_tagger through the execution loop and persists the model-derived tag', async () => {
    const seed = await seedBase(db)
    await seedDefaultLimits(db, seed.userId)

    send.mockResolvedValue(bedrockOutput('{"urgency": "high"}'))

    await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'llm',
      typeKey: 'llm_tagger',
      configJson: JSON.stringify({
        model_id: 'anthropic.claude-haiku-4-5-20251001-v1:0',
        prompt_template: 'classify {{subject}}',
        outputs: [{ tag_key: 'urgency', value_enum: ['high', 'low'] }],
      }),
      enabled: true,
      actorUserId: null,
    })
    await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })

    const loop = createExecutionLoop({
      db,
      config: testConfig({ bedrockRegion: 'us-east-1' }),
      makeClients: staticMakeUnderlyingClients(buildUnderlyingClients(testConfig({ bedrockRegion: 'us-east-1' }))),
    })
    await loop.runUntilIdle()
    await loop.stop()

    // The Bedrock transport was actually invoked through the metered client.
    expect(send).toHaveBeenCalledTimes(1)

    const tag = await db.selectFrom('tags').select(['key', 'value']).where('key', '=', 'urgency').executeTakeFirst()
    expect(tag).toEqual({ key: 'urgency', value: 'high' })

    const settled = await db
      .selectFrom('triages')
      .select(['status'])
      .where('pipeline_id', '=', seed.pipelineId)
      .execute()
    expect(settled.every((t) => t.status === 'completed')).toBe(true)
  })
})
