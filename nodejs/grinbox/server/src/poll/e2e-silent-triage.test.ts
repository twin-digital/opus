import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../config.js'
import { closeDatabase } from '../db/connection.js'
import type { Database } from '../db/schema.js'
import { seedDefaultLimits } from '../db/seed.js'
import { createExecutionLoop } from '../execution/execution-loop.js'
import { createOperator } from '../pipeline/operator-save.js'
import { freshDb, taggerConfig } from '../pipeline/test-helpers.js'
import type { UnderlyingClients } from '../resources/make-resource-client.js'
import { staticMakeUnderlyingClients } from '../resources/underlying-clients.js'
import { createPollScheduler } from './poll-scheduler.js'
import type { ProviderFactory } from './provider-factory.js'
import { StubProvider, seedAccount, seedPipeline, seedUser } from './test-support.js'

/**
 * End-to-end silent-triage integration test — the proof that the full vertical
 * (poll → enqueue → execute → tag → persist) runs with stubs and no external
 * credentials.
 *
 * Real pieces assembled:
 *  - a migrated in-memory State DB,
 *  - a seeded User + Account + Pipeline with a real Rule-based Tagger Operator
 *    (declares no Resources, so the loop runs it without any external client),
 *  - the REAL `createExecutionLoop` over "not configured" no-op underlying
 *    clients (they throw if touched — a Rule-based pipeline never does),
 *  - the REAL `createPollScheduler`,
 *  - a STUB Provider yielding fixture Messages.
 *
 * Determinism: the poll loop is driven via `pollDueAccounts()` (no cron), and
 * the execution loop via `runUntilIdle()` (no timers). Nothing waits on real
 * time.
 */

/** Underlying clients that throw if any operation is invoked — mirrors the
 * daemon's `notConfiguredClients`. A Rule-based pipeline never touches them. */
function notConfiguredClients(): UnderlyingClients {
  const fail = (op: string) => () => {
    throw new Error(`${op} invoked but no Resource client is configured`)
  }
  return {
    llm_bedrock: { invoke_model: fail('llm_bedrock.invoke_model') },
    gmail_api: {
      apply_label: fail('gmail_api.apply_label'),
      send_message: fail('gmail_api.send_message'),
      fetch_metadata: fail('gmail_api.fetch_metadata'),
      list_messages: fail('gmail_api.list_messages'),
    },
    pushover_api: { send_notification: fail('pushover_api.send_notification') },
  }
}

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

describe('end-to-end silent triage (poll → enqueue → execute → tag → persist)', () => {
  let db: Kysely<Database>
  let userId: number
  let pipelineId: number
  let accountId: number

  beforeEach(async () => {
    db = await freshDb()
    userId = await seedUser(db)
    await seedDefaultLimits(db, userId)
    pipelineId = await seedPipeline(db, userId)
    accountId = await seedAccount(db, userId, {
      activePipelineId: pipelineId,
      pollIntervalSeconds: 600,
      lastPolledAt: null,
    })
    // A real Rule-based Tagger: empty rule list → fallback 'no' for every
    // Message. No Resources declared, so it runs against the no-op clients.
    await createOperator(db, {
      pipelineId,
      name: 'urgency-tagger',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: true,
      actorUserId: null,
    })
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('polls stub messages, enqueues + executes Triages, persists Tags, and respects the cursor on a second poll', async () => {
    const fixtures = [
      { id: 'g1', subject: 'Invoice due', from: 'billing@vendor.com' },
      { id: 'g2', subject: 'Lunch?', from: 'friend@x.com' },
      { id: 'g3', subject: 'Newsletter', from: 'news@list.com' },
    ]
    // First poll yields all three; a later (re-used) page yields nothing new.
    const provider = new StubProvider(
      [
        { backendMessageIds: ['g1', 'g2', 'g3'], newCursor: 'H100' },
        { backendMessageIds: [], newCursor: 'H100' },
      ],
      fixtures,
    )
    const factory: ProviderFactory = () => provider

    const scheduler = createPollScheduler({
      db,
      config: testConfig(),
      providerFactory: factory,
    })
    const executionLoop = createExecutionLoop({
      db,
      config: testConfig(),
      makeClients: staticMakeUnderlyingClients(notConfiguredClients()),
    })

    // --- 1. First poll: messages upserted, cursor + last_polled_at advanced,
    //        one Triage enqueued per message. ---
    const summaries = await scheduler.pollDueAccounts(10_000)
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({
      candidates: 3,
      newMessages: 3,
      enqueued: 3,
    })

    const messages = await db
      .selectFrom('messages')
      .select(['id', 'backend_message_id'])
      .where('account_id', '=', accountId)
      .execute()
    expect(messages).toHaveLength(3)

    const acct1 = await db
      .selectFrom('accounts')
      .select(['last_history_cursor', 'last_polled_at'])
      .where('id', '=', accountId)
      .executeTakeFirstOrThrow()
    expect(acct1.last_history_cursor).toBe('H100')
    expect(acct1.last_polled_at).toBe(10_000)

    const enqueued = await db
      .selectFrom('triages')
      .select(['id', 'message_id', 'status', 'triggered_by'])
      .where('pipeline_id', '=', pipelineId)
      .execute()
    expect(enqueued).toHaveLength(3)
    for (const t of enqueued) {
      expect(t.triggered_by).toBe('message_arrival')
      expect(t.status).toBe('running') // not yet executed
    }

    // --- 2. Drive the execution loop to settlement: Tagger output Tags
    //        persisted, current_triages populated, Triages completed. ---
    await executionLoop.runUntilIdle()
    await executionLoop.stop()

    const tags = await db
      .selectFrom('tags')
      .select(['triage_id', 'key', 'value'])
      .where('key', '=', 'urgency')
      .execute()
    expect(tags).toHaveLength(3)
    for (const tag of tags) {
      expect(tag.value).toBe('no') // fallback
    }

    const settled = await db.selectFrom('triages').select(['status']).where('pipeline_id', '=', pipelineId).execute()
    expect(settled.every((t) => t.status === 'completed')).toBe(true)

    const current = await db
      .selectFrom('current_triages')
      .select(['message_id', 'triage_id'])
      .where('pipeline_id', '=', pipelineId)
      .execute()
    expect(current).toHaveLength(3)

    // Assert *which* triage each current_triages row points at: the completed
    // Triage for that exact (pipeline, message). A settlement writing the wrong
    // triage into the cache would slip past a bare row-count check.
    const triageRows = await db
      .selectFrom('triages')
      .select(['id', 'message_id', 'status'])
      .where('pipeline_id', '=', pipelineId)
      .execute()
    const triageByMessage = new Map(triageRows.map((t) => [t.message_id, t.id]))
    for (const row of current) {
      expect(row.triage_id).toBe(triageByMessage.get(row.message_id))
    }
    // Each message has exactly one Triage here, so the cache points at it.
    expect(triageByMessage.size).toBe(3)

    // --- 3. A second poll with no new candidates enqueues nothing (cursor
    //        respected), and an interval-not-elapsed account is skipped. ---
    // last_polled_at is now 10_000; at now=10_100 (delta 100 < 600) → not due.
    const tooSoon = await scheduler.pollDueAccounts(10_100)
    expect(tooSoon).toHaveLength(0)

    // At now=10_700 (delta 700 >= 600) the account is due again, but the stub's
    // next page has no candidates → nothing enqueued.
    const dueAgain = await scheduler.pollDueAccounts(10_700)
    expect(dueAgain).toHaveLength(1)
    expect(dueAgain[0]).toMatchObject({ candidates: 0, enqueued: 0 })

    const triageCount = await db
      .selectFrom('triages')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow()
    expect(triageCount.n).toBe(3) // still 3 — no new Triages
  })
})
