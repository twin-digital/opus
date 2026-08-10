import { DEFAULT_LIMITS } from '@grinbox/shared'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'

export { DEFAULT_LIMITS }

/**
 * Bring the seeded Limits for `userId` into line with `DEFAULT_LIMITS`: insert
 * any the `limits` table is missing, and update any whose bound has changed,
 * matched on `(resource, operation, scope)` among rows whose `origin` is
 * `seeded`. Returns the number of rows inserted plus the number updated.
 *
 * Keying on origin is what makes the backstop hold (d-qv5l66ya): a user cap on
 * the same operation is a different row and does not shadow the seeded one, so
 * grinbox's own cap is reinserted whenever it is absent. The seeded caps are
 * grinbox's and not the user's, so a release that ships a different bound moves
 * the stored row to it — in either direction. A user's own caps are a different
 * origin and are never touched here.
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
  const key = (l: { resource: string; operation: string; scope: string }) => `${l.resource} ${l.operation} ${l.scope}`

  const existing = await db
    .selectFrom('limits')
    .select(['id', 'resource', 'operation', 'scope', 'max_count', 'window_seconds'])
    .where('user_id', '=', userId)
    .where('origin', '=', 'seeded')
    .execute()
  const present = new Map(existing.map((l) => [key(l), l]))
  const missing = DEFAULT_LIMITS.filter((l) => !present.has(key(l)))

  // A seeded row whose bound no longer matches what this release ships.
  const stale = DEFAULT_LIMITS.flatMap((limit) => {
    const row = present.get(key(limit))
    if (row === undefined) {
      return []
    }
    if (row.max_count === limit.max_count && row.window_seconds === limit.window_seconds) {
      return []
    }
    return [{ id: row.id, max_count: limit.max_count, window_seconds: limit.window_seconds }]
  })

  let updated = 0
  for (const row of stale) {
    await db
      .updateTable('limits')
      .set({ max_count: row.max_count, window_seconds: row.window_seconds })
      .where('id', '=', row.id)
      .execute()
    updated += 1
  }

  if (missing.length === 0) {
    return updated
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
  return updated + Number(result.numInsertedOrUpdatedRows ?? 0n)
}

/**
 * Insert the default Limits for `userId`. Install-time seeding for a
 * newly-created User (`ensureBootstrapUser`, the demo seeder): with no
 * existing rows, the reconcile inserts the full DEFAULT_LIMITS set.
 */
export async function seedDefaultLimits(db: Kysely<Database>, userId: number, now?: number): Promise<void> {
  await reconcileDefaultLimits(db, userId, now)
}
