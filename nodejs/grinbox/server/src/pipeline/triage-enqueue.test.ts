import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase } from '../db/connection.js'
import type { Database } from '../db/schema.js'
import { createOperator, setOperatorEnabled } from './operator-save.js'
import {
  type SeedResult,
  freshDb,
  notifyConfig,
  seedBase,
  seedPushoverCredential,
  taggerConfig,
} from './test-helpers.js'
import { enqueueTriage } from './triage-enqueue.js'

describe('enqueueTriage', () => {
  let db: Kysely<Database>
  let seed: SeedResult

  beforeEach(async () => {
    db = await freshDb()
    seed = await seedBase(db)
  })

  afterEach(async () => {
    await closeDatabase(db)
  })

  it('inserts one pending run per enabled Operator, snapshotting config', async () => {
    const a = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'a',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: true,
      actorUserId: null,
    })
    const b = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'b',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('topic'),
      enabled: true,
      actorUserId: null,
    })

    const { triageId, status } = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })
    expect(status).toBe('running')

    const runs = await db
      .selectFrom('triage_operator_runs')
      .selectAll()
      .where('triage_id', '=', triageId)
      .orderBy('operator_id')
      .execute()
    expect(runs.map((r) => r.operator_id)).toEqual([a, b])
    for (const run of runs) {
      expect(run.status).toBe('pending')
      expect(run.type_key).toBe('rule_based_tagger')
      expect(run.type_code_version).toBe('1')
      expect(run.message_id).toBe(seed.messageId)
      expect(JSON.parse(run.op_config_json).output_tag_key).toBeTruthy()
    }
  })

  it('does not enqueue runs for disabled Operators', async () => {
    const a = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'a',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: true,
      actorUserId: null,
    })
    const b = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'b',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('topic'),
      enabled: true,
      actorUserId: null,
    })
    await setOperatorEnabled(db, b, false, null)

    const { triageId } = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })
    const runs = await db.selectFrom('triage_operator_runs').selectAll().where('triage_id', '=', triageId).execute()
    expect(runs.map((r) => r.operator_id)).toEqual([a])
  })

  it('enqueues a pending run for an Action Operator (notify)', async () => {
    // Enqueue consults only the shared declarative registry, not the behavioral
    // one: an Action (which declares no inputs and is always eligible) snapshots
    // a pending run like any other Operator. Behavioral runnability is the
    // execution loop's concern, not the recheck's.
    const credId = await seedPushoverCredential(db, seed.userId)
    const notifyId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'notify',
      typeKey: 'notify',
      configJson: notifyConfig(credId),
      enabled: true,
      actorUserId: seed.userId,
    })

    const { triageId, status } = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })
    expect(status).toBe('running')

    const runs = await db.selectFrom('triage_operator_runs').selectAll().where('triage_id', '=', triageId).execute()
    expect(runs).toHaveLength(1)
    expect(runs[0]?.operator_id).toBe(notifyId)
    expect(runs[0]?.type_key).toBe('notify')
    expect(runs[0]?.status).toBe('pending')
  })

  it('fails the Triage with no runs when the recheck rejects the Pipeline', async () => {
    // Hand-insert two enabled Operators that collide on the same output key,
    // bypassing the save-time guard, to drive the enqueue recheck to fail.
    for (const name of ['a', 'b']) {
      await db
        .insertInto('operators')
        .values({
          pipeline_id: seed.pipelineId,
          name,
          type_key: 'rule_based_tagger',
          type_code_version: '1',
          config_json: taggerConfig('urgency'),
          enabled: 1,
          created_at: 1000,
          updated_at: 1000,
        })
        .execute()
    }

    const { triageId, status } = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })
    expect(status).toBe('failed')
    const triage = await db.selectFrom('triages').selectAll().where('id', '=', triageId).executeTakeFirstOrThrow()
    expect(triage.status).toBe('failed')
    expect(triage.ended_at).not.toBeNull()
    const runs = await db.selectFrom('triage_operator_runs').selectAll().where('triage_id', '=', triageId).execute()
    expect(runs).toEqual([])
  })
})
