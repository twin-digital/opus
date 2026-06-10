import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, openDatabase } from '../db/connection.js'
import { runMigrations } from '../db/migrator.js'
import type { DB } from '../db/schema.js'
import { seedDefaultLimits } from '../db/seed.js'
import type { GmailClient, LlmBedrockClient, PushoverClient } from '../operators/types.js'
import {
  type ResourceClientFactoryDeps,
  type ResourceEvent,
  type UnderlyingClients,
  type UsageDelta,
  createResourceClientFactory,
} from './make-resource-client.js'

/**
 * The metering layer over a migrated in-memory DB + default Limits, with fully
 * mocked underlying clients (no network). Covers: skipped_by_limit
 * short-circuits BEFORE the underlying op; success pushes the right
 * resource_op_succeeded event + usage; failure pushes resource_op_failed; only
 * declared operations are exposed.
 */

interface Harness {
  db: DB
  userId: number
  messageId: number
  events: ResourceEvent[]
  usage: { resourceOp: string; delta: UsageDelta }[]
  underlying: UnderlyingClients
  factoryDeps: () => ResourceClientFactoryDeps
}

async function setup(overrides: Partial<UnderlyingClients> = {}): Promise<Harness> {
  const db = openDatabase(':memory:')
  await runMigrations(db)
  const ts = 1000
  const user = await db
    .insertInto('users')
    .values({ name: 'u', email: 'u@example.com', created_at: ts })
    .returning('id')
    .executeTakeFirstOrThrow()
  const account = await db
    .insertInto('accounts')
    .values({
      user_id: user.id,
      name: 'a',
      provider_type: 'gmail',
      settings_json: '{}',
      created_at: ts,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const message = await db
    .insertInto('messages')
    .values({
      account_id: account.id,
      backend_message_id: 'm1',
      created_at: ts,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await seedDefaultLimits(db, user.id)

  const events: ResourceEvent[] = []
  const usage: { resourceOp: string; delta: UsageDelta }[] = []

  const underlying: UnderlyingClients = {
    llm_bedrock: {
      invoke_model: vi.fn(async () => ({
        text: 'spam',
        usage: { inputTokens: 10, outputTokens: 2 },
        costUsdMicros: 42,
      })),
    },
    gmail_api: {
      apply_label: vi.fn(async () => ({ applied: true })),
      send_message: vi.fn(async () => ({ message_id: 'g1' })),
      fetch_metadata: vi.fn(async () => ({ headers: {} })),
      list_messages: vi.fn(async () => ({ ids: [] })),
    },
    pushover_api: {
      send_notification: vi.fn(async () => ({ message_id: 'p1' })),
    },
    ...overrides,
  }

  return {
    db,
    userId: user.id,
    messageId: message.id,
    events,
    usage,
    underlying,
    factoryDeps: () => ({
      db,
      userId: user.id,
      messageId: message.id,
      operatorId: 1,
      triageId: 1,
      signal: new AbortController().signal,
      onEvent: (e) => events.push(e),
      onUsage: (resourceOp, delta) => usage.push({ resourceOp, delta }),
      clients: underlying,
    }),
  }
}

describe('createResourceClientFactory', () => {
  let h: Harness

  afterEach(async () => {
    await closeDatabase(h.db)
  })

  it('exposes only the declared operations', async () => {
    h = await setup()
    const make = createResourceClientFactory(h.factoryDeps())
    const gmail = make('gmail_api', ['apply_label'])
    expect(typeof gmail.apply_label).toBe('function')
    expect((gmail as unknown as Record<string, unknown>).send_message).toBeUndefined()
    expect((gmail as unknown as Record<string, unknown>).fetch_metadata).toBeUndefined()
  })

  it('on success returns the value, pushes resource_op_succeeded, records usage', async () => {
    h = await setup()
    const make = createResourceClientFactory(h.factoryDeps())
    const llm = make('llm_bedrock', ['invoke_model'])
    const result = await llm.invoke_model({ modelId: 'm', prompt: 'p' })

    expect(result.outcome).toBe('succeeded')
    if (result.outcome === 'succeeded') {
      expect(result.value.text).toBe('spam')
      expect(result.value.usage).toEqual({ inputTokens: 10, outputTokens: 2 })
    }
    expect(h.underlying.llm_bedrock.invoke_model).toHaveBeenCalledTimes(1)

    const ev = h.events.at(-1)
    expect(ev?.event_type).toBe('resource_op_succeeded')
    expect(ev?.details).toMatchObject({
      resource: 'llm_bedrock',
      operation: 'invoke_model',
      tokens_in: 10,
      tokens_out: 2,
      cost_usd_micros: 42,
    })
    expect(h.usage).toContainEqual({
      resourceOp: 'llm_bedrock.invoke_model',
      delta: {
        calls: 1,
        succeeded: 1,
        tokens_in: 10,
        tokens_out: 2,
        cost_usd_micros: 42,
      },
    })
  })

  it('skipped_by_limit short-circuits BEFORE the underlying op', async () => {
    h = await setup()
    const make = createResourceClientFactory(h.factoryDeps())
    const pushover = make('pushover_api', ['send_notification'])

    // per_message cap is 1. First call succeeds, second is skipped.
    const first = await pushover.send_notification({ message: 'a' })
    expect(first.outcome).toBe('succeeded')
    const second = await pushover.send_notification({ message: 'b' })
    expect(second.outcome).toBe('skipped_by_limit')
    if (second.outcome === 'skipped_by_limit') {
      expect(second.scope).toBe('per_message')
      expect(typeof second.limit_id).toBe('number')
    }
    // Underlying called exactly once (only for the allowed first call).
    expect(h.underlying.pushover_api.send_notification).toHaveBeenCalledTimes(1)

    const limitedEvent = h.events.find((e) => e.event_type === 'resource_op_limited')
    expect(limitedEvent?.details).toMatchObject({
      resource: 'pushover_api',
      operation: 'send_notification',
      scope: 'per_message',
    })
    expect(h.usage).toContainEqual({
      resourceOp: 'pushover_api.send_notification',
      delta: { calls: 1, skipped_by_limit: 1 },
    })
  })

  it('on failure returns failed and pushes resource_op_failed', async () => {
    h = await setup({
      gmail_api: {
        apply_label: vi.fn(async () => {
          throw new Error('boom')
        }),
        send_message: vi.fn(),
        fetch_metadata: vi.fn(),
        list_messages: vi.fn(),
      },
    })
    const make = createResourceClientFactory(h.factoryDeps())
    const gmail = make('gmail_api', ['apply_label'])
    const result = await gmail.apply_label({
      backendMessageId: 'm',
      label: 'L',
    })
    expect(result.outcome).toBe('failed')
    if (result.outcome === 'failed') {
      expect(result.error.message).toBe('boom')
    }

    const failed = h.events.find((e) => e.event_type === 'resource_op_failed')
    expect(failed?.details).toMatchObject({
      resource: 'gmail_api',
      operation: 'apply_label',
      error: 'boom',
    })
    // apply_label retries 2x → 3 underlying attempts.
    expect(h.underlying.gmail_api.apply_label).toHaveBeenCalledTimes(3)

    // The Limit is consumed exactly ONCE despite the 3 underlying attempts: the
    // gmail_api.apply_label per_window counter increments by 1, not by 3.
    const limit = await h.db
      .selectFrom('limits')
      .select('id')
      .where('resource', '=', 'gmail_api')
      .where('operation', '=', 'apply_label')
      .where('scope', '=', 'per_window')
      .executeTakeFirstOrThrow()
    const counter = await h.db
      .selectFrom('limit_counters_window')
      .select('count')
      .where('limit_id', '=', limit.id)
      .executeTakeFirstOrThrow()
    expect(counter.count).toBe(1)
    // And the usage delta records a single call attempt (not one per retry).
    const callDeltas = h.usage.filter((u) => u.resourceOp === 'gmail_api.apply_label')
    expect(callDeltas).toHaveLength(1)
    expect(callDeltas[0]?.delta).toEqual({ calls: 1 })
  })
})
