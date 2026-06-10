/**
 * First-run user bootstrap. A freshly-migrated State DB has no `users` row, so
 * `resolveActingUserId` returns null and every User-scoped write 4xxs. On daemon
 * startup we provision the single MVP User (and its default Limits) when none
 * exists, making a fresh DB usable for a real account via the OAuth flow without
 * seeding demo data.
 *
 * This is install-time seeding: it bypasses `change_log` (the seeded rows are
 * part of the install, not an action by anyone — data-model.md "Audit").
 */

import type { DB } from './schema.js'
import { seedDefaultLimits } from './seed.js'

/**
 * Ensure the single MVP User exists, idempotently. In one transaction: if no
 * non-deleted User exists, INSERT one (name `'Grinbox'`, `email` from
 * `GRINBOX_USER_EMAIL` if set, else NULL) and seed its default Limits. Returns
 * the acting User's id (the existing one, or the newly created one) and whether
 * it was just created so the caller can log only on first provision.
 *
 * Called after `runMigrations` on daemon boot. The demo-seed script creates its
 * own User and refuses to run against a populated DB unless `--reset`, so a
 * daemon-bootstrapped User makes `seed:demo` refuse — by design.
 */
export async function ensureBootstrapUser(
  db: DB,
  env: NodeJS.ProcessEnv = process.env,
  now: number = Math.floor(Date.now() / 1000),
): Promise<{ userId: number; created: boolean }> {
  return db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom('users')
      .select('id')
      .where('deleted_at', 'is', null)
      .orderBy('id', 'asc')
      .executeTakeFirst()
    if (existing) {
      return { userId: existing.id, created: false }
    }

    const trimmedEmail = env.GRINBOX_USER_EMAIL?.trim()
    const email = trimmedEmail !== undefined && trimmedEmail.length > 0 ? trimmedEmail : null
    const inserted = await trx
      .insertInto('users')
      .values({ name: 'Grinbox', email, created_at: now })
      .returning('id')
      .executeTakeFirstOrThrow()
    await seedDefaultLimits(trx, inserted.id)
    return { userId: inserted.id, created: true }
  })
}
