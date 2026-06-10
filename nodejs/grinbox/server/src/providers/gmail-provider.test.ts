import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeDatabase, openDatabase } from '../db/connection.js'
import { runMigrations } from '../db/migrator.js'
import type { DB } from '../db/schema.js'
import {
  type GmailHistoryPage,
  type GmailMessagePayload,
  GmailProvider,
  type GmailProviderClient,
  type GmailThread,
  HistoryIdExpiredError,
  initialSyncQuery,
  isHistoryIdExpired,
} from './gmail-provider.js'
import type { ProviderAccount } from './provider.js'

/**
 * `GmailProvider` over a mocked {@link GmailProviderClient} (no network) plus a
 * migrated in-memory DB for the expired-fallback dedup. Covers initial full
 * sync, incremental history walk with pagination, the historyId-expired
 * query-based fallback with dedup, and the per-Message ops (`fetchMetadata`,
 * `applyCategory`, `threadMembership`).
 */

function mockClient(overrides: Partial<GmailProviderClient> = {}): GmailProviderClient {
  return {
    listMessages: vi.fn(async () => ({ ids: [] })),
    listAllMessageIds: vi.fn(async () => []),
    getLatestHistoryId: vi.fn(async () => 'H0'),
    listHistory: vi.fn(
      async (): Promise<GmailHistoryPage> => ({
        addedMessageIds: [],
        historyId: 'H0',
      }),
    ),
    getMessage: vi.fn(
      async (id: string): Promise<GmailMessagePayload> => ({
        id,
        threadId: null,
        snippet: null,
        internalDate: null,
        headers: {},
      }),
    ),
    getThread: vi.fn(async (id: string): Promise<GmailThread> => ({ id, messageIds: [] })),
    applyLabel: vi.fn(async () => {}),
    ...overrides,
  }
}

const account: ProviderAccount = {
  id: 1,
  settingsJson: JSON.stringify({ email: 'u@example.com' }),
  lastPolledAt: 4000,
}

describe('GmailProvider.listCandidates', () => {
  let db: DB

  beforeEach(async () => {
    db = openDatabase(':memory:')
    await runMigrations(db)
    // Seed the account so the fallback dedup query has a real account row.
    await db.insertInto('users').values({ name: 'u', email: 'u@x.com', created_at: 1000 }).execute()
    await db
      .insertInto('accounts')
      .values({
        id: 1,
        user_id: 1,
        name: 'a',
        provider_type: 'gmail',
        settings_json: '{}',
        created_at: 1000,
      })
      .execute()
  })

  afterEach(async () => {
    await closeDatabase(db)
  })

  it('first sync (null cursor): query-based list + latest historyId as cursor', async () => {
    const client = mockClient({
      listMessages: vi.fn(async () => ({ ids: ['a', 'b'] })),
      getLatestHistoryId: vi.fn(async () => 'H100'),
    })
    const provider = new GmailProvider(db, () => client, {
      initialWindowDays: 30,
    })

    const result = await provider.listCandidates(account, null)

    expect(result.backendMessageIds).toEqual(['a', 'b'])
    expect(result.newCursor).toBe('H100')
    expect(client.listMessages).toHaveBeenCalledWith(initialSyncQuery(30))
  })

  it('incremental: collects messageAdded ids across pages and advances the cursor', async () => {
    const listHistory = vi
      .fn()
      .mockResolvedValueOnce({
        addedMessageIds: ['m1', 'm2'],
        historyId: 'H2',
        nextPageToken: 'p2',
      })
      .mockResolvedValueOnce({
        addedMessageIds: ['m2', 'm3'],
        historyId: 'H3',
      })
    const client = mockClient({ listHistory })
    const provider = new GmailProvider(db, () => client)

    const result = await provider.listCandidates(account, 'H1')

    // Deduped across pages; cursor advanced to the last page's historyId.
    expect(result.backendMessageIds).toEqual(['m1', 'm2', 'm3'])
    expect(result.newCursor).toBe('H3')
    expect(listHistory).toHaveBeenNthCalledWith(1, 'H1', undefined)
    expect(listHistory).toHaveBeenNthCalledWith(2, 'H1', 'p2')
  })

  it('incremental: derives source-state deltas from label/delete events (last change wins, trash beats archive, non-inbox labels ignored)', async () => {
    const listHistory = vi
      .fn()
      .mockResolvedValueOnce({
        addedMessageIds: [],
        labelEvents: [
          // Archived, then re-added in the same response → present wins.
          {
            backendMessageId: 'm1',
            addedLabelIds: [],
            removedLabelIds: ['INBOX'],
            deleted: false,
          },
          {
            backendMessageId: 'm1',
            addedLabelIds: ['INBOX'],
            removedLabelIds: [],
            deleted: false,
          },
          // Trash: +TRASH beats the paired -INBOX.
          {
            backendMessageId: 'm2',
            addedLabelIds: ['TRASH'],
            removedLabelIds: ['INBOX'],
            deleted: false,
          },
        ],
        historyId: 'H2',
        nextPageToken: 'p2',
      })
      .mockResolvedValueOnce({
        addedMessageIds: [],
        labelEvents: [
          {
            backendMessageId: 'm3',
            addedLabelIds: [],
            removedLabelIds: [],
            deleted: true,
          },
          // A non-inbox label change yields no delta.
          {
            backendMessageId: 'm4',
            addedLabelIds: ['CATEGORY_PROMOTIONS'],
            removedLabelIds: [],
            deleted: false,
          },
        ],
        historyId: 'H3',
      })
    const client = mockClient({ listHistory })
    const provider = new GmailProvider(db, () => client)

    const result = await provider.listCandidates(account, 'H1')

    expect(result.stateDeltas).toEqual([
      { backendMessageId: 'm1', state: 'present' },
      { backendMessageId: 'm2', state: 'trashed' },
      { backendMessageId: 'm3', state: 'deleted' },
    ])
  })

  it('incremental (>2 pages, real contract): stored cursor equals the response historyId, stable across pages', async () => {
    // The real Gmail History API returns the same top-level `historyId` (the
    // mailbox's current historyId at query time) on every page of one logical
    // response; pagination only walks `nextPageToken`. Model that: all pages
    // carry historyId 'H_now'. The stored cursor must be that value.
    const listHistory = vi
      .fn()
      .mockResolvedValueOnce({
        addedMessageIds: ['m1'],
        historyId: 'H_now',
        nextPageToken: 'p2',
      })
      .mockResolvedValueOnce({
        addedMessageIds: ['m2'],
        historyId: 'H_now',
        nextPageToken: 'p3',
      })
      .mockResolvedValueOnce({
        addedMessageIds: ['m3'],
        historyId: 'H_now',
      })
    const client = mockClient({ listHistory })
    const provider = new GmailProvider(db, () => client)

    const result = await provider.listCandidates(account, 'H_old')

    expect(result.backendMessageIds).toEqual(['m1', 'm2', 'm3'])
    // Outcome: the cursor advances to the response's top-level historyId.
    expect(result.newCursor).toBe('H_now')
    expect(listHistory).toHaveBeenCalledTimes(3)
  })

  it('incremental with zero new messages: cursor still advances to the new historyId (no re-scan-forever)', async () => {
    // A poll that finds no messageAdded records must NOT leave the cursor at the
    // old value — the response still reports a newer top-level historyId, and
    // storing the old one would re-scan the same empty window forever.
    const listHistory = vi.fn(
      async (): Promise<GmailHistoryPage> => ({
        addedMessageIds: [],
        historyId: 'H_advanced',
      }),
    )
    const client = mockClient({ listHistory })
    const provider = new GmailProvider(db, () => client)

    const result = await provider.listCandidates(account, 'H_old')

    expect(result.backendMessageIds).toEqual([])
    expect(result.newCursor).toBe('H_advanced')
    expect(result.newCursor).not.toBe('H_old')
  })

  it('historyId expired: falls back to a query-based list, deduped against stored rows', async () => {
    // m_old is already stored for this account; only m_new should surface.
    await db
      .insertInto('messages')
      .values({
        account_id: 1,
        backend_message_id: 'm_old',
        created_at: 1000,
      })
      .execute()

    const client = mockClient({
      listHistory: vi.fn(async () => {
        throw new HistoryIdExpiredError()
      }),
      listMessages: vi.fn(async () => ({ ids: ['m_old', 'm_new'] })),
      getLatestHistoryId: vi.fn(async () => 'H999'),
    })
    const provider = new GmailProvider(db, () => client)

    const result = await provider.listCandidates(account, 'H_expired')

    expect(result.backendMessageIds).toEqual(['m_new'])
    expect(result.newCursor).toBe('H999')
    // Bounded by last_polled_at.
    expect(client.listMessages).toHaveBeenCalledWith('in:inbox after:4000')
  })

  it('historyId expired with lastPolledAt=null: falls back to the initial-window query', async () => {
    // On the fallback path with no prior poll time, fallbackQuery uses the
    // initial-window query rather than `after:<ts>`.
    const nullPolledAccount: ProviderAccount = {
      id: 1,
      settingsJson: JSON.stringify({ email: 'u@example.com' }),
      lastPolledAt: null,
    }
    const client = mockClient({
      listHistory: vi.fn(async () => {
        throw new HistoryIdExpiredError()
      }),
      listMessages: vi.fn(async () => ({ ids: ['m_new'] })),
      getLatestHistoryId: vi.fn(async () => 'H777'),
    })
    const provider = new GmailProvider(db, () => client, {
      initialWindowDays: 30,
    })

    const result = await provider.listCandidates(nullPolledAccount, 'H_expired')

    expect(result.backendMessageIds).toEqual(['m_new'])
    expect(result.newCursor).toBe('H777')
    expect(client.listMessages).toHaveBeenCalledWith(initialSyncQuery(30))
  })

  it('historyId expired with an empty fallback list: returns no candidates and skips the dedup query', async () => {
    const listMessages = vi.fn(async () => ({ ids: [] }))
    const client = mockClient({
      listHistory: vi.fn(async () => {
        throw new HistoryIdExpiredError()
      }),
      listMessages,
      getLatestHistoryId: vi.fn(async () => 'H_empty'),
    })
    const provider = new GmailProvider(db, () => client)

    const result = await provider.listCandidates(account, 'H_expired')

    expect(result.backendMessageIds).toEqual([])
    expect(result.newCursor).toBe('H_empty')
  })

  it('rethrows non-expired errors instead of falling back', async () => {
    const client = mockClient({
      listHistory: vi.fn(async () => {
        throw new Error('boom')
      }),
    })
    const provider = new GmailProvider(db, () => client)
    await expect(provider.listCandidates(account, 'H1')).rejects.toThrow('boom')
    expect(client.listMessages).not.toHaveBeenCalled()
  })
})

describe('GmailProvider per-message ops', () => {
  it('fetchMetadata normalizes a representative Gmail payload', async () => {
    const client = mockClient({
      getMessage: vi.fn(async (id) => ({
        id,
        threadId: 'thr',
        snippet: 'snip',
        internalDate: '1700000000000',
        headers: { from: 'a@b.com', subject: 'Re: hi' },
      })),
    })
    const provider = new GmailProvider({} as DB, () => client)

    const m = await provider.fetchMetadata(account, 'm1')
    expect(m.backendThreadId).toBe('thr')
    expect(m.from).toBe('a@b.com')
    expect(m.subject).toBe('Re: hi')
    expect(m.snippet).toBe('snip')
    expect(m.receivedAt).toBe(1700000000)
  })

  it('applyCategory invokes the client applyLabel with the category name', async () => {
    const applyLabel = vi.fn(async () => {})
    const client = mockClient({ applyLabel })
    const provider = new GmailProvider({} as DB, () => client)

    await provider.applyCategory(account, 'm1', { name: 'Grinbox/Triaged' })
    expect(applyLabel).toHaveBeenCalledWith('m1', 'Grinbox/Triaged')
  })

  it('applyCategory propagates an applyLabel failure to the caller', async () => {
    const client = mockClient({
      applyLabel: vi.fn(async () => {
        throw new Error('label apply failed')
      }),
    })
    const provider = new GmailProvider({} as DB, () => client)

    await expect(provider.applyCategory(account, 'm1', { name: 'X' })).rejects.toThrow('label apply failed')
  })

  it('threadMembership reports reply + count for a multi-message thread', async () => {
    const client = mockClient({
      getMessage: vi.fn(async (id) => ({
        id,
        threadId: 'thr',
        snippet: null,
        internalDate: null,
        headers: {},
      })),
      getThread: vi.fn(async (id) => ({
        id,
        messageIds: ['first', 'm1', 'last'],
      })),
    })
    const provider = new GmailProvider({} as DB, () => client)

    const t = await provider.threadMembership(account, 'm1')
    expect(t).toEqual({
      backendThreadId: 'thr',
      isReply: true,
      messageCount: 3,
    })
  })

  it('threadMembership: the first message in a thread is NOT a reply (idx===0)', async () => {
    // The message under test is at index 0 of the thread → `idx > 0` is false.
    // This pins `idx > 0` against an `idx >= 0` mutant (which would wrongly call
    // the thread-opener a reply).
    const client = mockClient({
      getMessage: vi.fn(async (id) => ({
        id,
        threadId: 'thr',
        snippet: null,
        internalDate: null,
        headers: {},
      })),
      getThread: vi.fn(async (id) => ({
        id,
        messageIds: ['m1', 'second', 'third'],
      })),
    })
    const provider = new GmailProvider({} as DB, () => client)

    const t = await provider.threadMembership(account, 'm1')
    expect(t).toEqual({
      backendThreadId: 'thr',
      isReply: false,
      messageCount: 3,
    })
  })

  it('threadMembership: a message not present in the thread (idx===-1) is NOT a reply', async () => {
    // indexOf returns -1 when the message id isn't in the thread list; the code
    // conservatively reports not-a-reply (-1 > 0 is false), not a crash.
    const client = mockClient({
      getMessage: vi.fn(async (id) => ({
        id,
        threadId: 'thr',
        snippet: null,
        internalDate: null,
        headers: {},
      })),
      getThread: vi.fn(async (id) => ({
        id,
        messageIds: ['other-a', 'other-b'],
      })),
    })
    const provider = new GmailProvider({} as DB, () => client)

    const t = await provider.threadMembership(account, 'm1')
    expect(t).toEqual({
      backendThreadId: 'thr',
      isReply: false,
      messageCount: 2,
    })
  })

  it('threadMembership reports no thread when the message has no threadId', async () => {
    const client = mockClient({
      getMessage: vi.fn(async (id) => ({
        id,
        threadId: null,
        snippet: null,
        internalDate: null,
        headers: {},
      })),
    })
    const provider = new GmailProvider({} as DB, () => client)

    const t = await provider.threadMembership(account, 'm1')
    expect(t).toEqual({
      backendThreadId: null,
      isReply: false,
      messageCount: 0,
    })
    expect(client.getThread).not.toHaveBeenCalled()
  })
})

describe('isHistoryIdExpired', () => {
  it('recognizes the dedicated error and a raw 404 googleapis error', () => {
    expect(isHistoryIdExpired(new HistoryIdExpiredError())).toBe(true)
    expect(isHistoryIdExpired({ code: 404 })).toBe(true)
    expect(isHistoryIdExpired(new Error('other'))).toBe(false)
    expect(isHistoryIdExpired({ code: 500 })).toBe(false)
  })

  it('null guard: null/undefined/string inputs are not expired (no TypeError)', () => {
    // The `err !== null` guard must short-circuit before the property read so a
    // null/primitive error doesn't crash the catch path. Removing the guard
    // would throw a TypeError on the `.code` access for null.
    expect(isHistoryIdExpired(null)).toBe(false)
    expect(isHistoryIdExpired(undefined)).toBe(false)
    expect(isHistoryIdExpired('historyId expired')).toBe(false)
    expect(isHistoryIdExpired(404)).toBe(false)
  })
})
