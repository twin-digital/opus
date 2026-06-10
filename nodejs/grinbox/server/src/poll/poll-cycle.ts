/**
 * One poll cycle for a single Account (pipeline-runtime.md "Provider polling
 * (Gmail)" + "Process model → Poll loop").
 *
 * {@link pollAccount} drives the read path the Provider exposes and turns its
 * output into State-DB writes:
 *
 *   1. `provider.listCandidates(account, cursor)` → `{ backendMessageIds,
 *      newCursor }` — the backend ids new since the Account's stored cursor.
 *   2. For each candidate: `provider.fetchMetadata(account, id)` →
 *      `upsertMessage(db, accountId, fetched)`. The upsert's `isNew` flag tells
 *      us whether this was a first insert (→ enqueue a Triage on arrival) or a
 *      metadata refresh of an already-known Message (→ no re-enqueue).
 *   3. For each `isNew` Message, `enqueueTriage` under the Account's active
 *      Pipeline (`triggered_by='message_arrival'`, `actor_user_id=NULL`).
 *   4. Advance the cursor: persist `accounts.last_history_cursor = newCursor`
 *      and `last_polled_at = now`.
 *
 * ## Crash-safety / cursor atomicity
 *
 * The doc's requirement is that "a Daemon crash mid-poll doesn't lose the
 * cursor" — phrased there as updating the cursor + `last_polled_at` "in the same
 * transaction as the new Triage enqueues." The load-bearing invariant is: **the
 * cursor must never advance past Messages whose arrival was not durably
 * enqueued.**
 *
 * `enqueueTriage` owns its own `db.transaction()` (one transaction per Triage,
 * with its own Triage-creation recheck) and SQLite does not support starting a
 * transaction within a transaction, so its enqueue cannot be literally nested
 * inside an outer poll transaction. We preserve the exact crash-safety invariant
 * by **ordering** instead: every upsert + enqueue commits first, and the cursor
 * advance is the *last* write of the cycle, in its own transaction. The
 * resulting guarantee is identical to the single-transaction phrasing:
 *
 *  - Crash after some enqueues but before the cursor advance → the cursor stays
 *    where it was. The next poll re-lists the same candidates; `upsertMessage`
 *    returns `isNew=false` for the already-stored Messages, so they are **not**
 *    re-enqueued (idempotent retry — `isNew` gating is the dedupe). No arrival
 *    is lost and none is duplicated.
 *  - Crash during the cursor-advance transaction → it rolls back atomically;
 *    same as above.
 *  - The cursor only moves forward once every enqueue it would skip on the next
 *    poll is already durable.
 *
 * ## Error handling (decided + documented)
 *
 *  - **`listCandidates` failure** aborts the cycle *without advancing the
 *    cursor* — there is no reliable `newCursor` to persist, and leaving the
 *    cursor unadvanced means the next poll retries from the same point. The
 *    error propagates to the caller ({@link pollDueAccounts}), which logs it and
 *    moves on to the next Account. `last_polled_at` is **not** updated on this
 *    path.
 *  - **Per-Message `fetchMetadata`/`upsert` failure** does not abort the whole
 *    cycle: the failing candidate is logged and skipped, and the cycle continues
 *    with the rest. The cursor still advances at the end (we have a valid
 *    `newCursor` from `listCandidates`); a skipped candidate that is genuinely
 *    new will be re-discovered on the next poll only if it still falls in the
 *    backend's candidate window — acceptable for a transient per-Message error,
 *    and the alternative (refusing to advance the cursor because one Message of
 *    a batch failed) would wedge the whole Account.
 */

import type { Kysely } from 'kysely'
import type { Database, SourceState } from '../db/schema.js'
import { enqueueTriage } from '../pipeline/triage-enqueue.js'
import { upsertMessage } from '../providers/message-upsert.js'
import type { CandidateListing, Provider, ProviderAccount } from '../providers/provider.js'

/**
 * The `accounts` projection a poll cycle needs. A subset of the row the
 * scheduler selects; `pollAccount` reads only these fields and writes back the
 * cursor + `last_polled_at`.
 */
export interface PollableAccount {
  readonly id: number
  /** Open-enum backend discriminator (`gmail`; future `imap`). The live
   * ProviderFactory reads it to pick the backend transport / skip unsupported
   * types; the poll cycle itself is backend-neutral and never inspects it. */
  readonly providerType: string
  /** The Account's active Pipeline. A poll cycle only runs when this is set
   * (the scheduler filters `active_pipeline_id IS NULL` out). */
  readonly activePipelineId: number
  readonly settingsJson: string
  /** Opaque per-backend cursor (`last_history_cursor`); null on first sync. */
  readonly lastHistoryCursor: string | null
  /** Unix seconds of the previous successful poll, or null on first sync. */
  readonly lastPolledAt: number | null
  /** Unix seconds of the last source-state reconcile, or null if never. */
  readonly lastReconciledAt: number | null
}

/** Per-cycle outcome counts, for logging + tests. */
export interface PollCycleSummary {
  readonly accountId: number
  /** Candidate ids `listCandidates` returned. */
  readonly candidates: number
  /** Messages whose upsert reported `isNew` (first insert). */
  readonly newMessages: number
  /** Triages enqueued (one per new Message; equal to `newMessages` unless a
   * per-Message error skipped one before enqueue). */
  readonly enqueued: number
  /** Candidates whose fetch/upsert failed and were skipped. */
  readonly failedMessages: number
  /** Existing Message rows whose `source_state` changed from an applied delta. */
  readonly stateUpdated: number
}

/**
 * Run one poll cycle for `account` against `provider`. See the module header for
 * the cursor-atomicity and error-handling contract.
 *
 * `now` (Unix seconds) is injected so the scheduler and tests pass a fixed
 * clock; it is the `last_polled_at` written on success and the `now` passed to
 * `upsertMessage`.
 */
export async function pollAccount(
  db: Kysely<Database>,
  account: PollableAccount,
  provider: Provider,
  now: number,
): Promise<PollCycleSummary> {
  const providerAccount: ProviderAccount = {
    id: account.id,
    settingsJson: account.settingsJson,
    lastPolledAt: account.lastPolledAt,
  }

  // 1. Discover candidates. A failure here aborts the cycle without advancing
  //    the cursor (no valid newCursor to persist); the next poll retries.
  const listing = await provider.listCandidates(providerAccount, account.lastHistoryCursor)

  let newMessages = 0
  let enqueued = 0
  let failedMessages = 0

  // 2–3. Fetch + upsert each candidate; enqueue a Triage for each new Message.
  //      A per-Message failure is logged and skipped — it does not abort the
  //      cycle or prevent the cursor advance.
  for (const backendMessageId of listing.backendMessageIds) {
    try {
      const fetched = await provider.fetchMetadata(providerAccount, backendMessageId)
      const { messageId, isNew } = await upsertMessage(db, account.id, fetched, now)
      if (!isNew) {
        continue
      }
      newMessages++

      await enqueueTriage(db, {
        messageId,
        pipelineId: account.activePipelineId,
        triggeredBy: 'message_arrival',
        actorUserId: null,
      })
      enqueued++
    } catch (err) {
      failedMessages++
      console.error(
        `[grinbox][poll] account=${account.id} message=${backendMessageId} fetch/enqueue failed; skipping candidate`,
        err,
      )
    }
  }

  // 3b. Apply source-state deltas for already-known Messages (Gmail History
  //     label/delete events). These are idempotent UPDATEs keyed by
  //     backend_message_id — a delta for a Message Grinbox never ingested matches
  //     no row. Applied before the cursor advance so a crash re-derives and
  //     re-applies them on the next poll (the `!= state` guard makes the retry a
  //     no-op). Grouped by target state to one UPDATE per state.
  const stateUpdated = await applyStateDeltas(db, account.id, listing, now)

  // 4. Advance the cursor + last_polled_at last, in its own transaction. This is
  //    the cycle's only mutation of `accounts`; it commits after every enqueue,
  //    so a crash before it leaves the cursor unadvanced and the next poll
  //    retries idempotently (isNew gating dedupes).
  await db
    .updateTable('accounts')
    .set({ last_history_cursor: listing.newCursor, last_polled_at: now })
    .where('id', '=', account.id)
    .execute()

  return {
    accountId: account.id,
    candidates: listing.backendMessageIds.length,
    newMessages,
    enqueued,
    failedMessages,
    stateUpdated,
  }
}

/**
 * Apply a listing's source-state deltas to existing `messages` rows, grouped by
 * target state (one UPDATE per distinct state). Returns the number of rows whose
 * state actually changed. A delta for an unknown Message updates no row.
 */
async function applyStateDeltas(
  db: Kysely<Database>,
  accountId: number,
  listing: CandidateListing,
  now: number,
): Promise<number> {
  const deltas = listing.stateDeltas ?? []
  if (deltas.length === 0) {
    return 0
  }

  const idsByState = new Map<SourceState, string[]>()
  for (const d of deltas) {
    const ids = idsByState.get(d.state) ?? []
    ids.push(d.backendMessageId)
    idsByState.set(d.state, ids)
  }

  let changed = 0
  for (const [state, backendIds] of idsByState) {
    changed += await setSourceState(db, accountId, backendIds, state, now)
  }
  return changed
}

/** Per-cycle outcome of a reconcile pass. */
export interface ReconcileSummary {
  readonly accountId: number
  /** Rows flipped present → archived (left the inbox, missed by the feed). */
  readonly archived: number
  /** Rows flipped non-present → present (re-entered the inbox). */
  readonly restored: number
}

/**
 * Reconcile a single Account's source-state against a full inbox snapshot from
 * the Provider (the backstop for drift the incremental History feed missed). For
 * the rows Grinbox already knows: any `present` row absent from the snapshot is
 * flipped to `archived` (the snapshot can't distinguish archived/trashed/deleted
 * — the fine-grained value comes from the History feed), and any non-`present`
 * row that reappears in the snapshot is flipped back to `present`. Rows for
 * inbox Messages Grinbox never ingested are left to the discovery path; reconcile
 * does not insert.
 */
export async function reconcileAccount(
  db: Kysely<Database>,
  account: { id: number; settingsJson: string; lastPolledAt: number | null },
  provider: Provider,
  now: number,
): Promise<ReconcileSummary> {
  const providerAccount: ProviderAccount = {
    id: account.id,
    settingsJson: account.settingsJson,
    lastPolledAt: account.lastPolledAt,
  }
  const { presentBackendIds } = await provider.reconcile(providerAccount)
  return alignSourceState(db, account.id, new Set(presentBackendIds), now)
}

/**
 * Align known rows' `source_state` to an inbox `present` set: any `present` row
 * absent from the set → `archived`; any non-`present` row in the set → `present`.
 * Shared by {@link reconcileAccount} (state-only) and {@link resyncAccount}.
 */
async function alignSourceState(
  db: Kysely<Database>,
  accountId: number,
  present: Set<string>,
  now: number,
): Promise<ReconcileSummary> {
  const rows = await db
    .selectFrom('messages')
    .select(['backend_message_id', 'source_state'])
    .where('account_id', '=', accountId)
    .execute()

  const departed = rows
    .filter((r) => r.source_state === 'present' && !present.has(r.backend_message_id))
    .map((r) => r.backend_message_id)
  const restored = rows
    .filter((r) => r.source_state !== 'present' && present.has(r.backend_message_id))
    .map((r) => r.backend_message_id)

  return {
    accountId,
    archived: await setSourceState(db, accountId, departed, 'archived', now),
    restored: await setSourceState(db, accountId, restored, 'present', now),
  }
}

/** Per-cycle outcome of a full resync. */
export interface ResyncSummary {
  readonly accountId: number
  /** Present Messages re-fetched + upserted (existing rows get fresh metadata). */
  readonly refetched: number
  /** Newly-ingested Messages (previously unknown to Grinbox). */
  readonly newMessages: number
  /** Triages enqueued (one per new Message). */
  readonly enqueued: number
  /** Present ids whose fetch/upsert failed and were skipped. */
  readonly failedMessages: number
  /** Rows flipped present → archived (left the inbox). */
  readonly archived: number
  /** Rows flipped non-present → present (back in the inbox). */
  readonly restored: number
}

/**
 * Full resync of an Account against its current inbox: re-fetch metadata for
 * *every* in-inbox Message and upsert it, then align source-state. Unlike the
 * incremental poll (which only fetches History-added ids), this both **backfills
 * Messages Grinbox never ingested** (e.g. ones older than the initial window, or
 * read before the first sync) and **refreshes existing rows' metadata** — which
 * repairs `received_at` for rows whose original ingest predated `internalDate`
 * capture. Only genuinely new Messages enqueue a Triage (the `isNew` gate);
 * existing rows are refreshed in place without re-triaging.
 */
export async function resyncAccount(
  db: Kysely<Database>,
  account: PollableAccount,
  provider: Provider,
  now: number,
): Promise<ResyncSummary> {
  const providerAccount: ProviderAccount = {
    id: account.id,
    settingsJson: account.settingsJson,
    lastPolledAt: account.lastPolledAt,
  }
  const { presentBackendIds } = await provider.reconcile(providerAccount)

  let refetched = 0
  let newMessages = 0
  let enqueued = 0
  let failedMessages = 0
  for (const backendMessageId of presentBackendIds) {
    try {
      const fetched = await provider.fetchMetadata(providerAccount, backendMessageId)
      const { messageId, isNew } = await upsertMessage(db, account.id, fetched, now)
      refetched++
      if (isNew) {
        newMessages++
        await enqueueTriage(db, {
          messageId,
          pipelineId: account.activePipelineId,
          triggeredBy: 'message_arrival',
          actorUserId: null,
        })
        enqueued++
      }
    } catch (err) {
      failedMessages++
      console.error(
        `[grinbox][resync] account=${account.id} message=${backendMessageId} fetch/upsert failed; skipping`,
        err,
      )
    }
  }

  const align = await alignSourceState(db, account.id, new Set(presentBackendIds), now)
  return {
    accountId: account.id,
    refetched,
    newMessages,
    enqueued,
    failedMessages,
    archived: align.archived,
    restored: align.restored,
  }
}

/** SQLite default bind-variable cap is generous, but chunk to stay well clear. */
const ID_CHUNK = 500

/**
 * Set `source_state` (+ `source_state_at`/`source_synced_at`) for the given
 * backend ids that aren't already at `state`, chunked. Returns rows changed.
 */
async function setSourceState(
  db: Kysely<Database>,
  accountId: number,
  backendIds: string[],
  state: SourceState,
  now: number,
): Promise<number> {
  let changed = 0
  for (let i = 0; i < backendIds.length; i += ID_CHUNK) {
    const chunk = backendIds.slice(i, i + ID_CHUNK)
    if (chunk.length === 0) {
      continue
    }
    const res = await db
      .updateTable('messages')
      .set({ source_state: state, source_state_at: now, source_synced_at: now })
      .where('account_id', '=', accountId)
      .where('backend_message_id', 'in', chunk)
      .where('source_state', '!=', state)
      .executeTakeFirst()
    changed += Number(res.numUpdatedRows)
  }
  return changed
}
