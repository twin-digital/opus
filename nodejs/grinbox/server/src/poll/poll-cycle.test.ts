import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase } from '../db/connection.js'
import type { Database } from '../db/schema.js'
import { freshDb } from '../pipeline/test-helpers.js'
import type { CandidateListing, FetchedMessage, Provider, ProviderAccount } from '../providers/provider.js'
import { type PollableAccount, pollAccount, reconcileAccount, resyncAccount } from './poll-cycle.js'
import { StubProvider, seedAccount, seedPipeline, seedUser } from './test-support.js'

/**
 * `pollAccount` unit tests over a migrated in-memory DB and a stub Provider.
 * Cover the cursor + last_polled_at advance, `isNew` enqueue gating, per-Message
 * error isolation, and the `listCandidates`-failure cursor-unadvanced contract.
 */

describe('pollAccount', () => {
  let db: Kysely<Database>
  let pipelineId: number
  let accountId: number

  beforeEach(async () => {
    db = await freshDb()
    const userId = await seedUser(db)
    pipelineId = await seedPipeline(db, userId)
    accountId = await seedAccount(db, userId, { activePipelineId: pipelineId })
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  async function loadAccount(): Promise<PollableAccount> {
    const row = await db.selectFrom('accounts').selectAll().where('id', '=', accountId).executeTakeFirstOrThrow()
    return {
      id: row.id,
      providerType: row.provider_type,
      activePipelineId: row.active_pipeline_id as number,
      settingsJson: row.settings_json,
      lastHistoryCursor: row.last_history_cursor,
      lastPolledAt: row.last_polled_at,
      lastReconciledAt: row.last_reconciled_at,
    }
  }

  it('upserts messages, enqueues a Triage per new message, advances cursor + last_polled_at atomically', async () => {
    const provider = new StubProvider(
      [{ backendMessageIds: ['m1', 'm2'], newCursor: 'H10' }],
      [
        { id: 'm1', subject: 's1', from: 'a@x.com' },
        { id: 'm2', subject: 's2', from: 'b@x.com' },
      ],
    )

    const summary = await pollAccount(db, await loadAccount(), provider, 7000)

    expect(summary).toMatchObject({
      candidates: 2,
      newMessages: 2,
      enqueued: 2,
      failedMessages: 0,
    })

    const messages = await db
      .selectFrom('messages')
      .select(['backend_message_id'])
      .where('account_id', '=', accountId)
      .execute()
    expect(messages.map((m) => m.backend_message_id).sort()).toEqual(['m1', 'm2'])

    const triages = await db
      .selectFrom('triages')
      .select(['triggered_by', 'actor_user_id'])
      .where('pipeline_id', '=', pipelineId)
      .execute()
    expect(triages).toHaveLength(2)
    for (const t of triages) {
      expect(t.triggered_by).toBe('message_arrival')
      expect(t.actor_user_id).toBeNull()
    }

    const account = await loadAccount()
    expect(account.lastHistoryCursor).toBe('H10')
    expect(account.lastPolledAt).toBe(7000)
  })

  it('does not re-enqueue an already-known message (isNew gating)', async () => {
    const provider = new StubProvider(
      [
        { backendMessageIds: ['m1'], newCursor: 'H1' },
        // Second poll re-lists m1 (e.g. cursor unadvanced earlier) → not new.
        { backendMessageIds: ['m1'], newCursor: 'H2' },
      ],
      [{ id: 'm1', subject: 's1', from: 'a@x.com' }],
    )

    const first = await pollAccount(db, await loadAccount(), provider, 7000)
    expect(first.enqueued).toBe(1)

    const second = await pollAccount(db, await loadAccount(), provider, 8000)
    expect(second).toMatchObject({ candidates: 1, newMessages: 0, enqueued: 0 })

    const triages = await db
      .selectFrom('triages')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow()
    expect(triages.n).toBe(1)

    // Cursor still advanced on the second (no-new) poll.
    const account = await loadAccount()
    expect(account.lastHistoryCursor).toBe('H2')
    expect(account.lastPolledAt).toBe(8000)
  })

  it('isolates a per-message fetch error: the cycle continues and the cursor still advances', async () => {
    // Stub Provider that throws on fetchMetadata for m2 only.
    const provider: Provider = {
      listCandidates: async (): Promise<CandidateListing> => ({
        backendMessageIds: ['m1', 'm2', 'm3'],
        newCursor: 'H9',
      }),
      fetchMetadata: async (_a: ProviderAccount, id: string): Promise<FetchedMessage> => {
        if (id === 'm2') {
          throw new Error('transient fetch failure')
        }
        return {
          backendMessageId: id,
          backendThreadId: null,
          from: null,
          to: null,
          subject: id,
          snippet: null,
          receivedAt: 5000,
          headers: {},
          bodyFetched: false,
        }
      },
      applyCategory: async () => {},
      threadMembership: async () => ({
        backendThreadId: null,
        isReply: false,
        messageCount: 0,
      }),
      reconcile: async () => ({ presentBackendIds: [] }),
    }

    const summary = await pollAccount(db, await loadAccount(), provider, 7000)
    expect(summary).toMatchObject({
      candidates: 3,
      newMessages: 2,
      enqueued: 2,
      failedMessages: 1,
    })

    const messages = await db
      .selectFrom('messages')
      .select(['backend_message_id'])
      .where('account_id', '=', accountId)
      .execute()
    expect(messages.map((m) => m.backend_message_id).sort()).toEqual(['m1', 'm3'])

    // Cursor still advances despite the one per-message failure.
    const account = await loadAccount()
    expect(account.lastHistoryCursor).toBe('H9')
    expect(account.lastPolledAt).toBe(7000)
  })

  it('crash-safety: the cursor is NOT advanced while candidates are still being enqueued', async () => {
    // The load-bearing invariant: the cursor must never advance past Messages
    // whose arrival is not yet durably enqueued. We observe ordering by reading
    // the stored cursor *during* each fetchMetadata: at that point the cursor
    // must still be the pre-poll value. Moving the cursor-advance before the
    // candidate loop would make these in-loop reads see 'H_new' and fail.
    const seenCursorsDuringLoop: (string | null)[] = []
    const provider: Provider = {
      listCandidates: async (): Promise<CandidateListing> => ({
        backendMessageIds: ['m1', 'm2'],
        newCursor: 'H_new',
      }),
      fetchMetadata: async (_a: ProviderAccount, id: string): Promise<FetchedMessage> => {
        const row = await db
          .selectFrom('accounts')
          .select('last_history_cursor')
          .where('id', '=', accountId)
          .executeTakeFirstOrThrow()
        seenCursorsDuringLoop.push(row.last_history_cursor)
        return {
          backendMessageId: id,
          backendThreadId: null,
          from: null,
          to: null,
          subject: id,
          snippet: null,
          receivedAt: 5000,
          headers: {},
          bodyFetched: false,
        }
      },
      applyCategory: async () => {},
      threadMembership: async () => ({
        backendThreadId: null,
        isReply: false,
        messageCount: 0,
      }),
      reconcile: async () => ({ presentBackendIds: [] }),
    }

    const account = await loadAccount()
    expect(account.lastHistoryCursor).toBeNull() // pre-poll value

    await pollAccount(db, account, provider, 7000)

    // Every in-loop observation saw the OLD cursor (null), proving the advance
    // happens only after all candidates were processed.
    expect(seenCursorsDuringLoop).toEqual([null, null])

    // And the cursor is advanced once the cycle completes.
    const after = await loadAccount()
    expect(after.lastHistoryCursor).toBe('H_new')
  })

  it('leaves the cursor unadvanced when listCandidates fails', async () => {
    const provider: Provider = {
      listCandidates: async () => {
        throw new Error('history list failed')
      },
      fetchMetadata: vi.fn(),
      applyCategory: async () => {},
      threadMembership: vi.fn(),
    } as unknown as Provider

    await expect(pollAccount(db, await loadAccount(), provider, 7000)).rejects.toThrow('history list failed')

    const account = await loadAccount()
    expect(account.lastHistoryCursor).toBeNull()
    expect(account.lastPolledAt).toBeNull()

    const triages = await db
      .selectFrom('triages')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow()
    expect(triages.n).toBe(0)
  })

  it('applies source-state deltas to existing rows (and ignores deltas for unknown messages)', async () => {
    // Two known rows, both present; a third delta targets a Message we never
    // ingested and must be a no-op.
    for (const id of ['m1', 'm2']) {
      await db
        .insertInto('messages')
        .values({
          account_id: accountId,
          backend_message_id: id,
          created_at: 1000,
          source_state: 'present',
        })
        .execute()
    }

    const provider = new StubProvider(
      [
        {
          backendMessageIds: [],
          newCursor: 'H20',
          stateDeltas: [
            { backendMessageId: 'm1', state: 'archived' },
            { backendMessageId: 'm2', state: 'trashed' },
            { backendMessageId: 'mX', state: 'deleted' },
          ],
        },
      ],
      [],
    )

    const summary = await pollAccount(db, await loadAccount(), provider, 8000)
    expect(summary.stateUpdated).toBe(2)

    const rows = await db
      .selectFrom('messages')
      .select(['backend_message_id', 'source_state', 'source_state_at', 'source_synced_at'])
      .where('account_id', '=', accountId)
      .orderBy('backend_message_id')
      .execute()
    expect(rows).toEqual([
      {
        backend_message_id: 'm1',
        source_state: 'archived',
        source_state_at: 8000,
        source_synced_at: 8000,
      },
      {
        backend_message_id: 'm2',
        source_state: 'trashed',
        source_state_at: 8000,
        source_synced_at: 8000,
      },
    ])

    // Re-applying the same delta is an idempotent no-op (the `!= state` guard).
    const again = await pollAccount(db, await loadAccount(), provider, 9000)
    expect(again.stateUpdated).toBe(0)
  })

  it('reconcileAccount aligns known rows to the inbox snapshot (archive departed, restore returned)', async () => {
    const seed: [string, 'present' | 'archived'][] = [
      ['m1', 'present'], // stays present (in snapshot)
      ['m2', 'present'], // departs (absent from snapshot) → archived
      ['m3', 'archived'], // returns (in snapshot) → present
    ]
    for (const [id, state] of seed) {
      await db
        .insertInto('messages')
        .values({
          account_id: accountId,
          backend_message_id: id,
          created_at: 1000,
          source_state: state,
        })
        .execute()
    }

    const provider = new StubProvider([], [])
    provider.reconcilePresentIds = ['m1', 'm3']

    const summary = await reconcileAccount(
      db,
      { id: accountId, settingsJson: '{}', lastPolledAt: null },
      provider,
      8000,
    )
    expect(summary).toEqual({ accountId, archived: 1, restored: 1 })

    const rows = await db
      .selectFrom('messages')
      .select(['backend_message_id', 'source_state'])
      .where('account_id', '=', accountId)
      .orderBy('backend_message_id')
      .execute()
    expect(rows).toEqual([
      { backend_message_id: 'm1', source_state: 'present' },
      { backend_message_id: 'm2', source_state: 'archived' },
      { backend_message_id: 'm3', source_state: 'present' },
    ])
  })

  it('resyncAccount refreshes existing rows, backfills + triages new ones, and archives departed', async () => {
    // 'keep': already known + present (in snapshot) → refreshed, not re-triaged.
    await db
      .insertInto('messages')
      .values({
        account_id: accountId,
        backend_message_id: 'keep',
        created_at: 1000,
        received_at: 1000, // stale; the re-fetch fixture carries 5000
        source_state: 'present',
      })
      .execute()
    // 'gone': known + present but NOT in the snapshot → archived.
    await db
      .insertInto('messages')
      .values({
        account_id: accountId,
        backend_message_id: 'gone',
        created_at: 1000,
        source_state: 'present',
      })
      .execute()

    // Snapshot = the live inbox: 'keep' (existing) + 'new1' (never ingested).
    const provider = new StubProvider(
      [],
      [
        { id: 'keep', subject: 'keep subj', from: 'a@x.com' },
        { id: 'new1', subject: 'new subj', from: 'b@x.com' },
      ],
    )
    provider.reconcilePresentIds = ['keep', 'new1']

    const summary = await resyncAccount(db, await loadAccount(), provider, 5000)
    expect(summary).toMatchObject({
      refetched: 2,
      newMessages: 1,
      enqueued: 1,
      failedMessages: 0,
      archived: 1,
      restored: 0,
    })

    const rows = await db
      .selectFrom('messages')
      .select(['backend_message_id', 'source_state', 'received_at'])
      .where('account_id', '=', accountId)
      .orderBy('backend_message_id')
      .execute()
    expect(rows).toEqual([
      // departed → archived
      {
        backend_message_id: 'gone',
        source_state: 'archived',
        received_at: null,
      },
      // existing → refreshed metadata (received_at corrected from the fetch)
      {
        backend_message_id: 'keep',
        source_state: 'present',
        received_at: 5000,
      },
      // backfilled → present
      {
        backend_message_id: 'new1',
        source_state: 'present',
        received_at: 5000,
      },
    ])

    // Only the genuinely-new message was triaged.
    const triages = await db
      .selectFrom('triages')
      .innerJoin('messages', 'messages.id', 'triages.message_id')
      .select('messages.backend_message_id')
      .execute()
    expect(triages.map((t) => t.backend_message_id)).toEqual(['new1'])
  })
})
