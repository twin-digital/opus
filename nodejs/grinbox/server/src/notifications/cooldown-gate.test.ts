import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Config } from '../config.js'
import { closeDatabase } from '../db/connection.js'
import type { Database } from '../db/schema.js'
import { seedDefaultLimits } from '../db/seed.js'
import { claimOperatorRun } from '../pipeline/claim.js'
import { createOperator } from '../pipeline/operator-save.js'
import { type SeedResult, freshDb, seedBase, seedPushoverCredential } from '../pipeline/test-helpers.js'
import { enqueueTriage } from '../pipeline/triage-enqueue.js'
import type { ResourceEvent, UnderlyingClients } from '../resources/make-resource-client.js'
import { staticMakeUnderlyingClients } from '../resources/underlying-clients.js'
import { type WorkerRunRow, runWorker } from '../execution/worker.js'
import { createNotificationGate } from './cooldown-gate.js'

const NOW = 1_750_000_000

async function insertCooldown(db: Kysely<Database>, userId: number, kind: string, intervalSeconds: number) {
  await db
    .insertInto('notification_cooldowns')
    .values({ user_id: userId, kind, interval_seconds: intervalSeconds, created_at: NOW - 10_000 })
    .execute()
}

describe('createNotificationGate', () => {
  let db: Kysely<Database>
  let seed: SeedResult
  let events: ResourceEvent[]

  beforeEach(async () => {
    db = await freshDb()
    seed = await seedBase(db)
    events = []
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  function gate(over: { triageId?: number; operatorId?: number; now?: number } = {}) {
    return createNotificationGate({
      db,
      userId: seed.userId,
      triageId: over.triageId ?? 501,
      operatorId: over.operatorId ?? 71,
      onEvent: (event) => events.push(event),
      now: () => over.now ?? NOW,
    })
  }

  it('a kind with no cooldown setting is never suppressed (d-t6mhv3aq)', async () => {
    // A prior push of the kind exists, but no setting → no cooldown at all.
    await gate({ triageId: 1, operatorId: 1 }).recordPush('Bank alerts')
    const verdict = await gate().checkCooldown('Bank alerts')
    expect(verdict).toEqual({ suppressed: false })
    expect(events).toEqual([])
  })

  it('a push inside the interval suppresses: verdict carries the kind and the run whose push it deferred to (d-e9jslw4x)', async () => {
    await insertCooldown(db, seed.userId, 'Bank alerts', 3600)
    await gate({ triageId: 42, operatorId: 7, now: NOW - 600 }).recordPush('Bank alerts')

    const verdict = await gate().checkCooldown('Bank alerts')
    expect(verdict).toEqual({
      suppressed: true,
      kind: 'Bank alerts',
      deferred_to: { triage_id: 42, operator_id: 7 },
    })
  })

  it('suppression emits a resource_op_suppressed event through the run event channel, with kind and deferred-to run identifiers', async () => {
    await insertCooldown(db, seed.userId, 'Bank alerts', 3600)
    await gate({ triageId: 42, operatorId: 7, now: NOW - 600 }).recordPush('Bank alerts')

    await gate().checkCooldown('Bank alerts')
    expect(events).toEqual([
      {
        event_type: 'resource_op_suppressed',
        details: { kind: 'Bank alerts', deferred_to_triage_id: 42, deferred_to_operator_id: 7 },
      },
    ])
  })

  it('a push outside the interval is not suppressed; the newest delivered push is the one deferred to', async () => {
    await insertCooldown(db, seed.userId, 'Bank alerts', 3600)
    // One push outside the interval — passes.
    await gate({ triageId: 10, operatorId: 7, now: NOW - 4000 }).recordPush('Bank alerts')
    expect(await gate().checkCooldown('Bank alerts')).toEqual({ suppressed: false })

    // Two pushes inside — the newest is the one deferred to.
    await gate({ triageId: 11, operatorId: 7, now: NOW - 900 }).recordPush('Bank alerts')
    await gate({ triageId: 12, operatorId: 7, now: NOW - 300 }).recordPush('Bank alerts')
    const verdict = await gate().checkCooldown('Bank alerts')
    expect(verdict).toMatchObject({ suppressed: true, deferred_to: { triage_id: 12, operator_id: 7 } })
  })

  it('recordPush records the delivered push per user and kind for later runs to defer to', async () => {
    await gate({ triageId: 42, operatorId: 7 }).recordPush('Bank alerts')
    const rows = await db.selectFrom('notification_pushes').selectAll().execute()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      user_id: seed.userId,
      kind: 'Bank alerts',
      triage_id: 42,
      operator_id: 7,
      sent_at: NOW,
    })
  })

  it('operators naming one kind share one cooldown across pipelines (d-k3wq81vn)', async () => {
    await insertCooldown(db, seed.userId, 'Bank alerts', 3600)
    // A push delivered by a different operator (another pipeline's notify).
    await gate({ triageId: 42, operatorId: 7, now: NOW - 600 }).recordPush('Bank alerts')

    // A different operator asking about the same kind is suppressed by it;
    // matching is character-for-character (d-p8xrn2ce), so a differently-cased
    // kind is a different kind.
    const other = gate({ triageId: 99, operatorId: 8 })
    expect(await other.checkCooldown('Bank alerts')).toMatchObject({ suppressed: true })
    expect(await other.checkCooldown('bank alerts')).toEqual({ suppressed: false })
  })
})

// --- Notify + worker integration (the gate wired into the run path) --------

function testConfig(): Config {
  return {
    dbPath: ':memory:',
    httpPort: 8787,
    httpHost: '127.0.0.1',
    tokenEncKey: Buffer.alloc(32),
    operatorTimeoutMs: 30_000,
    workerPoolSize: 3,
  } as Config
}

describe('notify with a kind (d-vn2jdxbs, d-5amonj40, d-6ptxams7)', () => {
  let db: Kysely<Database>
  let seed: SeedResult
  let sends: unknown[]

  beforeEach(async () => {
    db = await freshDb()
    seed = await seedBase(db)
    await seedDefaultLimits(db, seed.userId)
    sends = []
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  /** Underlying clients where only Pushover works, recording each send. */
  function pushoverClients(): UnderlyingClients {
    const unused = () => {
      throw new Error('not used in this test')
    }
    return {
      llm_bedrock: { invoke_model: unused },
      mailbox: {
        apply_category: unused,
        archive: unused,
        fetch_metadata: unused,
        fetch_body: unused,
        list_messages: unused,
      },
      mail_sender: { send_message: unused },
      pushover_api: {
        send_notification: async (args) => {
          sends.push(args)
          return { message_id: `push-${sends.length}` }
        },
      },
    }
  }

  /** Create the notify operator, enqueue + claim a run for `messageId`. */
  async function claimNotifyRun(kind: string | undefined, messageId: number) {
    const configJson = JSON.stringify({
      message_template: '{{subject}}',
      credentials_id: await seedPushoverCredential(db, seed.userId),
      ...(kind === undefined ? {} : { notification_kind: kind }),
    })
    const opId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: `notify-${Math.random().toString(36).slice(2)}`,
      typeKey: 'notify',
      configJson,
      enabled: true,
      actorUserId: null,
    })
    return claimRunFor(opId, configJson, messageId)
  }

  async function claimRunFor(opId: number, configJson: string, messageId: number) {
    const { triageId } = await enqueueTriage(db, {
      messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })
    await claimOperatorRun(db, triageId, opId, 1500)
    const row: WorkerRunRow = {
      triage_id: triageId,
      operator_id: opId,
      message_id: messageId,
      type_key: 'notify',
      type_code_version: '1',
      op_config_json: configJson,
    }
    return { row, triageId, opId }
  }

  async function insertMessage(backendId: string): Promise<number> {
    const row = await db
      .insertInto('messages')
      .values({ account_id: seed.accountId, backend_message_id: backendId, created_at: 1000 })
      .returning('id')
      .executeTakeFirstOrThrow()
    return row.id
  }

  async function runRow(triageId: number, opId: number) {
    return db
      .selectFrom('triage_operator_runs')
      .selectAll()
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', opId)
      .executeTakeFirstOrThrow()
  }

  it('a suppressed push reaches no resource: send_notification is never invoked and no limit counter moves', async () => {
    await insertCooldown(db, seed.userId, 'Bank alerts', 3600)
    // A just-delivered push of the kind, from some earlier run.
    await db
      .insertInto('notification_pushes')
      .values({
        user_id: seed.userId,
        kind: 'Bank alerts',
        triage_id: 900,
        operator_id: 90,
        sent_at: Math.floor(Date.now() / 1000),
      })
      .execute()

    const { row, triageId, opId } = await claimNotifyRun('Bank alerts', seed.messageId)
    await runWorker(db, row, staticMakeUnderlyingClients(pushoverClients()), testConfig())

    expect(sends).toEqual([])
    // No limit counter moved: a suppressed push counts against no limit (d-6ptxams7).
    expect(await db.selectFrom('limit_counters_window').selectAll().execute()).toEqual([])
    expect(await db.selectFrom('limit_counters_message').selectAll().execute()).toEqual([])
    // The suppression is the run's own recorded outcome (d-e9jslw4x), and the
    // details let the interface resolve the deferred-to push to its run's triage.
    const events = await db
      .selectFrom('triage_events')
      .selectAll()
      .where('triage_id', '=', triageId)
      .where('event_type', '=', 'resource_op_suppressed')
      .execute()
    expect(events).toHaveLength(1)
    expect(JSON.parse(events[0]?.details_json as string)).toEqual({
      kind: 'Bank alerts',
      deferred_to_triage_id: 900,
      deferred_to_operator_id: 90,
    })
    expect((await runRow(triageId, opId)).status).toBe('completed')
  })

  it('a suppressed run completes (not failed); the triage settles as it would have', async () => {
    await insertCooldown(db, seed.userId, 'Bank alerts', 3600)
    await db
      .insertInto('notification_pushes')
      .values({
        user_id: seed.userId,
        kind: 'Bank alerts',
        triage_id: 900,
        operator_id: 90,
        sent_at: Math.floor(Date.now() / 1000),
      })
      .execute()

    const { row, triageId, opId } = await claimNotifyRun('Bank alerts', seed.messageId)
    await runWorker(db, row, staticMakeUnderlyingClients(pushoverClients()), testConfig())

    expect((await runRow(triageId, opId)).status).toBe('completed')
    const triage = await db
      .selectFrom('triages')
      .select(['status'])
      .where('id', '=', triageId)
      .executeTakeFirstOrThrow()
    expect(triage.status).toBe('completed')
  })

  it('a notify naming no kind has no cooldown and sends exactly as before (r-5ezt7j0v)', async () => {
    // Cooldowns exist, but a kind-less operator is grouped with nothing.
    await insertCooldown(db, seed.userId, 'Bank alerts', 3600)

    const { row, triageId, opId } = await claimNotifyRun(undefined, seed.messageId)
    await runWorker(db, row, staticMakeUnderlyingClients(pushoverClients()), testConfig())

    expect(sends).toHaveLength(1)
    expect((await runRow(triageId, opId)).status).toBe('completed')
    // A kind-less push is recorded nowhere and grouped with nothing.
    expect(await db.selectFrom('notification_pushes').selectAll().execute()).toEqual([])
  })

  it('a successful kind-named push is recorded so a burst of related mail costs one push (r-lph86tsg)', async () => {
    await insertCooldown(db, seed.userId, 'Bank alerts', 3600)

    // First message of the burst: no prior push, so it sends and records.
    const first = await claimNotifyRun('Bank alerts', seed.messageId)
    await runWorker(db, first.row, staticMakeUnderlyingClients(pushoverClients()), testConfig())
    expect(sends).toHaveLength(1)
    const pushes = await db.selectFrom('notification_pushes').selectAll().execute()
    expect(pushes).toHaveLength(1)
    expect(pushes[0]).toMatchObject({
      user_id: seed.userId,
      kind: 'Bank alerts',
      triage_id: first.triageId,
      operator_id: first.opId,
    })

    // Second related message, inside the interval: suppressed, deferring to
    // the first run's push — the burst cost one push.
    const secondMessage = await insertMessage('m2')
    const second = await claimRunFor(first.opId, first.row.op_config_json, secondMessage)
    await runWorker(db, second.row, staticMakeUnderlyingClients(pushoverClients()), testConfig())

    expect(sends).toHaveLength(1)
    expect((await runRow(second.triageId, first.opId)).status).toBe('completed')
    const events = await db
      .selectFrom('triage_events')
      .selectAll()
      .where('triage_id', '=', second.triageId)
      .where('event_type', '=', 'resource_op_suppressed')
      .execute()
    expect(events).toHaveLength(1)
    expect(JSON.parse(events[0]?.details_json as string)).toEqual({
      kind: 'Bank alerts',
      deferred_to_triage_id: first.triageId,
      deferred_to_operator_id: first.opId,
    })
  })

  it('seeded limits still bind under the cooldown: a push the cooldown passes can still be skipped_by_limit', async () => {
    await insertCooldown(db, seed.userId, 'Bank alerts', 1)

    const first = await claimNotifyRun('Bank alerts', seed.messageId)
    await runWorker(db, first.row, staticMakeUnderlyingClients(pushoverClients()), testConfig())
    expect(sends).toHaveLength(1)

    // Age the recorded push past the 1s interval so the cooldown passes.
    await db
      .updateTable('notification_pushes')
      .set({ sent_at: Math.floor(Date.now() / 1000) - 60 })
      .execute()

    // A replay of the same message passes the cooldown but hits the seeded
    // per-message limit (max 1): skipped_by_limit, not a second push.
    const replay = await claimRunFor(first.opId, first.row.op_config_json, seed.messageId)
    await runWorker(db, replay.row, staticMakeUnderlyingClients(pushoverClients()), testConfig())

    expect(sends).toHaveLength(1)
    expect((await runRow(replay.triageId, first.opId)).status).toBe('completed')
    const events = await db
      .selectFrom('triage_events')
      .selectAll()
      .where('triage_id', '=', replay.triageId)
      .where('event_type', '=', 'resource_op_limited')
      .execute()
    expect(events).toHaveLength(1)
    // A limit-skipped push was not delivered, so it is not recorded for later
    // runs to defer to.
    expect(await db.selectFrom('notification_pushes').selectAll().execute()).toHaveLength(1)
  })
})
