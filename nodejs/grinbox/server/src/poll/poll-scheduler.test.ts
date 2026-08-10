import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../config.js'
import { closeDatabase } from '../db/connection.js'
import type { Database } from '../db/schema.js'
import { freshDb } from '../pipeline/test-helpers.js'
import type {
  CandidateListing,
  Category,
  FetchedMessage,
  Provider,
  ProviderAccount,
  ThreadMembership,
} from '../providers/provider.js'
import { createPollScheduler } from './poll-scheduler.js'
import type { ProviderFactory } from './provider-factory.js'
import { StubProvider, seedAccount, seedPipeline, seedUser } from './test-support.js'

/** A deferred promise handle for driving the slow-poll overlap test. */
function defer(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/**
 * Yield to the event loop until `predicate()` holds, draining microtasks +
 * macrotasks deterministically (no fake/real timers, no wall-clock waiting). The
 * first poll cycle does an async DB select before reaching the gated provider,
 * so the test must let those turns run before asserting it is in flight. The
 * bound guards against an infinite loop if the predicate never becomes true.
 */
async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 1000; i++) {
    if (predicate()) {
      return
    }
    await new Promise<void>((res) => setImmediate(res))
  }
  throw new Error('waitUntil: predicate never became true')
}

/**
 * A {@link Provider} whose `listCandidates` blocks on an injected gate until it
 * is manually resolved, so a test can hold one poll cycle in flight while
 * invoking the guarded entry point a second time. Counts its calls.
 */
class GatedProvider implements Provider {
  listCandidatesCalls = 0
  constructor(private readonly gate: Promise<void>) {}

  async listCandidates(_account: ProviderAccount, _cursor: string | null): Promise<CandidateListing> {
    this.listCandidatesCalls++
    await this.gate
    return { backendMessageIds: [], newCursor: 'H1' }
  }
  async fetchMetadata(_account: ProviderAccount, backendMessageId: string): Promise<FetchedMessage> {
    return {
      backendMessageId,
      backendThreadId: null,
      from: null,
      to: 'me@example.com',
      subject: null,
      snippet: null,
      receivedAt: 5000,
      headers: {},
      bodyFetched: false,
    }
  }
  async applyCategory(): Promise<void> {}
  async threadMembership(): Promise<ThreadMembership> {
    return { backendThreadId: null, isReply: false, messageCount: 0 }
  }
  async reconcile() {
    return { presentBackendIds: [] }
  }
}

/**
 * `pollDueAccounts` due-selection tests. Driven directly (never `start()`), with
 * an injected `now` so interval math is deterministic. A factory that returns a
 * fresh StubProvider per Account; some tests return `null` to assert skipping.
 */

function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    dbPath: ':memory:',
    httpPort: 8787,
    httpHost: '127.0.0.1',
    tokenEncKey: Buffer.alloc(32),
    operatorTimeoutMs: 30_000,
    workerPoolSize: 3,
    pollSchedulerTickSeconds: 60,
    reconcileIntervalSeconds: 86_400,
    ...overrides,
  } as Config
}

describe('createPollScheduler — pollDueAccounts', () => {
  let db: Kysely<Database>
  let userId: number
  let pipelineId: number

  beforeEach(async () => {
    db = await freshDb()
    userId = await seedUser(db)
    pipelineId = await seedPipeline(db, userId)
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  function factoryFor(provider: Provider): ProviderFactory {
    return () => provider
  }

  it('runs reconcile on first poll (never reconciled) and skips it until the interval elapses', async () => {
    const accountId = await seedAccount(db, userId, {
      activePipelineId: pipelineId,
      pollIntervalSeconds: 60, // minimum allowed; re-poll 60s later
      lastPolledAt: null,
    })
    // A known present row absent from the (empty) snapshot must be archived.
    await db
      .insertInto('messages')
      .values({
        account_id: accountId,
        backend_message_id: 'm1',
        created_at: 1000,
        source_state: 'present',
      })
      .execute()

    const provider = new StubProvider([{ backendMessageIds: [], newCursor: 'H1' }], [])
    provider.reconcilePresentIds = [] // inbox is empty per the snapshot
    const scheduler = createPollScheduler({
      db,
      config: testConfig({ reconcileIntervalSeconds: 86_400 }),
      providerFactory: factoryFor(provider),
    })

    await scheduler.pollDueAccounts(10_000)
    expect(provider.reconcileCalls).toBe(1)

    const afterFirst = await db
      .selectFrom('accounts')
      .select('last_reconciled_at')
      .where('id', '=', accountId)
      .executeTakeFirstOrThrow()
    expect(afterFirst.last_reconciled_at).toBe(10_000)

    const m1 = await db
      .selectFrom('messages')
      .select('source_state')
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow()
    expect(m1.source_state).toBe('archived')

    // A second poll (due again) but within the reconcile interval does NOT
    // reconcile again.
    await scheduler.pollDueAccounts(10_060)
    expect(provider.reconcileCalls).toBe(1)
    const afterSecond = await db
      .selectFrom('accounts')
      .select('last_reconciled_at')
      .where('id', '=', accountId)
      .executeTakeFirstOrThrow()
    expect(afterSecond.last_reconciled_at).toBe(10_000)
  })

  it('resyncAllNow force-resyncs eligible accounts (archives a present row absent from the snapshot)', async () => {
    const accountId = await seedAccount(db, userId, {
      activePipelineId: pipelineId,
      lastPolledAt: 5000, // not due for a scheduled poll, but resync ignores that
    })
    await db
      .insertInto('messages')
      .values({
        account_id: accountId,
        backend_message_id: 'gone',
        created_at: 1000,
        source_state: 'present',
      })
      .execute()

    const provider = new StubProvider([], [])
    provider.reconcilePresentIds = [] // inbox is empty per the snapshot
    const scheduler = createPollScheduler({
      db,
      config: testConfig(),
      providerFactory: factoryFor(provider),
    })

    const summaries = await scheduler.resyncAllNow(10_000)
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({ archived: 1, newMessages: 0 })

    const row = await db
      .selectFrom('messages')
      .select('source_state')
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow()
    expect(row.source_state).toBe('archived')
  })

  it('polls a never-polled account with an active pipeline', async () => {
    const accountId = await seedAccount(db, userId, {
      activePipelineId: pipelineId,
      lastPolledAt: null,
    })
    const provider = new StubProvider(
      [{ backendMessageIds: ['m1'], newCursor: 'H1' }],
      [{ id: 'm1', subject: 's', from: 'a@x.com' }],
    )
    const scheduler = createPollScheduler({
      db,
      config: testConfig(),
      providerFactory: factoryFor(provider),
    })

    const summaries = await scheduler.pollDueAccounts(10_000)
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({ accountId, enqueued: 1 })
  })

  it('skips an account whose interval has not elapsed; polls one that has', async () => {
    // Account A: polled recently (now - last = 100 < 600) → not due.
    const aId = await seedAccount(db, userId, {
      activePipelineId: pipelineId,
      pollIntervalSeconds: 600,
      lastPolledAt: 9_900,
      name: 'A',
    })
    // Account B: polled long ago (now - last = 700 >= 600) → due.
    const bId = await seedAccount(db, userId, {
      activePipelineId: pipelineId,
      pollIntervalSeconds: 600,
      lastPolledAt: 9_300,
      name: 'B',
    })
    const provider = new StubProvider([{ backendMessageIds: [], newCursor: 'H1' }], [])
    const scheduler = createPollScheduler({
      db,
      config: testConfig(),
      providerFactory: factoryFor(provider),
    })

    const summaries = await scheduler.pollDueAccounts(10_000)
    const polledIds = summaries.map((s) => s.accountId)
    expect(polledIds).toContain(bId)
    expect(polledIds).not.toContain(aId)
  })

  it('skips accounts with active_pipeline_id = NULL', async () => {
    await seedAccount(db, userId, {
      activePipelineId: null,
      lastPolledAt: null,
      name: 'no-pipeline',
    })
    const provider = new StubProvider(
      [{ backendMessageIds: ['m1'], newCursor: 'H1' }],
      [{ id: 'm1', subject: 's', from: 'a@x.com' }],
    )
    const scheduler = createPollScheduler({
      db,
      config: testConfig(),
      providerFactory: factoryFor(provider),
    })

    const summaries = await scheduler.pollDueAccounts(10_000)
    expect(summaries).toHaveLength(0)
  })

  it('skips accounts the factory returns null for', async () => {
    await seedAccount(db, userId, {
      activePipelineId: pipelineId,
      lastPolledAt: null,
    })
    const nullFactory: ProviderFactory = () => null
    const scheduler = createPollScheduler({
      db,
      config: testConfig(),
      providerFactory: nullFactory,
    })

    const summaries = await scheduler.pollDueAccounts(10_000)
    expect(summaries).toHaveLength(0)
  })

  it('isolates a per-account failure: one account throwing does not abort the others', async () => {
    // Two due accounts; the provider for the first throws inside listCandidates.
    // The cycle must log + continue, returning a summary for the healthy one.
    // Deleting the try/catch in runPollCycle would let the throw abort the cycle
    // and this assertion (a summary for `healthyId`) would fail.
    const failingId = await seedAccount(db, userId, {
      activePipelineId: pipelineId,
      lastPolledAt: null,
      name: 'failing',
    })
    const healthyId = await seedAccount(db, userId, {
      activePipelineId: pipelineId,
      lastPolledAt: null,
      name: 'healthy',
    })

    const healthy = new StubProvider([{ backendMessageIds: [], newCursor: 'H1' }], [])
    const failing: Provider = {
      listCandidates: async () => {
        throw new Error('provider exploded')
      },
      fetchMetadata: async () => {
        throw new Error('unused')
      },
      applyCategory: async () => {},
      threadMembership: async () => ({
        backendThreadId: null,
        isReply: false,
        messageCount: 0,
      }),
      reconcile: async () => ({ presentBackendIds: [] }),
    }
    const factory: ProviderFactory = (account) => (account.id === failingId ? failing : healthy)

    const scheduler = createPollScheduler({
      db,
      config: testConfig(),
      providerFactory: factory,
    })

    const summaries = await scheduler.pollDueAccounts(10_000)
    const polledIds = summaries.map((s) => s.accountId)
    // The healthy account was still polled despite the other's failure.
    expect(polledIds).toContain(healthyId)
    expect(polledIds).not.toContain(failingId)
  })

  it('interval boundary: an account due at exactly delta == interval is polled (<= not <)', async () => {
    // last_polled_at + interval == now → due per the `<=` comparison. A `<`
    // mutant would skip the account exactly at the boundary.
    const id = await seedAccount(db, userId, {
      activePipelineId: pipelineId,
      pollIntervalSeconds: 600,
      lastPolledAt: 9_400, // 9_400 + 600 == 10_000
    })
    const provider = new StubProvider([{ backendMessageIds: [], newCursor: 'H1' }], [])
    const scheduler = createPollScheduler({
      db,
      config: testConfig(),
      providerFactory: factoryFor(provider),
    })

    const summaries = await scheduler.pollDueAccounts(10_000)
    expect(summaries.map((s) => s.accountId)).toContain(id)
  })

  it('interval boundary: one second before the edge (delta == interval - 1) is NOT polled', async () => {
    const id = await seedAccount(db, userId, {
      activePipelineId: pipelineId,
      pollIntervalSeconds: 600,
      lastPolledAt: 9_401, // 9_401 + 600 == 10_001 > 10_000 → not due
    })
    const provider = new StubProvider([{ backendMessageIds: [], newCursor: 'H1' }], [])
    const scheduler = createPollScheduler({
      db,
      config: testConfig(),
      providerFactory: factoryFor(provider),
    })

    const summaries = await scheduler.pollDueAccounts(10_000)
    expect(summaries.map((s) => s.accountId)).not.toContain(id)
  })

  it('start()/stop() construct a valid croner job across the configurable tick range', () => {
    const provider = new StubProvider([{ backendMessageIds: [], newCursor: 'H1' }], [])
    // Sub-minute, whole-minute, and >59 ticks must all yield a valid pattern
    // (croner caps the seconds-field step at 60, so >59 must map to minutes).
    for (const tick of [15, 60, 600]) {
      const scheduler = createPollScheduler({
        db,
        config: testConfig({ pollSchedulerTickSeconds: tick }),
        providerFactory: () => provider,
      })
      expect(() => {
        scheduler.start()
      }).not.toThrow()
      expect(() => {
        scheduler.stop()
      }).not.toThrow()
      // stop() is idempotent.
      expect(() => {
        scheduler.stop()
      }).not.toThrow()
    }
  })

  it('skips soft-deleted accounts', async () => {
    const id = await seedAccount(db, userId, {
      activePipelineId: pipelineId,
      lastPolledAt: null,
    })
    await db.updateTable('accounts').set({ deleted_at: 5_000 }).where('id', '=', id).execute()
    const provider = new StubProvider([{ backendMessageIds: [], newCursor: 'H1' }], [])
    const scheduler = createPollScheduler({
      db,
      config: testConfig(),
      providerFactory: factoryFor(provider),
    })

    const summaries = await scheduler.pollDueAccounts(10_000)
    expect(summaries).toHaveLength(0)
  })

  it('in-flight guard: an overlapping tick is a no-op; runs again once the cycle clears', async () => {
    await seedAccount(db, userId, {
      activePipelineId: pipelineId,
      lastPolledAt: null,
    })
    // First cycle blocks inside listCandidates until we resolve the gate.
    const gate = defer()
    const provider = new GatedProvider(gate.promise)
    const scheduler = createPollScheduler({
      db,
      config: testConfig(),
      providerFactory: () => provider,
    })

    // Start the first cycle (it will hang on the gate) — do NOT await it yet.
    const first = scheduler.pollDueAccounts(10_000)
    // Drain the event loop until the cycle reaches the gated listCandidates
    // (it runs an async DB select first); then it is provably in flight.
    await waitUntil(() => provider.listCandidatesCalls === 1)
    expect(provider.listCandidatesCalls).toBe(1)

    // Second tick while the first is still in flight: must be a no-op (the
    // underlying cycle does not run again, so no concurrent re-poll).
    const second = await scheduler.pollDueAccounts(10_000)
    expect(second).toEqual([])
    expect(provider.listCandidatesCalls).toBe(1)

    // Let the first cycle finish; the guard clears.
    gate.resolve()
    const firstResult = await first
    expect(firstResult).toHaveLength(1)

    // A subsequent tick runs again (guard cleared). last_polled_at was advanced
    // to now=10_000, so re-poll at a later now is due.
    const third = await scheduler.pollDueAccounts(20_000)
    expect(third).toHaveLength(1)
    expect(provider.listCandidatesCalls).toBe(2)
  })
})
