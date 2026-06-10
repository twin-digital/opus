/**
 * The backend-agnostic Provider abstraction — the seam between Grinbox and any
 * specific mail backend (architecture.md "Backends and Providers"). The MVP
 * ships a {@link GmailProvider}; an IMAP Provider slots into the same interface
 * later without touching the poll loop or the upsert path.
 *
 * A Provider is responsible for three things and nothing else:
 *  - **discovery** (`listCandidates`) — return the set of backend Message ids
 *    that are new since `cursor`, plus the cursor to persist for the next poll.
 *  - **normalization** (`fetchMetadata`, `threadMembership`) — turn a backend's
 *    Message/Thread shapes into the backend-neutral DTOs defined here.
 *  - **categorization** (`applyCategory`) — translate Grinbox's Category concept
 *    into the backend's equivalent (Gmail label, IMAP folder, RFC-5788 keyword).
 *
 * Persisting the cursor / `last_polled_at` and enqueuing Triages are explicitly
 * NOT the Provider's job — those belong to the poll loop, which does them in one
 * transaction (pipeline-runtime.md "Provider polling"). The Provider is pure
 * with respect to the State DB except for the read it needs to dedup the
 * historyId-expired fallback; see {@link GmailProvider}.
 *
 * The DTOs below are **provider-output types**, deliberately distinct from the
 * `messages` DB row shape (`MessagesTable`) and from the Operator-facing
 * `MessageView`. The mapping into a `messages` row is owned by
 * `message-upsert.ts`.
 */

import type { SourceState } from '../db/schema.js'

/**
 * The minimal Account context a Provider needs. A projection of the `accounts`
 * row — the Provider never reads the table itself; the poll loop hands it the
 * fields. `settingsJson` is the provider-specific blob (`{ email }` for Gmail);
 * `lastPolledAt` bounds the historyId-expired query fallback.
 */
export interface ProviderAccount {
  readonly id: number
  readonly settingsJson: string
  /** Unix seconds of the previous successful poll, or null on first sync. */
  readonly lastPolledAt: number | null
}

/**
 * A change in an already-known Message's backend disposition, observed during
 * discovery (Gmail History label/delete events). The poll loop applies it to the
 * matching `messages` row (`source_state`); a delta for a Message Grinbox never
 * ingested matches no row and is a no-op. Backend-neutral: the Provider maps its
 * backend's primitives (Gmail labels, IMAP folder/flags) onto {@link SourceState}.
 */
export interface SourceStateDelta {
  readonly backendMessageId: string
  readonly state: SourceState
}

/**
 * The result of a discovery pass. `backendMessageIds` are the candidate ids the
 * poll loop should fetch + Triage; `newCursor` is the opaque per-backend cursor
 * to persist as `accounts.last_history_cursor` in the same transaction as the
 * enqueues. For Gmail the cursor is a `historyId`; IMAP would use UIDVALIDITY +
 * UID or a date bound. `stateDeltas` carries source-state changes for
 * already-known Messages seen in the same pass (absent/empty on first sync and
 * on the historyId-expired fallback, where the reconcile pass heals instead).
 */
export interface CandidateListing {
  readonly backendMessageIds: string[]
  readonly newCursor: string
  readonly stateDeltas?: readonly SourceStateDelta[]
}

/**
 * A point-in-time snapshot of which Messages are currently in the inbox, for the
 * reconcile backstop. `presentBackendIds` is the full set of in-inbox backend
 * ids (the Provider paginates the backend's list). The poll loop diffs it against
 * stored rows to heal source-state drift the incremental feed missed.
 */
export interface ReconcileSnapshot {
  readonly presentBackendIds: readonly string[]
}

/**
 * A backend Message normalized for ingestion. Every field is best-effort: the
 * backend may not supply a reliable received-time header (`receivedAt` null →
 * the upsert backfills from `created_at`), and the body fields are absent until
 * something fetches them.
 *
 * `headers` is the lowercased-header-name → value map the backend returned;
 * `bodyFetched` records whether a body fetch was *attempted* for this DTO, which
 * drives `messages.body_fetched_at` (data-model.md "messages" body semantics):
 * the read path fetches metadata only, so `bodyFetched` is false and the body
 * fields stay null/undefined until a body-consuming Operator triggers a fetch.
 */
export interface FetchedMessage {
  readonly backendMessageId: string
  readonly backendThreadId: string | null
  readonly from: string | null
  readonly to: string | null
  readonly subject: string | null
  readonly snippet: string | null
  /** Unix seconds; null when no reliable received-time header was present. */
  readonly receivedAt: number | null
  readonly headers: Record<string, string>
  /** Whether a body fetch was attempted; gates `body_fetched_at`. */
  readonly bodyFetched: boolean
  readonly bodyText?: string | null
  readonly bodyHtml?: string | null
}

/**
 * Thread context for a Message (architecture.md "Provider" `thread_membership`).
 * `backendThreadId` is null when the Message is not part of a Thread; `isReply`
 * is whether the Message is a reply within its Thread; `messageCount` is the
 * Thread's size.
 */
export interface ThreadMembership {
  readonly backendThreadId: string | null
  readonly isReply: boolean
  readonly messageCount: number
}

/**
 * A Grinbox Category to apply to a Message. Backend-neutral: the Provider
 * translates `name` into the backend's categorical primitive (Gmail label, IMAP
 * folder/keyword).
 */
export interface Category {
  readonly name: string
}

/**
 * The seam every mail backend implements. The poll loop and the rest of the
 * Daemon depend only on this interface, never on a concrete Provider.
 */
export interface Provider {
  /**
   * Discover candidate Message ids new since `cursor` (null = first sync). For
   * Gmail this is the History API; for IMAP, a query-based list. Returns the
   * ids plus the cursor the poll loop must persist.
   */
  listCandidates(account: ProviderAccount, cursor: string | null): Promise<CandidateListing>

  /** Normalize a single backend Message into a {@link FetchedMessage}. */
  fetchMetadata(account: ProviderAccount, backendMessageId: string): Promise<FetchedMessage>

  /**
   * Apply a Grinbox Category to a Message (Gmail → `apply_label`). Idempotent on
   * backends where re-applying a present Category is a no-op.
   */
  applyCategory(account: ProviderAccount, backendMessageId: string, category: Category): Promise<void>

  /** Return the Thread context for a Message. */
  threadMembership(account: ProviderAccount, backendMessageId: string): Promise<ThreadMembership>

  /**
   * Snapshot the Account's current inbox membership for the reconcile backstop
   * (see {@link ReconcileSnapshot}). Heavier than `listCandidates` (a full
   * paginated list, not an incremental delta), so the poll loop runs it on a
   * coarse cadence, not every poll.
   */
  reconcile(account: ProviderAccount): Promise<ReconcileSnapshot>
}
