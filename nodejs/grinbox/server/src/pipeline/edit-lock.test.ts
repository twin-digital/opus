import { type Kysely, sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase } from '../db/connection.js'
import type { Database } from '../db/schema.js'
import { withPipelineEditLock } from './edit-lock.js'
import { type SeedResult, freshDb, seedBase } from './test-helpers.js'

/**
 * `withPipelineEditLock` is the BEGIN IMMEDIATE wrapper every Operator mutation
 * path routes through (the structural guard for the single-producer-per-Tag-key
 * invariant). These tests pin its transaction semantics:
 *  - work runs inside a real transaction (a throw rolls everything back),
 *  - the callback's writes commit atomically on success.
 *
 * ## On the true serialization race
 *
 * The invariant the IMMEDIATE lock exists to protect (two concurrent
 * read-validate-write edits both validating against a stale pre-state) cannot be
 * genuinely raced here: better-sqlite3 is fully synchronous, so any callback
 * that touches the DB runs to completion before another `withPipelineEditLock`
 * call can interleave — there is no await point inside the critical section at
 * which a second writer could observe an uncommitted pre-state. A meaningful
 * concurrency test would need a second OS-level connection contending for the
 * lock, which the in-process `:memory:` test harness doesn't model. We therefore
 * assert the achievable property (atomic transaction boundaries) and the lock's
 * serialization is covered structurally by every mutation routing through it.
 */
describe('withPipelineEditLock', () => {
  let db: Kysely<Database>
  let seed: SeedResult

  beforeEach(async () => {
    db = await freshDb()
    seed = await seedBase(db)
  })

  afterEach(async () => {
    await closeDatabase(db)
  })

  it('commits the callback writes on success', async () => {
    const opId = await withPipelineEditLock(db, async (tx) => {
      const op = await tx
        .insertInto('operators')
        .values({
          pipeline_id: seed.pipelineId,
          name: 'committed',
          type_key: 'rule_based_tagger',
          type_code_version: '1',
          config_json: '{}',
          enabled: 1,
          created_at: 1000,
          updated_at: 1000,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      return op.id
    })

    const row = await db.selectFrom('operators').select('name').where('id', '=', opId).executeTakeFirstOrThrow()
    expect(row.name).toBe('committed')
  })

  it('rolls back every write in the transaction when the callback throws', async () => {
    await expect(
      withPipelineEditLock(db, async (tx) => {
        await tx
          .insertInto('operators')
          .values({
            pipeline_id: seed.pipelineId,
            name: 'doomed',
            type_key: 'rule_based_tagger',
            type_code_version: '1',
            config_json: '{}',
            enabled: 1,
            created_at: 1000,
            updated_at: 1000,
          })
          .execute()
        // Throw AFTER a successful write: the rollback must undo it.
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    const rows = await db.selectFrom('operators').select('id').where('name', '=', 'doomed').execute()
    expect(rows).toEqual([])
  })

  it('runs the callback inside an open transaction (a nested BEGIN IMMEDIATE is rejected)', async () => {
    // Proof the lock holds an open write transaction for the callback's
    // duration: issuing a second BEGIN IMMEDIATE on the same pinned connection
    // fails with "cannot start a transaction within a transaction".
    await expect(
      withPipelineEditLock(db, async (tx) => {
        await sql`BEGIN IMMEDIATE`.execute(tx)
      }),
    ).rejects.toThrow(/within a transaction/i)
  })
})
