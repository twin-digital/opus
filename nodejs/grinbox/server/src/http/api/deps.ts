/**
 * Shared wiring for the `/api` read routes. The router groups close over a
 * single {@link ApiDeps} bundle: the State DB handle plus a `now` seam.
 *
 * The `now` seam is the one piece of non-determinism the read surface has:
 * the Dashboard and Limits endpoints compute "last 24h" / "today" / current
 * tumbling-window state, all relative to a notion of "now". Injecting it (rather
 * than calling `Date.now()` inline at the query site) makes the window math
 * assertable from tests with a fixed clock. Production passes the real clock;
 * tests pass a frozen one.
 */

import type { Encryptor } from '../../crypto/encryption.js'
import type { DB } from '../../db/index.js'

/** Returns the current time in UNIX seconds (the State DB's timestamp unit). */
export type NowSeconds = () => number

/** Outcome of a manual sync: how many Accounts polled and new Messages found. */
export interface SyncResult {
  readonly accounts: number
  readonly newMessages: number
}

/**
 * Force an immediate poll of every eligible Account (the Inbox "sync" button),
 * bypassing the per-Account poll interval. Injected by the daemon (which holds
 * the poll scheduler); absent in read-only/test wirings, where the sync route
 * returns a structured 503.
 */
export type SyncNow = () => Promise<SyncResult>

/** The default production clock: real wall time in UNIX seconds. */
export const systemNowSeconds: NowSeconds = () => Math.floor(Date.now() / 1000)

/** Dependencies every `/api` route group closes over. */
export interface ApiDeps {
  readonly db: DB
  /**
   * The "now" seam for the time-window endpoints (Dashboard 24h/today, Limits
   * window state). Defaults to {@link systemNowSeconds}; tests inject a frozen
   * clock so the window math is deterministic.
   */
  readonly now: NowSeconds
  /**
   * The encryption seam the write routes use to store the Pushover notification
   * credential's `{ app_token, user_key }` payload into `credentials.data_enc`.
   * Optional: read-only route groups never touch it, and a `POST
   * /api/credentials` call without it configured returns a structured 4xx rather
   * than crashing.
   */
  readonly encryptor?: Encryptor
  /**
   * Trigger an on-demand Gmail poll (the Inbox "sync" button). Injected by the
   * daemon from the poll scheduler; when absent, `POST /api/sync` returns a
   * structured 503 (`sync_unavailable`).
   */
  readonly syncNow?: SyncNow
}

/**
 * Resolve the acting/owning `user_id` for the single-User MVP (no auth): the
 * one seeded User. Write routes use this for the owning `user_id` on
 * User-scoped writes (limits, credentials) and for `actor_user_id` on
 * `change_log`/replay — mirroring the read routes, which assume one seeded User
 * and never filter by user. Returns the lowest non-deleted `users.id`, or
 * `null` when none exists (an un-installed DB) so the caller can 4xx cleanly.
 */
export async function resolveActingUserId(db: DB): Promise<number | null> {
  const row = await db
    .selectFrom('users')
    .select('id')
    .where('deleted_at', 'is', null)
    .orderBy('id', 'asc')
    .executeTakeFirst()
  return row?.id ?? null
}
