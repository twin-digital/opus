import { DEFAULT_LIMITS } from '@grinbox/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ensureBootstrapUser } from './bootstrap.js'
import { closeDatabase, openDatabase } from './connection.js'
import { runMigrations } from './migrator.js'
import type { DB } from './schema.js'
import { reconcileDefaultLimits } from './seed.js'

/**
 * Default-Limits startup reconcile: inserts any `(resource, operation, scope)`
 * present in DEFAULT_LIMITS but absent from the `limits` table, and never
 * modifies or deletes existing rows (user-tuned values survive).
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

  it('never modifies an existing user-tuned row', async () => {
    await db
      .updateTable('limits')
      .set({ max_count: 999 })
      .where('user_id', '=', userId)
      .where('resource', '=', 'pushover_api')
      .where('scope', '=', 'per_window')
      .execute()
    // One row is also missing, so the reconcile has work to do alongside the
    // tuned row.
    await db
      .deleteFrom('limits')
      .where('user_id', '=', userId)
      .where('resource', '=', 'mail_sender')
      .where('scope', '=', 'per_message')
      .execute()

    const inserted = await reconcileDefaultLimits(db, userId)

    expect(inserted).toBe(1)
    const tuned = await db
      .selectFrom('limits')
      .select(['max_count'])
      .where('user_id', '=', userId)
      .where('resource', '=', 'pushover_api')
      .where('scope', '=', 'per_window')
      .executeTakeFirstOrThrow()
    expect(tuned.max_count).toBe(999)
    expect(await limitRows()).toHaveLength(DEFAULT_LIMITS.length)
  })
})
