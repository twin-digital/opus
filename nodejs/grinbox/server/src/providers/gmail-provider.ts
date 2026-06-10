/**
 * The Gmail {@link Provider} implementation. All Gmail-specific quirks — the
 * History API model, label/message shapes, history pagination, the
 * "historyId expired" fallback, thread membership derivation — live here; the
 * generic `Provider` seam stays backend-neutral.
 *
 * **Injected client seam.** This module never constructs a `googleapis` client.
 * It depends on {@link GmailProviderClient}, a thin async interface over the
 * Gmail operations the read path needs. Tests pass a mock; the live path (a
 * later OAuth task) builds a real implementation that adapts
 * `resources/gmail.ts` (`listMessages`, `fetchMetadata`, `applyLabel`) plus the
 * `users.history.list` / `users.threads.get` calls the read path adds, all over
 * an authenticated OAuth2 client. Because the seam is injected, the read path is
 * fully unit-testable now and drops onto real credentials without code change.
 *
 * **History API model** (pipeline-runtime.md "Provider polling (Gmail)"):
 *  - First sync (no cursor): `users.messages.list` with the configured initial
 *    query (`in:inbox newer_than:30d`), returning the ids plus the latest
 *    `historyId` as the new cursor. The scope is the inbox (read-state
 *    irrelevant); completeness beyond the window is the reconcile pass's job.
 *  - Incremental: `users.history.list?startHistoryId=cursor`, collecting the
 *    `messageAdded` ids across all pages, advancing the cursor to the response's
 *    `historyId`.
 *  - historyId-expired fallback: when Gmail reports the start historyId is too
 *    old (it retains ~7 days), fall back to a query-based list bounded by the
 *    Account's `last_polled_at`, dedup against existing `messages` rows by
 *    `backend_message_id`, and advance the cursor to a freshly-read latest
 *    `historyId`.
 */

import type { DB, SourceState } from '../db/schema.js'
import { parseGmailMessage } from './gmail-shapes.js'
import type {
  CandidateListing,
  Category,
  FetchedMessage,
  Provider,
  ProviderAccount,
  ReconcileSnapshot,
  SourceStateDelta,
  ThreadMembership,
} from './provider.js'

// --- Injected Gmail client seam ---------------------------------------------

/** A raw `users.messages.list` response slice (only the fields the read path uses). */
export interface GmailListResult {
  /** Backend Message ids matching the query. */
  readonly ids: string[]
}

/**
 * A per-Message label/delete change from a `users.history.list` record, used to
 * derive {@link SourceStateDelta}s. One entry merges a single Message's
 * `labelsAdded`/`labelsRemoved` within a history record (so trash — `+TRASH`
 * with `-INBOX` — resolves correctly), or marks it `deleted` (`messagesDeleted`).
 * Emitted in history order so the latest change for a Message wins.
 */
export interface GmailLabelEvent {
  readonly backendMessageId: string
  readonly addedLabelIds: readonly string[]
  readonly removedLabelIds: readonly string[]
  /** From a `messagesDeleted` record: the Message was purged from the mailbox. */
  readonly deleted: boolean
}

/** A `users.history.list` page. */
export interface GmailHistoryPage {
  /**
   * Each history record's `messagesAdded[].message.id`, already flattened to the
   * added Message ids on this page.
   */
  readonly addedMessageIds: string[]
  /**
   * Per-Message label/delete changes on this page, in history order. Optional:
   * a client that only requests `messageAdded` history omits it (treated as no
   * state changes).
   */
  readonly labelEvents?: readonly GmailLabelEvent[]
  /** The page's `historyId` — the latest seen so far; advanced across pages. */
  readonly historyId: string
  /** Opaque next-page token; absent/undefined when this is the last page. */
  readonly nextPageToken?: string
}

/** A normalized Gmail message payload (headers + thread id + snippet + internalDate). */
export interface GmailMessagePayload {
  readonly id: string
  readonly threadId: string | null
  readonly snippet: string | null
  /** Gmail `internalDate` — epoch **milliseconds** as a string, when present. */
  readonly internalDate: string | null
  /** Lowercased-header-name → value (as `resources/gmail.ts` normalizes). */
  readonly headers: Record<string, string>
}

/** A `users.threads.get` result reduced to what `threadMembership` needs. */
export interface GmailThread {
  readonly id: string
  /** Backend Message ids in the Thread, in Gmail's returned order. */
  readonly messageIds: string[]
}

/**
 * The Gmail operations the Provider depends on, injected so tests mock and the
 * OAuth task fills the live transport. Each method is account-scoped (the live
 * impl closes over the resolved auth for that Account).
 */
export interface GmailProviderClient {
  /** `users.messages.list` for a Gmail search query (first page only). */
  listMessages(query: string): Promise<GmailListResult>
  /**
   * All Message ids matching a query, paginating `users.messages.list` to
   * exhaustion. Used by `reconcile` to snapshot the whole inbox.
   */
  listAllMessageIds(query: string): Promise<string[]>
  /**
   * Read the current latest `historyId` for the mailbox (a metadata-format
   * `users.getProfile`, or any list call exposing `historyId`). Used to seed /
   * re-seed the cursor on first sync and on the expired fallback.
   */
  getLatestHistoryId(): Promise<string>
  /**
   * `users.history.list` from `startHistoryId`, one page. `pageToken` paginates;
   * the impl includes `historyTypes=messageAdded,labelAdded,labelRemoved,
   * messageDeleted` so the page carries both new-Message ids and the label/delete
   * events that drive source-state. Throws a {@link HistoryIdExpiredError} (or
   * any error for which `isHistoryIdExpired` returns true) when `startHistoryId`
   * is too old.
   */
  listHistory(startHistoryId: string, pageToken?: string): Promise<GmailHistoryPage>
  /** Metadata-format `users.messages.get`, normalized to a payload. */
  getMessage(backendMessageId: string): Promise<GmailMessagePayload>
  /** `users.threads.get` (metadata format) reduced to ids. */
  getThread(backendThreadId: string): Promise<GmailThread>
  /** `users.messages.modify` adding `label`. Idempotent. */
  applyLabel(backendMessageId: string, label: string): Promise<void>
}

/**
 * The error a live client throws (or that the mock simulates) when a History API
 * `startHistoryId` predates Gmail's retention window. `GmailProvider` catches it
 * to trigger the query-based fallback. The live impl maps Gmail's HTTP 404 with
 * reason `failedPrecondition` / `Requested entity was not found` onto this.
 */
export class HistoryIdExpiredError extends Error {
  constructor(message = 'Gmail historyId expired') {
    super(message)
    this.name = 'HistoryIdExpiredError'
  }
}

/**
 * Whether `err` represents a "historyId expired" condition. Recognizes the
 * dedicated {@link HistoryIdExpiredError} and the Gmail HTTP-404 shape a live
 * `googleapis` error carries (`code === 404`), so the live client can throw a
 * raw googleapis error and still trigger the fallback.
 */
export function isHistoryIdExpired(err: unknown): boolean {
  if (err instanceof HistoryIdExpiredError) {
    return true
  }
  if (typeof err === 'object' && err !== null) {
    const code = (err as { code?: unknown }).code
    if (code === 404) {
      return true
    }
  }
  return false
}

// --- Configuration ----------------------------------------------------------

export interface GmailProviderConfig {
  /**
   * Initial-sync window in days. The first-sync query is
   * `in:inbox newer_than:<days>d` (pipeline-runtime.md). Default 30.
   */
  readonly initialWindowDays: number
}

const DEFAULT_CONFIG: GmailProviderConfig = { initialWindowDays: 30 }

/** Build the initial-sync Gmail query for a window of `days`. */
export function initialSyncQuery(days: number): string {
  return `in:inbox newer_than:${days}d`
}

/**
 * The reconcile snapshot query: the whole inbox, unwindowed. Reconcile is the
 * completeness backstop, so it is not date-bounded like the initial/fallback
 * discovery queries.
 */
export function reconcileQuery(): string {
  return 'in:inbox'
}

/**
 * Build the fallback query for the historyId-expired path: inbox Messages newer
 * than the last successful poll. When `lastPolledAt` is null (shouldn't happen
 * on the fallback path, but defended), fall back to the initial window. Bounds
 * discovery of new arrivals by received date; a re-added older Message is caught
 * by the reconcile pass rather than this query.
 */
export function fallbackQuery(lastPolledAt: number | null, initialWindowDays: number): string {
  if (lastPolledAt === null) {
    return initialSyncQuery(initialWindowDays)
  }
  // Gmail's `after:` takes epoch seconds. Subtract nothing — `after` is
  // exclusive at second granularity, which is the right bound for "since the
  // last poll"; the upsert dedup handles any boundary overlap.
  return `in:inbox after:${lastPolledAt}`
}

/**
 * Map one Gmail label/delete event onto the source-state it implies, or `null`
 * when the event doesn't bear on inbox membership (some other label changed).
 * Order is significant: a purge wins over everything; within a single event a
 * `+TRASH`/`+SPAM` (which Gmail pairs with `-INBOX`) is the specific outcome and
 * must win over the generic "left the inbox" reading of `-INBOX`.
 */
export function stateFromLabelEvent(event: GmailLabelEvent): SourceState | null {
  if (event.deleted) {
    return 'deleted'
  }
  if (event.addedLabelIds.includes('TRASH')) {
    return 'trashed'
  }
  if (event.addedLabelIds.includes('SPAM')) {
    return 'spam'
  }
  if (event.addedLabelIds.includes('INBOX')) {
    return 'present'
  }
  if (event.removedLabelIds.includes('INBOX')) {
    return 'archived'
  }
  return null
}

// --- Provider ---------------------------------------------------------------

export class GmailProvider implements Provider {
  private readonly db: DB
  private readonly makeClient: (account: ProviderAccount) => GmailProviderClient
  private readonly config: GmailProviderConfig

  /**
   * @param db - State DB, read-only here (the expired-fallback dedup query). The
   *   Provider never writes; cursor persistence + enqueues are the poll loop's.
   * @param makeClient - Resolves the injected {@link GmailProviderClient} for an
   *   Account. The live impl resolves+refreshes the Account's OAuth credential;
   *   tests return a mock.
   */
  constructor(
    db: DB,
    makeClient: (account: ProviderAccount) => GmailProviderClient,
    config: Partial<GmailProviderConfig> = {},
  ) {
    this.db = db
    this.makeClient = makeClient
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  async listCandidates(account: ProviderAccount, cursor: string | null): Promise<CandidateListing> {
    const client = this.makeClient(account)

    // First sync: full query-based list, cursor seeded from the latest historyId.
    if (cursor === null) {
      const { ids } = await client.listMessages(initialSyncQuery(this.config.initialWindowDays))
      const newCursor = await client.getLatestHistoryId()
      return { backendMessageIds: ids, newCursor }
    }

    // Incremental: walk the History API from the cursor.
    try {
      return await this.incrementalSync(client, cursor)
    } catch (err) {
      if (!isHistoryIdExpired(err)) {
        throw err
      }
      return await this.expiredFallback(account, client)
    }
  }

  /**
   * Walk `users.history.list` from `cursor`, collecting added ids and folding the
   * page's label/delete events into per-Message source-state deltas (last change
   * in history order wins) across pages.
   */
  private async incrementalSync(client: GmailProviderClient, cursor: string): Promise<CandidateListing> {
    const ids: string[] = []
    const seen = new Set<string>()
    // Last observed state per Message id, in history order (later events
    // overwrite earlier ones — e.g. archived then re-added → present).
    const stateByMessage = new Map<string, SourceState>()
    let newCursor = cursor
    let pageToken: string | undefined

    do {
      const page = await client.listHistory(cursor, pageToken)
      for (const id of page.addedMessageIds) {
        if (!seen.has(id)) {
          seen.add(id)
          ids.push(id)
        }
      }
      for (const event of page.labelEvents ?? []) {
        const state = stateFromLabelEvent(event)
        if (state !== null) {
          stateByMessage.set(event.backendMessageId, state)
        }
      }
      // Advance to the newest historyId observed (last page reports the latest).
      newCursor = page.historyId
      pageToken = page.nextPageToken
    } while (pageToken)

    const stateDeltas: SourceStateDelta[] = [...stateByMessage].map(([backendMessageId, state]) => ({
      backendMessageId,
      state,
    }))
    return { backendMessageIds: ids, newCursor, stateDeltas }
  }

  /**
   * historyId-expired fallback: a query-based list bounded by `last_polled_at`,
   * deduped against `messages` rows already stored for this Account, with the
   * cursor re-seeded from the current latest `historyId`.
   */
  private async expiredFallback(account: ProviderAccount, client: GmailProviderClient): Promise<CandidateListing> {
    const { ids } = await client.listMessages(fallbackQuery(account.lastPolledAt, this.config.initialWindowDays))
    const newCursor = await client.getLatestHistoryId()

    if (ids.length === 0) {
      return { backendMessageIds: [], newCursor }
    }

    const existing = await this.db
      .selectFrom('messages')
      .select('backend_message_id')
      .where('account_id', '=', account.id)
      .where('backend_message_id', 'in', ids)
      .execute()
    const known = new Set(existing.map((r) => r.backend_message_id))

    return {
      backendMessageIds: ids.filter((id) => !known.has(id)),
      newCursor,
    }
  }

  async fetchMetadata(account: ProviderAccount, backendMessageId: string): Promise<FetchedMessage> {
    const client = this.makeClient(account)
    const payload = await client.getMessage(backendMessageId)
    return parseGmailMessage(payload)
  }

  async applyCategory(account: ProviderAccount, backendMessageId: string, category: Category): Promise<void> {
    const client = this.makeClient(account)
    await client.applyLabel(backendMessageId, category.name)
  }

  async threadMembership(account: ProviderAccount, backendMessageId: string): Promise<ThreadMembership> {
    const client = this.makeClient(account)
    const message = await client.getMessage(backendMessageId)
    if (message.threadId === null) {
      return { backendThreadId: null, isReply: false, messageCount: 0 }
    }
    const thread = await client.getThread(message.threadId)
    const idx = thread.messageIds.indexOf(backendMessageId)
    return {
      backendThreadId: thread.id,
      // A reply is any Message that isn't the first in its Thread. An unknown
      // index (not found) conservatively reports not-a-reply.
      isReply: idx > 0,
      messageCount: thread.messageIds.length,
    }
  }

  async reconcile(account: ProviderAccount): Promise<ReconcileSnapshot> {
    const client = this.makeClient(account)
    const presentBackendIds = await client.listAllMessageIds(reconcileQuery())
    return { presentBackendIds }
  }
}
