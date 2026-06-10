import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureBootstrapUser } from './bootstrap.js'
import { closeDatabase, openDatabase } from './connection.js'
import { runMigrations } from './migrator.js'
import type { DB } from './schema.js'

/**
 * First-run user bootstrap: on a fresh migrated DB, ensureBootstrapUser creates
 * exactly one User and its 6 default Limits; a second call is a no-op.
 */

describe('ensureBootstrapUser', () => {
  let db: DB

  beforeEach(async () => {
    db = openDatabase(':memory:')
    await runMigrations(db)
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  async function countUsers(): Promise<number> {
    const row = await db
      .selectFrom('users')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow()
    return row.n
  }

  it('creates exactly one User + 6 default Limits on a fresh DB', async () => {
    const result = await ensureBootstrapUser(db, {}, 1000)
    expect(result.created).toBe(true)

    expect(await countUsers()).toBe(1)
    const user = await db.selectFrom('users').selectAll().executeTakeFirstOrThrow()
    expect(user.id).toBe(result.userId)
    expect(user.name).toBe('Grinbox')
    expect(user.email).toBeNull()
    expect(user.created_at).toBe(1000)

    const limits = await db
      .selectFrom('limits')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .where('user_id', '=', result.userId)
      .executeTakeFirstOrThrow()
    expect(limits.n).toBe(6)
  })

  it('is a no-op on a second call (still one User, no extra Limits)', async () => {
    const first = await ensureBootstrapUser(db, {}, 1000)
    const second = await ensureBootstrapUser(db, {}, 2000)

    expect(second.created).toBe(false)
    expect(second.userId).toBe(first.userId)
    expect(await countUsers()).toBe(1)

    const limits = await db
      .selectFrom('limits')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow()
    expect(limits.n).toBe(6)
  })

  it('uses GRINBOX_USER_EMAIL when set, NULL otherwise', async () => {
    const result = await ensureBootstrapUser(db, { GRINBOX_USER_EMAIL: 'real@example.com' }, 1000)
    const user = await db.selectFrom('users').select('email').where('id', '=', result.userId).executeTakeFirstOrThrow()
    expect(user.email).toBe('real@example.com')
  })

  it('does not adopt a soft-deleted User (creates a fresh one)', async () => {
    await db
      .insertInto('users')
      .values({
        name: 'old',
        email: null,
        created_at: 500,
        deleted_at: 600,
      })
      .execute()

    const result = await ensureBootstrapUser(db, {}, 1000)
    expect(result.created).toBe(true)
    // The soft-deleted row plus the new one.
    expect(await countUsers()).toBe(2)
    const active = await db.selectFrom('users').select('id').where('deleted_at', 'is', null).execute()
    expect(active).toHaveLength(1)
    expect(active[0]?.id).toBe(result.userId)
  })
})
