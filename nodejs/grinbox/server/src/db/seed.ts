import { DEFAULT_LIMITS } from '@grinbox/shared'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'

export { DEFAULT_LIMITS }

/**
 * Insert any seeded Limit for `userId` that the `limits` table is missing,
 * matched on `(resource, operation, scope)` among rows whose `origin` is
 * `seeded`. Returns the number of rows the DB actually inserted.
 *
 * Keying on origin is what makes the backstop hold (d-qv5l66ya): a user cap on
 * the same operation is a different row and does not shadow the seeded one, so
 * grinbox's own cap is reinserted whenever it is absent. A seeded row already
 * present is left exactly as it is.
 *
 * Idempotent: a second call finds nothing missing, and the insert is
 * conflict-tolerant — the table's UNIQUE
 * `(user_id, resource, operation, scope, origin)` makes a row that appears
 * between the read and the insert a skipped conflict, not a boot failure.
 * Called on every daemon boot, after migrations and user bootstrap, so a seeded
 * cap cannot be absent for longer than one restart.
 *
 * Seeding bypasses `change_log` — the seeded rows are part of the install, not
 * an action by anyone.
 */
export async function reconcileDefaultLimits(
  db: Kysely<Database>,
  userId: number,
  now: number = Math.floor(Date.now() / 1000),
): Promise<number> {
  const existing = await db
    .selectFrom('limits')
    .select(['resource', 'operation', 'scope'])
    .where('user_id', '=', userId)
    .where('origin', '=', 'seeded')
    .execute()
  const present = new Set(existing.map((l) => `${l.resource} ${l.operation} ${l.scope}`))
  const missing = DEFAULT_LIMITS.filter((l) => !present.has(`${l.resource} ${l.operation} ${l.scope}`))
  if (missing.length === 0) {
    return 0
  }

  const result = await db
    .insertInto('limits')
    .values(
      missing.map((limit) => ({
        user_id: userId,
        resource: limit.resource,
        operation: limit.operation,
        scope: limit.scope,
        origin: 'seeded' as const,
        max_count: limit.max_count,
        window_seconds: limit.window_seconds,
        created_at: now,
      })),
    )
    .onConflict((oc) => oc.doNothing())
    .executeTakeFirst()
  return Number(result.numInsertedOrUpdatedRows ?? 0n)
}

/**
 * Insert the default Limits for `userId`. Install-time seeding for a
 * newly-created User (`ensureBootstrapUser`, the demo seeder): with no
 * existing rows, the reconcile inserts the full DEFAULT_LIMITS set.
 */
export async function seedDefaultLimits(db: Kysely<Database>, userId: number, now?: number): Promise<void> {
  await reconcileDefaultLimits(db, userId, now)
}
