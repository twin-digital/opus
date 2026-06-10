import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decryptPushoverPayload } from '../../config/credential-store.js'
import { makeEncryptor } from '../../crypto/encryption.js'
import { type DB, closeDatabase } from '../../db/index.js'
import { createApiRoutes } from './index.js'
import {
  fixedNow,
  freshDb,
  insertAccount,
  insertMessage,
  insertOperator,
  insertPipeline,
  insertUser,
  ruleTaggerConfig,
} from './test-support.js'

/** Build the chained /api app with an encryptor wired for credential tests. */
function appFor(db: DB) {
  return createApiRoutes({
    db,
    now: fixedNow,
    encryptor: makeEncryptor(randomBytes(32)),
  })
}

function jsonReq(path: string, method: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function changeLog(db: DB, entityType: string, entityId: number) {
  return db
    .selectFrom('change_log')
    .selectAll()
    .where('entity_type', '=', entityType)
    .where('entity_id', '=', entityId)
    .orderBy('id', 'asc')
    .execute()
}

describe('Pipeline write routes', () => {
  let db: DB
  let userId: number
  beforeEach(async () => {
    db = await freshDb()
    userId = await insertUser(db)
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('POST /api/pipelines creates a pipeline + change_log', async () => {
    const app = appFor(db)
    const res = await app.request(jsonReq('/api/pipelines', 'POST', { name: 'p1', description: 'desc' }))
    expect(res.status).toBe(201)
    const { id } = (await res.json()) as { id: number }

    const row = await db.selectFrom('pipelines').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    expect(row.name).toBe('p1')
    expect(row.description).toBe('desc')

    const log = await changeLog(db, 'pipeline', id)
    expect(log).toHaveLength(1)
    expect(log.at(0)?.action).toBe('created')
  })

  it('POST /api/pipelines rejects a duplicate live name with 409', async () => {
    await insertPipeline(db, userId, 'dup')
    const app = appFor(db)
    const res = await app.request(jsonReq('/api/pipelines', 'POST', { name: 'dup' }))
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('pipeline_name_conflict')
  })

  it('PATCH /api/pipelines/:id edits name + description', async () => {
    const pid = await insertPipeline(db, userId, 'old', 'olddesc')
    const app = appFor(db)
    const res = await app.request(
      jsonReq(`/api/pipelines/${pid}`, 'PATCH', {
        name: 'new',
        description: null,
      }),
    )
    expect(res.status).toBe(200)
    const row = await db.selectFrom('pipelines').selectAll().where('id', '=', pid).executeTakeFirstOrThrow()
    expect(row.name).toBe('new')
    expect(row.description).toBeNull()
    const log = await changeLog(db, 'pipeline', pid)
    expect(log.at(-1)?.action).toBe('updated')
  })

  it('PATCH /api/pipelines/:id 404 for unknown id', async () => {
    const app = appFor(db)
    const res = await app.request(jsonReq('/api/pipelines/999', 'PATCH', { name: 'x' }))
    expect(res.status).toBe(404)
  })

  it('DELETE /api/pipelines/:id soft-deletes + cascades operators', async () => {
    const pid = await insertPipeline(db, userId, 'p')
    const opId = await insertOperator(db, pid, {
      name: 'op',
      typeKey: 'rule_based_tagger',
      configJson: ruleTaggerConfig('urgency'),
    })
    const acctId = await insertAccount(db, userId, { activePipelineId: pid })

    const app = appFor(db)
    const res = await app.request(jsonReq(`/api/pipelines/${pid}`, 'DELETE'))
    expect(res.status).toBe(200)

    const pipeline = await db.selectFrom('pipelines').selectAll().where('id', '=', pid).executeTakeFirstOrThrow()
    expect(pipeline.deleted_at).not.toBeNull()
    const op = await db.selectFrom('operators').selectAll().where('id', '=', opId).executeTakeFirstOrThrow()
    expect(op.deleted_at).not.toBeNull()
    const acct = await db.selectFrom('accounts').selectAll().where('id', '=', acctId).executeTakeFirstOrThrow()
    expect(acct.active_pipeline_id).toBeNull()
  })
})

describe('Operator write routes', () => {
  let db: DB
  let userId: number
  let pid: number
  beforeEach(async () => {
    db = await freshDb()
    userId = await insertUser(db)
    pid = await insertPipeline(db, userId, 'p')
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('POST creates an operator with valid config', async () => {
    const app = appFor(db)
    const res = await app.request(
      jsonReq(`/api/pipelines/${pid}/operators`, 'POST', {
        name: 'urgency',
        type_key: 'rule_based_tagger',
        config: {
          output_tag_key: 'urgency',
          output_value_enum: ['high', 'low'],
          rules: [],
          fallback: { output: 'low' },
        },
      }),
    )
    expect(res.status).toBe(201)
    const { id } = (await res.json()) as { id: number }
    const row = await db.selectFrom('operators').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    expect(row.name).toBe('urgency')
    expect(row.enabled).toBe(1)
    const log = await changeLog(db, 'operator', id)
    expect(log.at(0)?.action).toBe('created')
  })

  it('POST rejects an invalid config body with 400', async () => {
    const app = appFor(db)
    const res = await app.request(
      jsonReq(`/api/pipelines/${pid}/operators`, 'POST', {
        name: 'bad',
        type_key: 'rule_based_tagger',
        // missing required fields
        config: { output_tag_key: 'x' },
      }),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('invalid_config')
    const count = await db
      .selectFrom('operators')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow()
    expect(count.n).toBe(0)
  })

  it('PATCH edits operator config', async () => {
    const opId = await insertOperator(db, pid, {
      name: 'urgency',
      typeKey: 'rule_based_tagger',
      configJson: ruleTaggerConfig('urgency', ['high', 'low']),
    })
    const app = appFor(db)
    const res = await app.request(
      jsonReq(`/api/operators/${opId}`, 'PATCH', {
        config: {
          output_tag_key: 'urgency',
          output_value_enum: ['high', 'mid', 'low'],
          rules: [],
          fallback: { output: 'mid' },
        },
      }),
    )
    expect(res.status).toBe(200)
    const row = await db.selectFrom('operators').select('config_json').where('id', '=', opId).executeTakeFirstOrThrow()
    expect(JSON.parse(row.config_json).output_value_enum).toEqual(['high', 'mid', 'low'])
    const log = await changeLog(db, 'operator', opId)
    expect(log.at(-1)?.action).toBe('updated')
  })

  it('PATCH that collides on an output tag key → 400 + no write', async () => {
    await insertOperator(db, pid, {
      name: 'a',
      typeKey: 'rule_based_tagger',
      configJson: ruleTaggerConfig('shared', ['x', 'y']),
    })
    const bId = await insertOperator(db, pid, {
      name: 'b',
      typeKey: 'rule_based_tagger',
      configJson: ruleTaggerConfig('bkey', ['x', 'y']),
    })
    const app = appFor(db)
    const res = await app.request(
      jsonReq(`/api/operators/${bId}`, 'PATCH', {
        // change b to also produce 'shared' → collision
        config: ruleTaggerConfigObj('shared', ['x', 'y']),
      }),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('pipeline_validation_failed')
    // b must be unchanged.
    const row = await db.selectFrom('operators').select('config_json').where('id', '=', bId).executeTakeFirstOrThrow()
    expect(JSON.parse(row.config_json).output_tag_key).toBe('bkey')
  })

  it('enable / disable toggle + change_log action', async () => {
    const opId = await insertOperator(db, pid, {
      name: 'op',
      typeKey: 'rule_based_tagger',
      configJson: ruleTaggerConfig('urgency'),
      enabled: false,
    })
    const app = appFor(db)

    let res = await app.request(jsonReq(`/api/operators/${opId}/enable`, 'POST'))
    expect(res.status).toBe(200)
    let row = await db.selectFrom('operators').select('enabled').where('id', '=', opId).executeTakeFirstOrThrow()
    expect(row.enabled).toBe(1)

    res = await app.request(jsonReq(`/api/operators/${opId}/disable`, 'POST'))
    expect(res.status).toBe(200)
    row = await db.selectFrom('operators').select('enabled').where('id', '=', opId).executeTakeFirstOrThrow()
    expect(row.enabled).toBe(0)

    const log = await changeLog(db, 'operator', opId)
    const actions = log.map((l) => l.action)
    expect(actions).toContain('enabled')
    expect(actions).toContain('disabled')
  })

  it('DELETE soft-deletes operator', async () => {
    const opId = await insertOperator(db, pid, {
      name: 'op',
      typeKey: 'rule_based_tagger',
      configJson: ruleTaggerConfig('urgency'),
    })
    const app = appFor(db)
    const res = await app.request(jsonReq(`/api/operators/${opId}`, 'DELETE'))
    expect(res.status).toBe(200)
    const row = await db.selectFrom('operators').select('deleted_at').where('id', '=', opId).executeTakeFirstOrThrow()
    expect(row.deleted_at).not.toBeNull()
  })
})

function ruleTaggerConfigObj(key: string, valueEnum: string[]) {
  return {
    output_tag_key: key,
    output_value_enum: valueEnum,
    rules: [],
    fallback: { output: valueEnum[0] },
  }
}

describe('Account write routes', () => {
  let db: DB
  let userId: number
  beforeEach(async () => {
    db = await freshDb()
    userId = await insertUser(db)
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('PATCH sets active pipeline + cadence', async () => {
    const pid = await insertPipeline(db, userId, 'p')
    const acctId = await insertAccount(db, userId, {})
    const app = appFor(db)
    const res = await app.request(
      jsonReq(`/api/accounts/${acctId}`, 'PATCH', {
        active_pipeline_id: pid,
        poll_interval_seconds: 1200,
      }),
    )
    expect(res.status).toBe(200)
    const row = await db.selectFrom('accounts').selectAll().where('id', '=', acctId).executeTakeFirstOrThrow()
    expect(row.active_pipeline_id).toBe(pid)
    expect(row.poll_interval_seconds).toBe(1200)
    const log = await changeLog(db, 'account', acctId)
    expect(log.at(-1)?.action).toBe('updated')
  })

  it('PATCH sets display name, icon, and color', async () => {
    const acctId = await insertAccount(db, userId, {})
    const app = appFor(db)
    const res = await app.request(
      jsonReq(`/api/accounts/${acctId}`, 'PATCH', {
        name: 'Work',
        icon: 'briefcase',
        color: 'sky',
      }),
    )
    expect(res.status).toBe(200)
    const row = await db
      .selectFrom('accounts')
      .select(['name', 'icon', 'color'])
      .where('id', '=', acctId)
      .executeTakeFirstOrThrow()
    expect(row).toEqual({ name: 'Work', icon: 'briefcase', color: 'sky' })
  })

  it('PATCH rejects an unknown icon/color with 400', async () => {
    const acctId = await insertAccount(db, userId, {})
    const app = appFor(db)
    const res = await app.request(jsonReq(`/api/accounts/${acctId}`, 'PATCH', { icon: 'banana' }))
    expect(res.status).toBe(400)
  })

  it('PATCH rejects out-of-range cadence with 400', async () => {
    const acctId = await insertAccount(db, userId, {})
    const app = appFor(db)
    for (const bad of [30, 100000]) {
      const res = await app.request(
        jsonReq(`/api/accounts/${acctId}`, 'PATCH', {
          poll_interval_seconds: bad,
        }),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe('poll_interval_out_of_range')
    }
    // unchanged
    const row = await db
      .selectFrom('accounts')
      .select('poll_interval_seconds')
      .where('id', '=', acctId)
      .executeTakeFirstOrThrow()
    expect(row.poll_interval_seconds).toBe(600)
  })

  it('PATCH rejects a deleted pipeline assignment with 400', async () => {
    const acctId = await insertAccount(db, userId, {})
    const app = appFor(db)
    const res = await app.request(
      jsonReq(`/api/accounts/${acctId}`, 'PATCH', {
        active_pipeline_id: 999,
      }),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('pipeline_not_assignable')
  })

  it('DELETE soft-deletes account + cascades credentials', async () => {
    const acctId = await insertAccount(db, userId, {})
    const credId = await db
      .insertInto('credentials')
      .values({
        user_id: userId,
        account_id: acctId,
        kind: 'gmail_oauth',
        data_enc: Buffer.from('x'),
        created_at: 1000,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    const app = appFor(db)
    const res = await app.request(jsonReq(`/api/accounts/${acctId}`, 'DELETE'))
    expect(res.status).toBe(200)
    const acct = await db.selectFrom('accounts').select('deleted_at').where('id', '=', acctId).executeTakeFirstOrThrow()
    expect(acct.deleted_at).not.toBeNull()
    const cred = await db
      .selectFrom('credentials')
      .select('deleted_at')
      .where('id', '=', credId.id)
      .executeTakeFirstOrThrow()
    expect(cred.deleted_at).not.toBeNull()
  })
})

describe('Replay route', () => {
  let db: DB
  let userId: number
  beforeEach(async () => {
    db = await freshDb()
    userId = await insertUser(db)
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('POST /api/messages/:id/replay enqueues a user_replay triage', async () => {
    const pid = await insertPipeline(db, userId, 'p')
    const opId = await insertOperator(db, pid, {
      name: 'op',
      typeKey: 'rule_based_tagger',
      configJson: ruleTaggerConfig('urgency'),
    })
    const acctId = await insertAccount(db, userId, { activePipelineId: pid })
    const mId = await insertMessage(db, acctId, { backendMessageId: 'm1' })

    const app = appFor(db)
    const res = await app.request(jsonReq(`/api/messages/${mId}/replay`, 'POST'))
    expect(res.status).toBe(201)
    const body = (await res.json()) as { triage_id: number; status: string }
    expect(body.status).toBe('running')

    const triage = await db.selectFrom('triages').selectAll().where('id', '=', body.triage_id).executeTakeFirstOrThrow()
    expect(triage.triggered_by).toBe('user_replay')
    expect(triage.actor_user_id).toBe(userId)

    const runs = await db
      .selectFrom('triage_operator_runs')
      .selectAll()
      .where('triage_id', '=', body.triage_id)
      .execute()
    expect(runs).toHaveLength(1)
    expect(runs.at(0)?.operator_id).toBe(opId)
    expect(runs.at(0)?.status).toBe('pending')
  })

  it('replay 400 when the account has no active pipeline', async () => {
    const acctId = await insertAccount(db, userId, { activePipelineId: null })
    const mId = await insertMessage(db, acctId, { backendMessageId: 'm1' })
    const app = appFor(db)
    const res = await app.request(jsonReq(`/api/messages/${mId}/replay`, 'POST'))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('no_active_pipeline')
  })

  it('replay 404 for unknown message', async () => {
    const app = appFor(db)
    const res = await app.request(jsonReq('/api/messages/999/replay', 'POST'))
    expect(res.status).toBe(404)
  })
})

describe('Limit write routes', () => {
  let db: DB
  let userId: number
  beforeEach(async () => {
    db = await freshDb()
    userId = await insertUser(db)
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('create / edit / delete with counter cascade', async () => {
    const app = appFor(db)
    // create
    let res = await app.request(
      jsonReq('/api/limits', 'POST', {
        resource: 'pushover_api',
        operation: 'send_notification',
        scope: 'per_window',
        max_count: 5,
        window_seconds: 600,
      }),
    )
    expect(res.status).toBe(201)
    const { id } = (await res.json()) as { id: number }
    expect((await changeLog(db, 'limit', id)).at(0)?.action).toBe('created')

    // seed a window counter so we can prove the cascade
    await db.insertInto('limit_counters_window').values({ limit_id: id, window_start: 1000, count: 2 }).execute()

    // edit
    res = await app.request(
      jsonReq(`/api/limits/${id}`, 'PATCH', {
        max_count: 9,
        window_seconds: 1200,
      }),
    )
    expect(res.status).toBe(200)
    const edited = await db.selectFrom('limits').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    expect(edited.max_count).toBe(9)
    expect(edited.window_seconds).toBe(1200)

    // delete
    res = await app.request(jsonReq(`/api/limits/${id}`, 'DELETE'))
    expect(res.status).toBe(200)
    const remaining = await db.selectFrom('limits').select('id').where('id', '=', id).executeTakeFirst()
    expect(remaining).toBeUndefined()
    const counters = await db
      .selectFrom('limit_counters_window')
      .select('limit_id')
      .where('limit_id', '=', id)
      .execute()
    expect(counters).toHaveLength(0)
    const deleteLog = (await changeLog(db, 'limit', id)).at(-1)
    expect(deleteLog?.action).toBe('deleted')
    expect(deleteLog?.before_json).not.toBeNull()
  })

  it('create rejects an invalid definition (per_message with window) → 400', async () => {
    const app = appFor(db)
    const res = await app.request(
      jsonReq('/api/limits', 'POST', {
        resource: 'pushover_api',
        operation: 'send_notification',
        scope: 'per_message',
        max_count: 1,
        window_seconds: 600,
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe('Credential write routes', () => {
  let db: DB
  let userId: number
  beforeEach(async () => {
    db = await freshDb()
    userId = await insertUser(db)
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('POST stores an encrypted pushover credential that round-trips; change_log carries no blob', async () => {
    const key = randomBytes(32)
    const encryptor = makeEncryptor(key)
    const app = createApiRoutes({ db, now: fixedNow, encryptor })

    const res = await app.request(
      jsonReq('/api/credentials', 'POST', {
        kind: 'pushover',
        app_token: 'tok',
        user_key: 'usr',
      }),
    )
    expect(res.status).toBe(201)
    const { id } = (await res.json()) as { id: number }

    const row = await db.selectFrom('credentials').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    expect(row.kind).toBe('pushover')
    expect(row.account_id).toBeNull()
    const decrypted = decryptPushoverPayload(encryptor, row.data_enc)
    expect(decrypted).toEqual({ app_token: 'tok', user_key: 'usr' })

    const log = await changeLog(db, 'credential', id)
    expect(log.at(0)?.action).toBe('created')
    // No encrypted blob leaks into the audit trail.
    expect(log.at(0)?.after_json).not.toContain('app_token')
    expect(log.at(0)?.after_json).not.toContain('tok')
  })

  it('DELETE is blocked (409) when an Operator references the credential', async () => {
    const key = randomBytes(32)
    const encryptor = makeEncryptor(key)
    const app = createApiRoutes({ db, now: fixedNow, encryptor })

    // store credential
    const stored = await app.request(
      jsonReq('/api/credentials', 'POST', {
        kind: 'pushover',
        app_token: 'tok',
        user_key: 'usr',
      }),
    )
    const { id: credId } = (await stored.json()) as { id: number }

    // a notify operator referencing it
    const pid = await insertPipeline(db, userId, 'p')
    const opId = await insertOperator(db, pid, {
      name: 'notify',
      typeKey: 'notify',
      configJson: JSON.stringify({
        message_template: 'hi',
        credentials_id: credId,
      }),
    })
    await db.insertInto('operator_credential_references').values({ operator_id: opId, credential_id: credId }).execute()

    const res = await app.request(jsonReq(`/api/credentials/${credId}`, 'DELETE'))
    expect(res.status).toBe(409)
    const body = (await res.json()) as {
      error: { code: string; details: { operator_ids: number[] } }
    }
    expect(body.error.code).toBe('credential_in_use')
    expect(body.error.details.operator_ids).toContain(opId)

    // still live
    const cred = await db
      .selectFrom('credentials')
      .select('deleted_at')
      .where('id', '=', credId)
      .executeTakeFirstOrThrow()
    expect(cred.deleted_at).toBeNull()
  })

  it('DELETE soft-deletes an unreferenced credential', async () => {
    const key = randomBytes(32)
    const app = createApiRoutes({
      db,
      now: fixedNow,
      encryptor: makeEncryptor(key),
    })
    const stored = await app.request(
      jsonReq('/api/credentials', 'POST', {
        kind: 'pushover',
        app_token: 'tok',
        user_key: 'usr',
      }),
    )
    const { id: credId } = (await stored.json()) as { id: number }
    const res = await app.request(jsonReq(`/api/credentials/${credId}`, 'DELETE'))
    expect(res.status).toBe(200)
    const cred = await db
      .selectFrom('credentials')
      .select('deleted_at')
      .where('id', '=', credId)
      .executeTakeFirstOrThrow()
    expect(cred.deleted_at).not.toBeNull()
  })

  it('POST returns 400 when no encryptor is configured', async () => {
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request(
      jsonReq('/api/credentials', 'POST', {
        kind: 'pushover',
        app_token: 'tok',
        user_key: 'usr',
      }),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('encryptor_unconfigured')
  })
})

describe('write routes on an un-provisioned (user-less) DB', () => {
  let db: DB
  beforeEach(async () => {
    // Migrated but no user seeded → resolveActingUserId returns null.
    db = await freshDb()
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('returns a clean 400 no_user (not a 500/crash) on a write route', async () => {
    const app = appFor(db)
    const res = await app.request(jsonReq('/api/pipelines', 'POST', { name: 'p1' }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('no_user')
  })
})

describe('write-body refines reject an empty patch', () => {
  let db: DB
  let userId: number
  beforeEach(async () => {
    db = await freshDb()
    userId = await insertUser(db)
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('PATCH /api/pipelines/:id 400s when neither name nor description is given', async () => {
    const pid = await insertPipeline(db, userId, 'p')
    const app = appFor(db)
    const res = await app.request(jsonReq(`/api/pipelines/${pid}`, 'PATCH', {}))
    expect(res.status).toBe(400)
  })

  it('PATCH /api/accounts/:id 400s when no updatable field is given', async () => {
    const acctId = await insertAccount(db, userId, {})
    const app = appFor(db)
    const res = await app.request(jsonReq(`/api/accounts/${acctId}`, 'PATCH', {}))
    expect(res.status).toBe(400)
  })
})
