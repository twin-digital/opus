import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase } from '../db/connection.js'
import type { Database } from '../db/schema.js'
import { createOperator, softDeleteOperator } from '../pipeline/operator-save.js'
import { type SeedResult, freshDb, seedBase, seedPushoverCredential } from '../pipeline/test-helpers.js'
import {
  CooldownConflictError,
  InvalidKindNameError,
  createCooldown,
  deleteCooldown,
  editCooldown,
  normalizeKindName,
} from './cooldown-config.js'

describe('normalizeKindName (d-p8xrn2ce)', () => {
  it('trims surrounding whitespace and otherwise keeps the name as typed', () => {
    expect(normalizeKindName('  Bank alerts  ')).toBe('Bank alerts')
    expect(normalizeKindName('bank ALERTS')).toBe('bank ALERTS')
  })

  it('refuses an empty result and anything spanning more than one line', () => {
    expect(() => normalizeKindName('   ')).toThrow(InvalidKindNameError)
    expect(() => normalizeKindName('a\nb')).toThrow(InvalidKindNameError)
    expect(() => normalizeKindName('a\rb')).toThrow(InvalidKindNameError)
  })
})

describe('cooldown write patterns (d-k3wq81vn, d-t6mhv3aq, d-w2fzk9bd)', () => {
  let db: Kysely<Database>
  let seed: SeedResult

  beforeEach(async () => {
    db = await freshDb()
    seed = await seedBase(db)
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  async function changeLog(entityId: number) {
    return db
      .selectFrom('change_log')
      .selectAll()
      .where('entity_type', '=', 'cooldown')
      .where('entity_id', '=', entityId)
      .orderBy('id', 'asc')
      .execute()
  }

  it('createCooldown stores the trimmed kind, keyed per user and kind, and writes a change_log `created` entry naming entity_type cooldown', async () => {
    const id = await createCooldown(db, {
      userId: seed.userId,
      kind: '  Bank alerts ',
      intervalSeconds: 3600,
      actorUserId: seed.userId,
    })

    const row = await db.selectFrom('notification_cooldowns').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    expect(row).toMatchObject({ user_id: seed.userId, kind: 'Bank alerts', interval_seconds: 3600 })

    const log = await changeLog(id)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({
      user_id: seed.userId,
      actor_user_id: seed.userId,
      action: 'created',
      before_json: null,
    })
    expect(JSON.parse(log[0]?.after_json as string)).toEqual({ kind: 'Bank alerts', interval_seconds: 3600 })
  })

  it('createCooldown refuses a second cooldown for the same kind (character-for-character match)', async () => {
    await createCooldown(db, { userId: seed.userId, kind: 'Bank alerts', intervalSeconds: 60, actorUserId: null })
    await expect(
      createCooldown(db, { userId: seed.userId, kind: ' Bank alerts ', intervalSeconds: 90, actorUserId: null }),
    ).rejects.toBeInstanceOf(CooldownConflictError)
    // A differently-cased name is a different kind (d-p8xrn2ce) — accepted.
    await createCooldown(db, { userId: seed.userId, kind: 'bank alerts', intervalSeconds: 90, actorUserId: null })
  })

  it('editCooldown updates the interval and writes a change_log `updated` entry with before and after', async () => {
    const id = await createCooldown(db, {
      userId: seed.userId,
      kind: 'Bank alerts',
      intervalSeconds: 60,
      actorUserId: null,
    })
    await editCooldown(db, { cooldownId: id, intervalSeconds: 7200, actorUserId: seed.userId })

    const row = await db.selectFrom('notification_cooldowns').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    expect(row.interval_seconds).toBe(7200)

    const log = await changeLog(id)
    expect(log).toHaveLength(2)
    expect(log[1]?.action).toBe('updated')
    expect(JSON.parse(log[1]?.before_json as string)).toEqual({ kind: 'Bank alerts', interval_seconds: 60 })
    expect(JSON.parse(log[1]?.after_json as string)).toEqual({ kind: 'Bank alerts', interval_seconds: 7200 })
  })

  it('deleteCooldown removes the row — a kind with no setting has no cooldown — and writes a change_log `deleted` entry', async () => {
    const id = await createCooldown(db, {
      userId: seed.userId,
      kind: 'Bank alerts',
      intervalSeconds: 60,
      actorUserId: null,
    })
    await deleteCooldown(db, id, seed.userId)

    expect(await db.selectFrom('notification_cooldowns').selectAll().execute()).toEqual([])

    const log = await changeLog(id)
    expect(log).toHaveLength(2)
    expect(log[1]?.action).toBe('deleted')
    expect(JSON.parse(log[1]?.before_json as string)).toEqual({ kind: 'Bank alerts', interval_seconds: 60 })
    expect(log[1]?.after_json).toBeNull()
  })

  it('the setting outlives the operators naming its kind: deleting the notify operator leaves the cooldown standing', async () => {
    const credentialsId = await seedPushoverCredential(db, seed.userId)
    const operatorId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'notify',
      typeKey: 'notify',
      configJson: JSON.stringify({
        message_template: '{{subject}}',
        credentials_id: credentialsId,
        notification_kind: 'Bank alerts',
      }),
      enabled: true,
      actorUserId: null,
    })
    const id = await createCooldown(db, {
      userId: seed.userId,
      kind: 'Bank alerts',
      intervalSeconds: 60,
      actorUserId: null,
    })

    await softDeleteOperator(db, operatorId, seed.userId)

    const row = await db.selectFrom('notification_cooldowns').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    expect(row).toMatchObject({ kind: 'Bank alerts', interval_seconds: 60 })
  })
})
