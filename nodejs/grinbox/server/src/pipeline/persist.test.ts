import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase } from '../db/connection.js'
import type { Database } from '../db/schema.js'
import { type RunRef, deriveTriageStatus, markSkipped, persistOperatorResult } from './persist.js'
import { type SeedResult, freshDb, seedBase } from './test-helpers.js'

/**
 * Settlement tests work against hand-built `triages` + `triage_operator_runs`
 * rows so the run statuses are under direct control (the Operators themselves
 * are irrelevant to persist/settlement — runs carry self-sufficient snapshots).
 */

describe('deriveTriageStatus', () => {
  it('all completed → completed', () => {
    expect(deriveTriageStatus(['completed', 'completed'])).toBe('completed')
  })
  it('any failed → partial', () => {
    expect(deriveTriageStatus(['completed', 'failed'])).toBe('partial')
  })
  it('any skipped → partial', () => {
    expect(deriveTriageStatus(['completed', 'skipped'])).toBe('partial')
  })
  it('all skipped → partial', () => {
    expect(deriveTriageStatus(['skipped', 'skipped'])).toBe('partial')
  })
  it('never returns failed — that is the caller-set loop-error path', () => {
    // failed is reserved for system-level loop errors and is set explicitly by
    // the caller, never derived here. Across all run-status combinations this
    // function only ever yields completed or partial.
    const combos: readonly string[][] = [
      ['completed'],
      ['failed'],
      ['skipped'],
      ['completed', 'failed'],
      ['completed', 'skipped'],
      ['failed', 'skipped'],
      ['failed', 'failed'],
      ['completed', 'failed', 'skipped'],
    ]
    for (const combo of combos) {
      expect(deriveTriageStatus(combo)).not.toBe('failed')
      expect(['completed', 'partial']).toContain(deriveTriageStatus(combo))
    }
  })
})

describe('persistOperatorResult + settlement', () => {
  let db: Kysely<Database>
  let seed: SeedResult

  beforeEach(async () => {
    db = await freshDb()
    seed = await seedBase(db)
  })

  afterEach(async () => {
    await closeDatabase(db)
  })

  /** Create a running triage with `n` pending runs at synthetic operator ids. */
  async function makeTriage(n: number, startedAt: number): Promise<{ triageId: number; operatorIds: number[] }> {
    const triage = await db
      .insertInto('triages')
      .values({
        message_id: seed.messageId,
        pipeline_id: seed.pipelineId,
        triggered_by: 'message_arrival',
        actor_user_id: null,
        started_at: startedAt,
        ended_at: null,
        status: 'running',
        error_summary: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    const operatorIds: number[] = []
    for (let i = 0; i < n; i++) {
      const op = await db
        .insertInto('operators')
        .values({
          pipeline_id: seed.pipelineId,
          name: `op${triage.id}_${i}`,
          type_key: 'rule_based_tagger',
          type_code_version: '1',
          config_json: '{}',
          enabled: 1,
          created_at: 1000,
          updated_at: 1000,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      operatorIds.push(op.id)
      await db
        .insertInto('triage_operator_runs')
        .values({
          triage_id: triage.id,
          operator_id: op.id,
          message_id: seed.messageId,
          type_key: 'rule_based_tagger',
          type_code_version: '1',
          op_config_json: '{}',
          status: 'pending',
          created_at: 1000,
        })
        .execute()
    }
    return { triageId: triage.id, operatorIds }
  }

  function ref(triageId: number, operatorId: number): RunRef {
    return {
      triageId,
      operatorId,
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
    }
  }

  /** Indexes into a run's operator-id list, asserting presence (narrows away undefined). */
  function opId(ids: readonly number[], i: number): number {
    const id = ids[i] as number | undefined
    if (id === undefined) {
      throw new Error(`no operator id at index ${i}`)
    }
    return id
  }

  it('assigns monotonically increasing sequence_num across events', async () => {
    const { triageId, operatorIds } = await makeTriage(1, 1000)
    await persistOperatorResult(db, ref(triageId, opId(operatorIds, 0)), 'completed', {
      tags: [{ key: 'urgency', value: 'yes' }],
      events: [
        {
          eventType: 'tag_set',
          detailsJson: '{"key":"urgency","value":"yes"}',
        },
        {
          eventType: 'resource_op_succeeded',
          detailsJson: '{"resource":"x","operation":"y"}',
        },
      ],
      usage: null,
      errorSummary: null,
      durationMs: 5,
    })
    const events = await db
      .selectFrom('triage_events')
      .selectAll()
      .where('triage_id', '=', triageId)
      .orderBy('sequence_num')
      .execute()
    expect(events.map((e) => e.sequence_num)).toEqual([1, 2])
  })

  it('writes the output Tag rows with the right operator_id/key/value', async () => {
    const { triageId, operatorIds } = await makeTriage(1, 1000)
    const operatorId = opId(operatorIds, 0)
    await persistOperatorResult(db, ref(triageId, operatorId), 'completed', {
      tags: [
        { key: 'urgency', value: 'high' },
        { key: 'topic', value: 'billing' },
      ],
      events: [],
      usage: null,
      errorSummary: null,
      durationMs: 5,
    })

    const tags = await db.selectFrom('tags').selectAll().where('triage_id', '=', triageId).orderBy('key').execute()
    expect(
      tags.map((t) => ({
        triage_id: t.triage_id,
        operator_id: t.operator_id,
        key: t.key,
        value: t.value,
      })),
    ).toEqual([
      {
        triage_id: triageId,
        operator_id: operatorId,
        key: 'topic',
        value: 'billing',
      },
      {
        triage_id: triageId,
        operator_id: operatorId,
        key: 'urgency',
        value: 'high',
      },
    ])
  })

  it('continues sequence_num across separate persist calls (MAX+1)', async () => {
    // Two sibling runs each emit events in separate persist transactions; the
    // second run's events must continue the per-Triage sequence, not restart.
    const { triageId, operatorIds } = await makeTriage(2, 1000)
    await persistOperatorResult(db, ref(triageId, opId(operatorIds, 0)), 'completed', {
      tags: [],
      events: [
        { eventType: 'tag_set', detailsJson: '{}' },
        { eventType: 'tag_set', detailsJson: '{}' },
      ],
      usage: null,
      errorSummary: null,
      durationMs: 1,
    })
    await persistOperatorResult(db, ref(triageId, opId(operatorIds, 1)), 'completed', {
      tags: [],
      events: [{ eventType: 'tag_set', detailsJson: '{}' }],
      usage: null,
      errorSummary: null,
      durationMs: 1,
    })
    const events = await db
      .selectFrom('triage_events')
      .selectAll()
      .where('triage_id', '=', triageId)
      .orderBy('sequence_num')
      .execute()
    expect(events.map((e) => e.sequence_num)).toEqual([1, 2, 3])
  })

  it('settles to completed when all runs complete', async () => {
    const { triageId, operatorIds } = await makeTriage(2, 1000)
    await persistOperatorResult(db, ref(triageId, opId(operatorIds, 0)), 'completed', {
      tags: [],
      events: [],
      usage: null,
      errorSummary: null,
      durationMs: 1,
    })
    // Not settled yet — one sibling still pending.
    let triage = await db.selectFrom('triages').selectAll().where('id', '=', triageId).executeTakeFirstOrThrow()
    expect(triage.status).toBe('running')

    await persistOperatorResult(db, ref(triageId, opId(operatorIds, 1)), 'completed', {
      tags: [],
      events: [],
      usage: null,
      errorSummary: null,
      durationMs: 1,
    })
    triage = await db.selectFrom('triages').selectAll().where('id', '=', triageId).executeTakeFirstOrThrow()
    expect(triage.status).toBe('completed')
    expect(triage.ended_at).not.toBeNull()

    const current = await db
      .selectFrom('current_triages')
      .selectAll()
      .where('message_id', '=', seed.messageId)
      .where('pipeline_id', '=', seed.pipelineId)
      .executeTakeFirstOrThrow()
    expect(current.triage_id).toBe(triageId)
  })

  it('settles to partial when one fails and the other is cascade-skipped', async () => {
    const { triageId, operatorIds } = await makeTriage(2, 1000)
    await persistOperatorResult(db, ref(triageId, opId(operatorIds, 0)), 'failed', {
      tags: [],
      events: [],
      usage: null,
      errorSummary: 'boom',
      durationMs: 1,
    })
    await markSkipped(db, triageId, opId(operatorIds, 1), 'upstream failed')

    const triage = await db.selectFrom('triages').selectAll().where('id', '=', triageId).executeTakeFirstOrThrow()
    expect(triage.status).toBe('partial')
    expect(triage.ended_at).not.toBeNull()

    const skipped = await db
      .selectFrom('triage_operator_runs')
      .selectAll()
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', opId(operatorIds, 1))
      .executeTakeFirstOrThrow()
    expect(skipped.status).toBe('skipped')
    expect(skipped.skip_reason).toBe('upstream failed')
  })

  it('settlement is last-worker-wins: only the final terminal run settles the Triage', async () => {
    // Three sibling runs. Settling them one at a time, the Triage must stay
    // `running` (ended_at null, no current_triages row) until the LAST run goes
    // terminal — the rationale for doing settlement in the same transaction as
    // each completion. An earlier completion must NOT settle.
    const { triageId, operatorIds } = await makeTriage(3, 1000)

    async function complete(i: number): Promise<void> {
      await persistOperatorResult(db, ref(triageId, opId(operatorIds, i)), 'completed', {
        tags: [],
        events: [],
        usage: null,
        errorSummary: null,
        durationMs: 1,
      })
    }

    async function triageRow() {
      return db
        .selectFrom('triages')
        .select(['status', 'ended_at'])
        .where('id', '=', triageId)
        .executeTakeFirstOrThrow()
    }

    async function currentCount(): Promise<number> {
      const rows = await db
        .selectFrom('current_triages')
        .selectAll()
        .where('message_id', '=', seed.messageId)
        .where('pipeline_id', '=', seed.pipelineId)
        .execute()
      return rows.length
    }

    await complete(0)
    expect((await triageRow()).status).toBe('running')
    expect((await triageRow()).ended_at).toBeNull()
    expect(await currentCount()).toBe(0)

    await complete(1)
    expect((await triageRow()).status).toBe('running')
    expect(await currentCount()).toBe(0)

    // The last run goes terminal → exactly this worker settles the Triage.
    await complete(2)
    const settled = await triageRow()
    expect(settled.status).toBe('completed')
    expect(settled.ended_at).not.toBeNull()
    expect(await currentCount()).toBe(1)
  })

  it('current_triages keeps the latest-started triage and ignores an older one', async () => {
    // Newer triage (started_at=2000) settles first.
    const newer = await makeTriage(1, 2000)
    await persistOperatorResult(db, ref(newer.triageId, opId(newer.operatorIds, 0)), 'completed', {
      tags: [],
      events: [],
      usage: null,
      errorSummary: null,
      durationMs: 1,
    })
    // Older triage (started_at=1000) settles afterward; must NOT overwrite.
    const older = await makeTriage(1, 1000)
    await persistOperatorResult(db, ref(older.triageId, opId(older.operatorIds, 0)), 'completed', {
      tags: [],
      events: [],
      usage: null,
      errorSummary: null,
      durationMs: 1,
    })

    const current = await db
      .selectFrom('current_triages')
      .selectAll()
      .where('message_id', '=', seed.messageId)
      .where('pipeline_id', '=', seed.pipelineId)
      .executeTakeFirstOrThrow()
    expect(current.triage_id).toBe(newer.triageId)
    expect(current.triage_started_at).toBe(2000)
  })

  it('current_triages overwrites the prior pointer when a newer triage settles second', async () => {
    // Older triage (started_at=1000) settles first and claims current_triages.
    const older = await makeTriage(1, 1000)
    await persistOperatorResult(db, ref(older.triageId, opId(older.operatorIds, 0)), 'completed', {
      tags: [],
      events: [],
      usage: null,
      errorSummary: null,
      durationMs: 1,
    })
    let current = await db
      .selectFrom('current_triages')
      .selectAll()
      .where('message_id', '=', seed.messageId)
      .where('pipeline_id', '=', seed.pipelineId)
      .executeTakeFirstOrThrow()
    expect(current.triage_id).toBe(older.triageId)

    // Newer triage (started_at=2000) settles afterward; the conditional UPSERT
    // must fire its DO UPDATE branch and replace the older pointer.
    const newer = await makeTriage(1, 2000)
    await persistOperatorResult(db, ref(newer.triageId, opId(newer.operatorIds, 0)), 'completed', {
      tags: [],
      events: [],
      usage: null,
      errorSummary: null,
      durationMs: 1,
    })
    current = await db
      .selectFrom('current_triages')
      .selectAll()
      .where('message_id', '=', seed.messageId)
      .where('pipeline_id', '=', seed.pipelineId)
      .executeTakeFirstOrThrow()
    expect(current.triage_id).toBe(newer.triageId)
    expect(current.triage_started_at).toBe(2000)
  })
})
