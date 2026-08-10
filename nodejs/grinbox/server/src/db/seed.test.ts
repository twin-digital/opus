import { DEFAULT_LIMITS } from '@grinbox/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureBootstrapUser } from './bootstrap.js'
import { closeDatabase, openDatabase } from './connection.js'
import { runMigrations } from './migrator.js'
import type { DB } from './schema.js'
import { reconcileDefaultLimits } from './seed.js'

/**
 * Default-Limits startup reconcile: brings the seeded rows into line with
 * DEFAULT_LIMITS — inserting any `(resource, operation, scope)` it is missing
 * and moving any whose bound this release has changed — while leaving the
 * user's own caps alone. The seeded caps are grinbox's, not the user's
 * (d-qv5l66ya).
 */

describe('reconcileDefaultLimits', () => {
  let db: DB
  let userId: number

  beforeEach(async () => {
    db = openDatabase(':memory:')
    await runMigrations(db)
    const bootstrap = await ensureBootstrapUser(db, {}, 1000)
    userId = bootstrap.userId
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  async function limitRows() {
    return db
      .selectFrom('limits')
      .select(['resource', 'operation', 'scope', 'max_count', 'window_seconds'])
      .where('user_id', '=', userId)
      .execute()
  }

  it('is a no-op on a freshly bootstrapped DB', async () => {
    const before = await limitRows()
    expect(before).toHaveLength(DEFAULT_LIMITS.length)

    const inserted = await reconcileDefaultLimits(db, userId)

    expect(inserted).toBe(0)
    expect(await limitRows()).toEqual(before)
  })

  it('inserts exactly the missing default rows', async () => {
    // Simulate an install bootstrapped before two defaults existed.
    await db
      .deleteFrom('limits')
      .where('user_id', '=', userId)
      .where('resource', '=', 'mailbox')
      .where('operation', '=', 'archive')
      .execute()
    await db.deleteFrom('limits').where('user_id', '=', userId).where('resource', '=', 'llm_bedrock').execute()

    const inserted = await reconcileDefaultLimits(db, userId)

    expect(inserted).toBe(2)
    const rows = await limitRows()
    expect(rows).toHaveLength(DEFAULT_LIMITS.length)
    // The restored rows carry their default caps.
    const archive = rows.find((r) => r.resource === 'mailbox' && r.operation === 'archive')
    const bedrock = rows.find((r) => r.resource === 'llm_bedrock')
    const archiveDefault = DEFAULT_LIMITS.find((l) => l.resource === 'mailbox' && l.operation === 'archive')
    const bedrockDefault = DEFAULT_LIMITS.find((l) => l.resource === 'llm_bedrock')
    expect(archive?.max_count).toBe(archiveDefault?.max_count)
    expect(bedrock?.max_count).toBe(bedrockDefault?.max_count)
  })

  it("never modifies the user's own cap", async () => {
    await db
      .insertInto('limits')
      .values({
        user_id: userId,
        resource: 'llm_bedrock',
        operation: 'invoke_model',
        scope: 'per_window',
        origin: 'user',
        max_count: 5,
        window_seconds: 600,
        created_at: 1000,
      })
      .execute()
    // One seeded row is also missing, so the reconcile has work to do alongside
    // the user's cap.
    await db
      .deleteFrom('limits')
      .where('user_id', '=', userId)
      .where('origin', '=', 'seeded')
      .where('resource', '=', 'mail_sender')
      .where('scope', '=', 'per_message')
      .execute()

    const changed = await reconcileDefaultLimits(db, userId)

    expect(changed).toBe(1)
    const own = await db
      .selectFrom('limits')
      .select(['max_count'])
      .where('user_id', '=', userId)
      .where('origin', '=', 'user')
      .executeTakeFirstOrThrow()
    expect(own.max_count).toBe(5)
  })

  it('moves a seeded row this release has re-bounded', async () => {
    const shipped = DEFAULT_LIMITS.find((l) => l.resource === 'llm_bedrock' && l.scope === 'per_window')
    // The bound a previous release shipped, still stored.
    await db
      .updateTable('limits')
      .set({ max_count: 50 })
      .where('user_id', '=', userId)
      .where('origin', '=', 'seeded')
      .where('resource', '=', 'llm_bedrock')
      .where('scope', '=', 'per_window')
      .execute()

    const changed = await reconcileDefaultLimits(db, userId)

    expect(changed).toBe(1)
    const row = await db
      .selectFrom('limits')
      .select(['max_count'])
      .where('user_id', '=', userId)
      .where('origin', '=', 'seeded')
      .where('resource', '=', 'llm_bedrock')
      .where('scope', '=', 'per_window')
      .executeTakeFirstOrThrow()
    expect(row.max_count).toBe(shipped?.max_count)
    expect(row.max_count).toBe(100)
    // Nothing else moved.
    expect(await limitRows()).toHaveLength(DEFAULT_LIMITS.length)
  })

  it('tightens a seeded row as readily as it loosens one', async () => {
    await db
      .updateTable('limits')
      .set({ max_count: 100_000 })
      .where('user_id', '=', userId)
      .where('origin', '=', 'seeded')
      .where('resource', '=', 'mail_sender')
      .where('scope', '=', 'per_message')
      .execute()

    const changed = await reconcileDefaultLimits(db, userId)

    expect(changed).toBe(1)
    const row = await db
      .selectFrom('limits')
      .select(['max_count'])
      .where('user_id', '=', userId)
      .where('origin', '=', 'seeded')
      .where('resource', '=', 'mail_sender')
      .where('scope', '=', 'per_message')
      .executeTakeFirstOrThrow()
    expect(row.max_count).toBe(1)
  })
})
