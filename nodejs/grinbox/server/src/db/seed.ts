import { DEFAULT_LIMITS } from '@grinbox/shared'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'

export { DEFAULT_LIMITS }

/**
 * Insert any default Limit for `userId` that is missing from the `limits`
 * table, matched on `(resource, operation, scope)`. Existing rows are never
 * modified or deleted — a user-tuned `max_count`/`window_seconds` survives
 * every restart; only a wholly absent definition (which would otherwise run
 * unmetered) is inserted at its default. Returns the number of rows the DB
 * actually inserted.
 *
 * Idempotent: a second call finds nothing missing and inserts nothing, and the
 * insert itself is conflict-tolerant (the table's UNIQUE
 * `(user_id, resource, operation, scope)` makes a row that appears between the
 * read and the insert a skipped conflict, not a boot failure). Called on every
 * daemon boot (after migrations + user bootstrap) and by
 * {@link seedDefaultLimits} at install time.
 *
 * Seeding bypasses `change_log` — the seeded rows are conceptually part of the
 * install, not an action by anyone (see data-model.md "Limits" and "Audit").
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
