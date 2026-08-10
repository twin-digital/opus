import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase } from '../db/connection.js'
import type { Database } from '../db/schema.js'
import { claimOperatorRun } from './claim.js'
import { createOperator } from './operator-save.js'
import { type SeedResult, freshDb, seedBase, taggerConfig } from './test-helpers.js'
import { enqueueTriage } from './triage-enqueue.js'

describe('claimOperatorRun', () => {
  let db: Kysely<Database>
  let seed: SeedResult
  let operatorId: number
  let triageId: number

  beforeEach(async () => {
    db = await freshDb()
    seed = await seedBase(db)
    operatorId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'a',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: true,
      actorUserId: null,
    })
    const res = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })
    triageId = res.triageId
  })

  afterEach(async () => {
    await closeDatabase(db)
  })

  it('first claim succeeds, second claim of the same row returns false', async () => {
    expect(await claimOperatorRun(db, triageId, operatorId, 2000)).toBe(true)
    expect(await claimOperatorRun(db, triageId, operatorId, 2001)).toBe(false)

    const run = await db
      .selectFrom('triage_operator_runs')
      .selectAll()
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', operatorId)
      .executeTakeFirstOrThrow()
    expect(run.status).toBe('running')
    expect(run.started_at).toBe(2000)
  })

  it('claiming a non-existent run returns false', async () => {
    expect(await claimOperatorRun(db, triageId, 999999, 2000)).toBe(false)
    expect(await claimOperatorRun(db, 999999, operatorId, 2000)).toBe(false)
  })

  it('claiming an already-terminal run returns false', async () => {
    // Drive the run to a terminal status, then a claim (status='pending' guard)
    // must not fire.
    await db
      .updateTable('triage_operator_runs')
      .set({ status: 'completed', finished_at: 3000 })
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', operatorId)
      .execute()
    expect(await claimOperatorRun(db, triageId, operatorId, 4000)).toBe(false)
    const run = await db
      .selectFrom('triage_operator_runs')
      .select(['status', 'started_at'])
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', operatorId)
      .executeTakeFirstOrThrow()
    // Unchanged: still completed, started_at not set by the failed claim.
    expect(run.status).toBe('completed')
    expect(run.started_at).toBeNull()
  })
})
