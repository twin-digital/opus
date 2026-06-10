import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase } from '../db/connection.js'
import type { Database } from '../db/schema.js'
import { seedDefaultLimits } from '../db/seed.js'
import { createOperator } from '../pipeline/operator-save.js'
import { type SeedResult, freshDb, seedBase, taggerConfig } from '../pipeline/test-helpers.js'
import { enqueueTriage } from '../pipeline/triage-enqueue.js'
import { recoverInterruptedRuns } from './recovery.js'

describe('recoverInterruptedRuns', () => {
  let db: Kysely<Database>
  let seed: SeedResult

  beforeEach(async () => {
    db = await freshDb()
    seed = await seedBase(db)
    await seedDefaultLimits(db, seed.userId)
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('marks an interrupted running run failed and settles its Triage to partial', async () => {
    const opId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'tagger',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: true,
      actorUserId: null,
    })
    const { triageId } = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })

    // Simulate a crash mid-run: the single run is left `running`.
    await db
      .updateTable('triage_operator_runs')
      .set({ status: 'running', started_at: 1500 })
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', opId)
      .execute()

    const result = await recoverInterruptedRuns(db)
    expect(result.sweptRuns).toBe(1)
    expect(result.settledTriages).toBe(1)

    const run = await db
      .selectFrom('triage_operator_runs')
      .selectAll()
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', opId)
      .executeTakeFirstOrThrow()
    expect(run.status).toBe('failed')
    expect(run.error_summary).toBe('daemon interrupted')
    expect(run.finished_at).not.toBeNull()

    const triage = await db.selectFrom('triages').selectAll().where('id', '=', triageId).executeTakeFirstOrThrow()
    // Single run failed → settled partial (failed is reserved for loop errors).
    expect(triage.status).toBe('partial')
    expect(triage.ended_at).not.toBeNull()
  })

  it('is a no-op when no run is running', async () => {
    const result = await recoverInterruptedRuns(db)
    expect(result.sweptRuns).toBe(0)
    expect(result.settledTriages).toBe(0)
  })

  it('sweeps multiple interrupted Triages in one call and writes current_triages', async () => {
    // Two independent single-run Triages, both interrupted mid-run. One sweep
    // must fail both runs, settle both Triages, and UPSERT each into
    // current_triages.
    const opId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'tagger',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: true,
      actorUserId: null,
    })
    // A second message so the two Triages have distinct current_triages keys.
    const msg2 = await db
      .insertInto('messages')
      .values({
        account_id: seed.accountId,
        backend_message_id: 'm2',
        created_at: 1000,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    const t1 = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })
    const t2 = await enqueueTriage(db, {
      messageId: msg2.id,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })

    // Both runs interrupted (running).
    await db
      .updateTable('triage_operator_runs')
      .set({ status: 'running', started_at: 1500 })
      .where('operator_id', '=', opId)
      .where('triage_id', 'in', [t1.triageId, t2.triageId])
      .execute()

    const result = await recoverInterruptedRuns(db)
    expect(result.sweptRuns).toBe(2)
    expect(result.settledTriages).toBe(2)

    for (const t of [t1, t2]) {
      const triage = await db
        .selectFrom('triages')
        .select(['status'])
        .where('id', '=', t.triageId)
        .executeTakeFirstOrThrow()
      expect(triage.status).toBe('partial')
    }

    // Each Triage's current_triages pointer was written by the sweep.
    const current = await db
      .selectFrom('current_triages')
      .select(['triage_id', 'message_id'])
      .where('pipeline_id', '=', seed.pipelineId)
      .execute()
    const byMsg = new Map(current.map((c) => [c.message_id, c.triage_id]))
    expect(byMsg.get(seed.messageId)).toBe(t1.triageId)
    expect(byMsg.get(msg2.id)).toBe(t2.triageId)
  })

  it('a second call finds no running rows and is idempotent', async () => {
    const opId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'tagger',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: true,
      actorUserId: null,
    })
    const { triageId } = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })
    await db
      .updateTable('triage_operator_runs')
      .set({ status: 'running', started_at: 1500 })
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', opId)
      .execute()

    const first = await recoverInterruptedRuns(db)
    expect(first.sweptRuns).toBe(1)
    expect(first.settledTriages).toBe(1)

    // Second sweep: nothing is `running` anymore → pure no-op, leaving the
    // already-settled Triage untouched.
    const second = await recoverInterruptedRuns(db)
    expect(second.sweptRuns).toBe(0)
    expect(second.settledTriages).toBe(0)

    const triage = await db
      .selectFrom('triages')
      .select(['status'])
      .where('id', '=', triageId)
      .executeTakeFirstOrThrow()
    expect(triage.status).toBe('partial')
  })

  it('leaves the Triage running when a pending sibling survives the sweep', async () => {
    const aId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'A',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('a'),
      enabled: true,
      actorUserId: null,
    })
    const bId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'B',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('b'),
      enabled: true,
      actorUserId: null,
    })
    const { triageId } = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })

    // A interrupted (running); B still pending.
    await db
      .updateTable('triage_operator_runs')
      .set({ status: 'running', started_at: 1500 })
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', aId)
      .execute()

    const result = await recoverInterruptedRuns(db)
    expect(result.sweptRuns).toBe(1)
    expect(result.settledTriages).toBe(0)

    const runs = await db
      .selectFrom('triage_operator_runs')
      .select(['operator_id', 'status'])
      .where('triage_id', '=', triageId)
      .execute()
    const byId = new Map(runs.map((r) => [r.operator_id, r.status]))
    expect(byId.get(aId)).toBe('failed')
    expect(byId.get(bId)).toBe('pending')

    const triage = await db
      .selectFrom('triages')
      .select(['status'])
      .where('id', '=', triageId)
      .executeTakeFirstOrThrow()
    expect(triage.status).toBe('running')
  })
})
