/**
 * The Limit engine: the per-attempt enforcement of the per-User `limits` rows
 * (d-isyan49o). Given an attempted Resource operation, it checks every matching
 * `limits` row and, if all allow, increments the relevant counters; if any
 * denies it reports the first denying Limit and does NOT increment anything.
 *
 * Two scopes:
 *  - `per_window`: a tumbling window keyed by `limit_id` in
 *    `limit_counters_window`. The window resets when `now >= window_start +
 *    window_seconds`. Allowed while `count < max_count`.
 *  - `per_message`: an accumulating counter keyed `(limit_id, message_id)` in
 *    `limit_counters_message`. Allowed while `count < max_count`.
 *
 * **Scheduled (Triage-less) attempts.** A scheduled run (Digest delivery) has
 * no single subject Message, so its attempts carry `messageId: null`. A
 * `per_message` Limit then has no counter to key: it is treated as **not
 * applicable** — it neither denies nor counts. Only `per_window` Limits govern
 * scheduled operations (e.g. the seeded `mail_sender.send_message` 5/86400s cap);
 * the seeded per-Message send cap continues to bind per-Triage sends only.
 *
 * **Increment-once semantics.** The check-and-increment runs exactly once per
 * *operation attempt*. The retry wrapper (retry.ts) must call this once, before
 * its retry loop — retries of the underlying API do not re-check or re-increment
 * (d-eqwrgoyv).
 *
 * **Atomicity.** The whole "read every matching Limit, decide, increment the
 * allowed ones" sequence runs inside a single `BEGIN IMMEDIATE` transaction on a
 * pinned connection (see {@link withLimitCheckLock} for why). This guards the
 * read-modify-write of each counter against any concurrent writer and makes the
 * all-or-nothing increment atomic: if a later Limit denies, none of the earlier
 * Limits' counters are left incremented, because the increments only happen
 * after every matching Limit has been found to allow.
 */

import type { LimitScope } from '@grinbox/shared'
import { type Kysely, sql } from 'kysely'
import type { Database } from '../db/schema.js'

/** The outcome of a Limit check for one attempted Resource operation. */
export type LimitDecision = { allowed: true } | { allowed: false; limit_id: number; scope: LimitScope }

/**
 * Runs `fn` inside a single `BEGIN IMMEDIATE` SQLite transaction on a pinned
 * connection, committing on success and rolling back on a thrown error.
 *
 * The Limit check is a read-modify-write across one or more counter rows: read
 * each matching Limit's current counter, decide allow/deny, then increment the
 * allowed ones. `BEGIN IMMEDIATE` acquires SQLite's RESERVED lock at transaction
 * start (before the reads), serializing the whole sequence against any other
 * writer so two concurrent attempts can't both read `count = max_count - 1` and
 * both increment past the cap. Mirrors `withPipelineEditLock`'s rationale for
 * the same reason.
 */
async function withLimitCheckLock<T>(db: Kysely<Database>, fn: (tx: Kysely<Database>) => Promise<T>): Promise<T> {
  return db.connection().execute(async (conn) => {
    await sql`BEGIN IMMEDIATE`.execute(conn)
    try {
      const result = await fn(conn)
      await sql`COMMIT`.execute(conn)
      return result
    } catch (err) {
      await sql`ROLLBACK`.execute(conn)
      throw err
    }
  })
}

interface MatchingLimit {
  readonly id: number
  readonly scope: LimitScope
  readonly max_count: number
  readonly window_seconds: number | null
}

/**
 * Check every `limits` row matching `(userId, resource, operation)` for one
 * attempted Resource operation, incrementing the relevant counters only if all
 * matching Limits allow.
 *
 * On allow: increments each matching Limit's counter and returns
 * `{ allowed: true }`. On deny: increments nothing and returns the first denying
 * Limit's `{ limit_id, scope }` (matching evaluation order: `created_at` then
 * `id`, deterministic). When no Limits match the operation, the attempt is
 * allowed (no cap configured).
 *
 * Call once per operation attempt; the retry wrapper must not re-invoke this.
 *
 * @param now Unix seconds; injectable so tests can drive tumbling-window resets
 *   deterministically. Defaults to wall-clock seconds.
 */
export async function checkAndConsumeLimits(
  db: Kysely<Database>,
  args: {
    readonly userId: number
    readonly resource: string
    readonly operation: string
    /** The subject Message, or `null` for a scheduled (Triage-less) attempt —
     * `per_message` Limits are then not applicable (see module header). */
    readonly messageId: number | null
  },
  now: number = Math.floor(Date.now() / 1000),
): Promise<LimitDecision> {
  const { userId, resource, operation, messageId } = args

  return withLimitCheckLock(db, async (tx) => {
    const limits: MatchingLimit[] = await tx
      .selectFrom('limits')
      .select(['id', 'scope', 'max_count', 'window_seconds'])
      .where('user_id', '=', userId)
      .where('resource', '=', resource)
      .where('operation', '=', operation)
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .execute()

    if (limits.length === 0) {
      return { allowed: true }
    }

    // Phase 1: read each Limit's current counter and decide allow/deny. No
    // writes yet — so a deny on any Limit leaves every counter untouched.
    const windowState = new Map<number, { windowStart: number; count: number; reset: boolean }>()
    const messageState = new Map<number, { count: number; exists: boolean }>()

    for (const limit of limits) {
      if (limit.scope === 'per_window') {
        const row = await tx
          .selectFrom('limit_counters_window')
          .select(['window_start', 'count'])
          .where('limit_id', '=', limit.id)
          .executeTakeFirst()
        const windowSeconds = limit.window_seconds ?? 0
        const expired = row === undefined || now >= row.window_start + windowSeconds
        const effectiveCount = expired ? 0 : row.count
        if (effectiveCount >= limit.max_count) {
          return { allowed: false, limit_id: limit.id, scope: limit.scope }
        }
        windowState.set(limit.id, {
          windowStart: expired ? now : row.window_start,
          count: effectiveCount,
          reset: expired,
        })
      } else {
        // Scheduled (Triage-less) attempt: no Message to key the counter on, so
        // the per_message Limit is not applicable — neither denies nor counts.
        if (messageId === null) {
          continue
        }
        const row = await tx
          .selectFrom('limit_counters_message')
          .select('count')
          .where('limit_id', '=', limit.id)
          .where('message_id', '=', messageId)
          .executeTakeFirst()
        const count = row?.count ?? 0
        if (count >= limit.max_count) {
          return { allowed: false, limit_id: limit.id, scope: limit.scope }
        }
        messageState.set(limit.id, { count, exists: row !== undefined })
      }
    }

    // Phase 2: every matching Limit allows — increment all of their counters.
    for (const limit of limits) {
      if (limit.scope === 'per_window') {
        const state = windowState.get(limit.id)
        if (!state) {
          continue
        }
        if (state.reset) {
          // New or expired window: UPSERT a fresh window starting now at count 1.
          await tx
            .insertInto('limit_counters_window')
            .values({ limit_id: limit.id, window_start: now, count: 1 })
            .onConflict((oc) => oc.column('limit_id').doUpdateSet({ window_start: now, count: 1 }))
            .execute()
        } else {
          await tx
            .updateTable('limit_counters_window')
            .set({ count: state.count + 1 })
            .where('limit_id', '=', limit.id)
            .execute()
        }
      } else {
        // `messageState` has no entry for a null-Message attempt (not
        // applicable, phase 1), so this also narrows `messageId` to non-null.
        if (messageId === null) {
          continue
        }
        const state = messageState.get(limit.id)
        if (!state) {
          continue
        }
        if (state.exists) {
          await tx
            .updateTable('limit_counters_message')
            .set({ count: state.count + 1 })
            .where('limit_id', '=', limit.id)
            .where('message_id', '=', messageId)
            .execute()
        } else {
          await tx
            .insertInto('limit_counters_message')
            .values({ limit_id: limit.id, message_id: messageId, count: 1 })
            .execute()
        }
      }
    }

    return { allowed: true }
  })
}
