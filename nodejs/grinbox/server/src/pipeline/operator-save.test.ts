import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase } from '../db/connection.js'
import type { Database } from '../db/schema.js'
import {
  CredentialInUseError,
  NotFoundError,
  PipelineValidationError,
  createOperator,
  editOperator,
  setOperatorEnabled,
  softDeleteCredential,
  softDeleteOperator,
  softDeletePipeline,
} from './operator-save.js'
import {
  type SeedResult,
  freshDb,
  notifyConfig,
  seedBase,
  seedPushoverCredential,
  taggerConfig,
} from './test-helpers.js'

describe('Operator save write patterns', () => {
  let db: Kysely<Database>
  let seed: SeedResult

  beforeEach(async () => {
    db = await freshDb()
    seed = await seedBase(db)
  })

  afterEach(async () => {
    await closeDatabase(db)
  })

  async function lastChangeLog(entityType: string, entityId: number) {
    return db
      .selectFrom('change_log')
      .selectAll()
      .where('entity_type', '=', entityType)
      .where('entity_id', '=', entityId)
      .orderBy('id', 'desc')
      .executeTakeFirst()
  }

  it('create lands the Operator and writes a created change_log row', async () => {
    const id = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'urgency',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: true,
      actorUserId: seed.userId,
    })
    const op = await db.selectFrom('operators').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    expect(op.type_code_version).toBe('1')
    expect(op.enabled).toBe(1)

    const log = await lastChangeLog('operator', id)
    expect(log?.action).toBe('created')
    expect(log?.before_json).toBeNull()
    expect(log?.after_json).not.toBeNull()
  })

  it('edit updates config + writes an updated change_log row', async () => {
    const id = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'urgency',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: true,
      actorUserId: seed.userId,
    })
    await editOperator(db, {
      operatorId: id,
      configJson: taggerConfig('priority'),
      actorUserId: seed.userId,
    })
    const op = await db.selectFrom('operators').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    expect(JSON.parse(op.config_json).output_tag_key).toBe('priority')

    const log = await lastChangeLog('operator', id)
    expect(log?.action).toBe('updated')
    expect(log?.before_json).not.toBeNull()
  })

  it('disable then enable write distinct change_log actions', async () => {
    const id = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'urgency',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: true,
      actorUserId: seed.userId,
    })
    await setOperatorEnabled(db, id, false, seed.userId)
    expect((await lastChangeLog('operator', id))?.action).toBe('disabled')
    const disabled = await db.selectFrom('operators').select('enabled').where('id', '=', id).executeTakeFirstOrThrow()
    expect(disabled.enabled).toBe(0)

    await setOperatorEnabled(db, id, true, seed.userId)
    expect((await lastChangeLog('operator', id))?.action).toBe('enabled')
  })

  it('soft-delete sets deleted_at and writes a deleted change_log row', async () => {
    const id = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'urgency',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: true,
      actorUserId: seed.userId,
    })
    await softDeleteOperator(db, id, seed.userId)
    const op = await db.selectFrom('operators').select('deleted_at').where('id', '=', id).executeTakeFirstOrThrow()
    expect(op.deleted_at).not.toBeNull()
    expect((await lastChangeLog('operator', id))?.action).toBe('deleted')
  })

  it('rejects an edit that would collide and rolls back (no partial write)', async () => {
    const a = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'a',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: true,
      actorUserId: seed.userId,
    })
    const b = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'b',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('topic'),
      enabled: true,
      actorUserId: seed.userId,
    })

    // Editing b to also produce 'urgency' collides with a.
    await expect(
      editOperator(db, {
        operatorId: b,
        configJson: taggerConfig('urgency'),
        actorUserId: seed.userId,
      }),
    ).rejects.toBeInstanceOf(PipelineValidationError)

    // b unchanged (rolled back); no spurious change_log row for the failed edit.
    const opB = await db.selectFrom('operators').select('config_json').where('id', '=', b).executeTakeFirstOrThrow()
    expect(JSON.parse(opB.config_json).output_tag_key).toBe('topic')
    const logs = await db
      .selectFrom('change_log')
      .selectAll()
      .where('entity_id', '=', b)
      .where('entity_type', '=', 'operator')
      .execute()
    expect(logs.map((l) => l.action)).toEqual(['created'])
  })

  it('reconciles operator_credential_references on Notify add and remove', async () => {
    const credId = await seedPushoverCredential(db, seed.userId)
    const id = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'notify',
      typeKey: 'notify',
      configJson: notifyConfig(credId),
      enabled: true,
      actorUserId: seed.userId,
    })
    let refs = await db.selectFrom('operator_credential_references').selectAll().where('operator_id', '=', id).execute()
    expect(refs.map((r) => r.credential_id)).toEqual([credId])

    // Soft-delete clears the references.
    await softDeleteOperator(db, id, seed.userId)
    refs = await db.selectFrom('operator_credential_references').selectAll().where('operator_id', '=', id).execute()
    expect(refs).toEqual([])
  })

  it('blocks Credential soft-delete while referenced, allows it once freed', async () => {
    const credId = await seedPushoverCredential(db, seed.userId)
    const id = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'notify',
      typeKey: 'notify',
      configJson: notifyConfig(credId),
      enabled: true,
      actorUserId: seed.userId,
    })

    await expect(softDeleteCredential(db, credId, seed.userId)).rejects.toBeInstanceOf(CredentialInUseError)

    // Free the reference, then the soft-delete succeeds.
    await softDeleteOperator(db, id, seed.userId)
    await softDeleteCredential(db, credId, seed.userId)
    const cred = await db
      .selectFrom('credentials')
      .select('deleted_at')
      .where('id', '=', credId)
      .executeTakeFirstOrThrow()
    expect(cred.deleted_at).not.toBeNull()
    expect((await lastChangeLog('credential', credId))?.action).toBe('deleted')
  })

  it('createOperator with enabled:false skips the add-to-validation branch', async () => {
    // An existing enabled Operator already claims 'urgency'. Creating a SECOND
    // disabled Operator that would also emit 'urgency' must NOT collide, because
    // a disabled Operator is not added to the validation snapshot.
    await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'enabled-urgency',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: true,
      actorUserId: seed.userId,
    })
    const disabledId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'disabled-urgency',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: false,
      actorUserId: seed.userId,
    })
    const op = await db
      .selectFrom('operators')
      .select(['enabled'])
      .where('id', '=', disabledId)
      .executeTakeFirstOrThrow()
    expect(op.enabled).toBe(0)
  })

  it('edits a disabled Operator without adding it to the validation snapshot', async () => {
    // An enabled Operator claims 'urgency'. A disabled Operator is edited to
    // also produce 'urgency': because op.enabled===0, the edited config is NOT
    // substituted into the snapshot, so no collision is raised.
    await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'enabled-urgency',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: true,
      actorUserId: seed.userId,
    })
    const disabledId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'disabled-topic',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('topic'),
      enabled: false,
      actorUserId: seed.userId,
    })

    await editOperator(db, {
      operatorId: disabledId,
      configJson: taggerConfig('urgency'),
      actorUserId: seed.userId,
    })
    const op = await db
      .selectFrom('operators')
      .select(['config_json'])
      .where('id', '=', disabledId)
      .executeTakeFirstOrThrow()
    expect(JSON.parse(op.config_json).output_tag_key).toBe('urgency')
  })

  it('rejects enabling an Operator that would collide on an output key', async () => {
    // 'a' is enabled and claims 'urgency'. 'b' is disabled and also claims
    // 'urgency' — fine while disabled. Enabling 'b' would put two enabled
    // Operators on the same output key, which must be rejected.
    await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'a',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: true,
      actorUserId: seed.userId,
    })
    const b = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'b',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: false,
      actorUserId: seed.userId,
    })

    await expect(setOperatorEnabled(db, b, true, seed.userId)).rejects.toBeInstanceOf(PipelineValidationError)

    // Rolled back: 'b' stays disabled and no enabled change_log row landed.
    const op = await db.selectFrom('operators').select('enabled').where('id', '=', b).executeTakeFirstOrThrow()
    expect(op.enabled).toBe(0)
    expect((await lastChangeLog('operator', b))?.action).toBe('created')
  })

  it('edit/enable/delete of a missing Operator throw NotFoundError', async () => {
    await expect(
      editOperator(db, {
        operatorId: 99999,
        configJson: taggerConfig('urgency'),
        actorUserId: seed.userId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError)
    await expect(setOperatorEnabled(db, 99999, true, seed.userId)).rejects.toBeInstanceOf(NotFoundError)
    await expect(softDeleteOperator(db, 99999, seed.userId)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('targeting a soft-deleted Operator throws NotFoundError', async () => {
    const id = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'gone',
      typeKey: 'rule_based_tagger',
      configJson: taggerConfig('urgency'),
      enabled: true,
      actorUserId: seed.userId,
    })
    await softDeleteOperator(db, id, seed.userId)
    await expect(
      editOperator(db, {
        operatorId: id,
        configJson: taggerConfig('urgency'),
        actorUserId: seed.userId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('Credential soft-delete of a missing/deleted credential throws NotFoundError', async () => {
    await expect(softDeleteCredential(db, 99999, seed.userId)).rejects.toBeInstanceOf(NotFoundError)

    // A second soft-delete of an already-deleted credential also throws.
    const credId = await seedPushoverCredential(db, seed.userId)
    await softDeleteCredential(db, credId, seed.userId)
    await expect(softDeleteCredential(db, credId, seed.userId)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('Pipeline soft-delete of a missing/deleted pipeline throws NotFoundError', async () => {
    await expect(softDeletePipeline(db, 99999, seed.userId)).rejects.toBeInstanceOf(NotFoundError)

    await softDeletePipeline(db, seed.pipelineId, seed.userId)
    await expect(softDeletePipeline(db, seed.pipelineId, seed.userId)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('Pipeline soft-delete cascades operators, refs, account, current_triages', async () => {
    const credId = await seedPushoverCredential(db, seed.userId)
    const opId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'notify',
      typeKey: 'notify',
      configJson: notifyConfig(credId),
      enabled: true,
      actorUserId: seed.userId,
    })
    // Seed a current_triages row to verify it gets deleted.
    const triage = await db
      .insertInto('triages')
      .values({
        message_id: seed.messageId,
        pipeline_id: seed.pipelineId,
        triggered_by: 'message_arrival',
        actor_user_id: null,
        started_at: 1000,
        ended_at: 1000,
        status: 'completed',
        error_summary: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db
      .insertInto('current_triages')
      .values({
        message_id: seed.messageId,
        pipeline_id: seed.pipelineId,
        triage_id: triage.id,
        triage_started_at: 1000,
        updated_at: 1000,
      })
      .execute()

    await softDeletePipeline(db, seed.pipelineId, seed.userId)

    const pipeline = await db
      .selectFrom('pipelines')
      .select('deleted_at')
      .where('id', '=', seed.pipelineId)
      .executeTakeFirstOrThrow()
    expect(pipeline.deleted_at).not.toBeNull()

    const op = await db.selectFrom('operators').select('deleted_at').where('id', '=', opId).executeTakeFirstOrThrow()
    expect(op.deleted_at).not.toBeNull()

    const refs = await db
      .selectFrom('operator_credential_references')
      .selectAll()
      .where('operator_id', '=', opId)
      .execute()
    expect(refs).toEqual([])

    const account = await db
      .selectFrom('accounts')
      .select('active_pipeline_id')
      .where('id', '=', seed.accountId)
      .executeTakeFirstOrThrow()
    expect(account.active_pipeline_id).toBeNull()

    const current = await db
      .selectFrom('current_triages')
      .selectAll()
      .where('pipeline_id', '=', seed.pipelineId)
      .execute()
    expect(current).toEqual([])

    expect((await lastChangeLog('pipeline', seed.pipelineId))?.action).toBe('deleted')
  })
})
