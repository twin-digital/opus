import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type DB, closeDatabase } from '../../db/index.js'
import { createApiRoutes } from './index.js'
import { fixedNow, freshDb, insertOperator, insertPipeline, insertUser } from './test-support.js'

function jsonReq(path: string, method: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

function notifyConfig(kind?: string): string {
  return JSON.stringify({
    message_template: '{{subject}}',
    credentials_id: 1,
    ...(kind === undefined ? {} : { notification_kind: kind }),
  })
}

describe('/api/cooldowns (d-k3wq81vn, d-t6mhv3aq, r-t4jn8zvw)', () => {
  let db: DB
  let userId: number

  beforeEach(async () => {
    db = await freshDb()
    userId = await insertUser(db)
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  const app = () => createApiRoutes({ db, now: fixedNow })

  async function create(kind: string, intervalSeconds: number): Promise<number> {
    const res = await app().request(jsonReq('/api/cooldowns', 'POST', { kind, interval_seconds: intervalSeconds }))
    expect(res.status).toBe(201)
    return ((await res.json()) as { id: number }).id
  }

  it('GET lists the cooldowns with kind, interval_seconds, and created_at', async () => {
    const id = await create('Bank alerts', 3600)
    const res = await app().request('/api/cooldowns')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { cooldowns: unknown[]; kinds_in_use: string[] }
    expect(body.cooldowns).toEqual([
      { id, kind: 'Bank alerts', interval_seconds: 3600, created_at: expect.any(Number) },
    ])
    expect(body.kinds_in_use).toEqual([])
  })

  it('GET reports the kinds enabled notify operators currently name (kinds_in_use)', async () => {
    const pipelineId = await insertPipeline(db, userId)
    await insertOperator(db, pipelineId, { name: 'n1', typeKey: 'notify', configJson: notifyConfig('Bank alerts') })
    // A second operator sharing the kind contributes no duplicate.
    await insertOperator(db, pipelineId, { name: 'n2', typeKey: 'notify', configJson: notifyConfig('Bank alerts') })
    await insertOperator(db, pipelineId, { name: 'n3', typeKey: 'notify', configJson: notifyConfig('Deliveries') })
    // Kind-less, disabled, and non-notify operators contribute nothing.
    await insertOperator(db, pipelineId, { name: 'n4', typeKey: 'notify', configJson: notifyConfig() })
    await insertOperator(db, pipelineId, {
      name: 'n5',
      typeKey: 'notify',
      configJson: notifyConfig('Disabled kind'),
      enabled: false,
    })

    const res = await app().request('/api/cooldowns')
    const body = (await res.json()) as { kinds_in_use: string[] }
    expect(body.kinds_in_use).toEqual(['Bank alerts', 'Deliveries'])
  })

  it('POST creates a cooldown from {kind, interval_seconds}, trimming the kind, and returns its id', async () => {
    const id = await create('  Bank alerts ', 60)
    const row = await db.selectFrom('notification_cooldowns').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    expect(row).toMatchObject({ user_id: userId, kind: 'Bank alerts', interval_seconds: 60 })
  })

  it('POST refuses interval_seconds below 1 and non-integer intervals (d-t6mhv3aq)', async () => {
    for (const interval of [0, -5, 1.5]) {
      const res = await app().request(jsonReq('/api/cooldowns', 'POST', { kind: 'k', interval_seconds: interval }))
      expect(res.status).toBe(400)
    }
    expect(await db.selectFrom('notification_cooldowns').selectAll().execute()).toEqual([])
  })

  it('POST refuses an empty or multi-line kind with the structured invalid_kind_name refusal (d-u2rotm38)', async () => {
    for (const kind of ['', '   ', 'a\nb']) {
      const res = await app().request(jsonReq('/api/cooldowns', 'POST', { kind, interval_seconds: 60 }))
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: { code: string } }
      expect(body.error.code).toBe('invalid_kind_name')
    }
  })

  it('POST answers 409 cooldown_conflict for a kind that already has a setting', async () => {
    await create('Bank alerts', 60)
    const res = await app().request(jsonReq('/api/cooldowns', 'POST', { kind: 'Bank alerts', interval_seconds: 90 }))
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: { code: string; details?: { kind: string } } }
    expect(body.error.code).toBe('cooldown_conflict')
    expect(body.error.details).toEqual({ kind: 'Bank alerts' })
  })

  it('PATCH changes the interval; DELETE removes the setting', async () => {
    const id = await create('Bank alerts', 60)

    const patch = await app().request(jsonReq(`/api/cooldowns/${id}`, 'PATCH', { interval_seconds: 7200 }))
    expect(patch.status).toBe(200)
    const row = await db.selectFrom('notification_cooldowns').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    expect(row.interval_seconds).toBe(7200)

    const del = await app().request(new Request(`http://localhost/api/cooldowns/${id}`, { method: 'DELETE' }))
    expect(del.status).toBe(200)
    expect(await db.selectFrom('notification_cooldowns').selectAll().execute()).toEqual([])

    // Editing or deleting a setting that is gone is a 404.
    expect((await app().request(jsonReq(`/api/cooldowns/${id}`, 'PATCH', { interval_seconds: 60 }))).status).toBe(404)
    expect(
      (await app().request(new Request(`http://localhost/api/cooldowns/${id}`, { method: 'DELETE' }))).status,
    ).toBe(404)
  })

  it('each accepted change appears in the change log with entity_type cooldown (d-w2fzk9bd)', async () => {
    const id = await create('Bank alerts', 60)
    await app().request(jsonReq(`/api/cooldowns/${id}`, 'PATCH', { interval_seconds: 7200 }))
    await app().request(new Request(`http://localhost/api/cooldowns/${id}`, { method: 'DELETE' }))

    const log = await db
      .selectFrom('change_log')
      .selectAll()
      .where('entity_type', '=', 'cooldown')
      .where('entity_id', '=', id)
      .orderBy('id', 'asc')
      .execute()
    expect(log.map((entry) => entry.action)).toEqual(['created', 'updated', 'deleted'])
    expect(log.every((entry) => entry.actor_user_id === userId)).toBe(true)
  })
})
