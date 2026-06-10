import { DEFAULT_LIMITS } from '@twin-digital/grinbox-shared'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'

export { DEFAULT_LIMITS }

/**
 * Insert the default Limits for `userId`. Install-time seeding bypasses
 * `change_log` — the seeded rows are conceptually part of the install, not an
 * action by anyone (see data-model.md "Limits" and "Audit").
 *
 * Not wired into any startup path yet; the install flow (a later task) calls it
 * once per newly-created User.
 */
export async function seedDefaultLimits(db: Kysely<Database>, userId: number): Promise<void> {
  const now = Math.floor(Date.now() / 1000)
  await db
    .insertInto('limits')
    .values(
      DEFAULT_LIMITS.map((limit) => ({
        user_id: userId,
        resource: limit.resource,
        operation: limit.operation,
        scope: limit.scope,
        max_count: limit.max_count,
        window_seconds: limit.window_seconds,
        created_at: now,
      })),
    )
    .execute()
}
