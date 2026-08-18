/**
 * One test per row of d-41v9yqvh's case table, in the order the table states
 * them, plus the ordering between rows that can hold at once.
 */

import type { SourceState } from '@grinbox/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../config.js'
import { closeDatabase, openDatabase } from '../db/connection.js'
import { runMigrations } from '../db/migrator.js'
import type { DB, PendingArchiveStatus } from '../db/schema.js'
import { seedDefaultLimits } from '../db/seed.js'
import type { UnderlyingClients } from '../resources/make-resource-client.js'
import { staticMakeUnderlyingClients } from '../resources/underlying-clients.js'
import { createPendingArchiveScheduler } from './pending-archive-scheduler.js'

const NOW = 10_000
const DUE_AT = 5_000

let db: DB
let userId: number
let pipelineId: number
let accountId: number
let messageId: number
let operatorId: number
let triageId: number
let pendingArchiveId: number
let archiveCalls: { backendMessageId: string }[]
let archiveBehaviour: () => Promise<{ archived: boolean }>

const config = { operatorTimeoutMs: 30_000 } as Config

function clients(): UnderlyingClients {
  return {
    llm_bedrock: {
      invoke_model: () => Promise.reject(new Error('not wired')),
    },
    mailbox: {
      apply_category: () => Promise.reject(new Error('not wired')),
      archive: (args: { backendMessageId: string }) => {
        archiveCalls.push(args)
        return archiveBehaviour()
      },
      file: () => Promise.reject(new Error('not wired')),
      fetch_metadata: () => Promise.reject(new Error('not wired')),
      fetch_body: () => Promise.reject(new Error('not wired')),
      list_messages: () => Promise.reject(new Error('not wired')),
    },
    mail_sender: {
      send_message: () => Promise.reject(new Error('not wired')),
    },
    pushover_api: {
      send_notification: () => Promise.reject(new Error('not wired')),
    },
  }
}

function scheduler() {
  return createPendingArchiveScheduler({
    db,
    config,
    makeClients: staticMakeUnderlyingClients(clients()),
  })
}

/** Seed a message whose settled triage left a pending archive due at DUE_AT. */
async function seedDueRow(): Promise<void> {
  const user = await db
    .insertInto('users')
    .values({ name: 'u', email: 'u@example.com', created_at: 1000 })
    .returning('id')
    .executeTakeFirstOrThrow()
  userId = user.id
  await seedDefaultLimits(db, userId)

  const pipeline = await db
    .insertInto('pipelines')
    .values({ user_id: userId, name: 'p', description: null, created_at: 1000 })
    .returning('id')
    .executeTakeFirstOrThrow()
  pipelineId = pipeline.id

  const account = await db
    .insertInto('accounts')
    .values({
      user_id: userId,
      name: 'a',
      provider_type: 'gmail',
      active_pipeline_id: pipelineId,
      settings_json: '{}',
      created_at: 1000,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  accountId = account.id

  const message = await db
    .insertInto('messages')
    .values({ account_id: accountId, backend_message_id: 'gmail-abc', created_at: 1000 })
    .returning('id')
    .executeTakeFirstOrThrow()
  messageId = message.id

  const operator = await db
    .insertInto('operators')
    .values({
      pipeline_id: pipelineId,
      name: 'archive',
      type_key: 'archive',
      type_code_version: '1',
      config_json: JSON.stringify({ delay_seconds: 4000 }),
      enabled: 1,
      created_at: 1000,
      updated_at: 1000,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  operatorId = operator.id

  const triage = await db
    .insertInto('triages')
    .values({
      message_id: messageId,
      pipeline_id: pipelineId,
      triggered_by: 'message_arrival',
      actor_user_id: null,
      started_at: 1000,
      ended_at: 1000,
      status: 'completed',
      error_summary: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  triageId = triage.id

  await db
    .insertInto('triage_operator_runs')
    .values({
      triage_id: triageId,
      operator_id: operatorId,
      message_id: messageId,
      type_key: 'archive',
      type_code_version: '1',
      op_config_json: JSON.stringify({ delay_seconds: 4000 }),
      status: 'completed',
      started_at: 1000,
      finished_at: 1000,
      duration_ms: 0,
      skip_reason: null,
      error_summary: null,
      resource_usage_json: null,
      created_at: 1000,
    })
    .execute()

  const pending = await db
    .insertInto('pending_archives')
    .values({
      message_id: messageId,
      triage_id: triageId,
      operator_id: operatorId,
      due_at: DUE_AT,
      status: 'pending',
      settled_at: null,
      created_at: 1000,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  pendingArchiveId = pending.id
}

async function statusOf(): Promise<PendingArchiveStatus> {
  const row = await db
    .selectFrom('pending_archives')
    .select('status')
    .where('id', '=', pendingArchiveId)
    .executeTakeFirstOrThrow()
  return row.status
}

async function eventTypes(): Promise<string[]> {
  const rows = await db
    .selectFrom('triage_events')
    .select('event_type')
    .where('triage_id', '=', triageId)
    .orderBy('sequence_num', 'asc')
    .execute()
  return rows.map((r) => r.event_type)
}

async function setSourceState(state: SourceState): Promise<void> {
  await db.updateTable('messages').set({ source_state: state }).where('id', '=', messageId).execute()
}

/**
 * Fill the mailbox.archive per_window counter so the next call is denied. The
 * cap itself cannot be set to 0 (a CHECK forbids it), so the counter is filled
 * instead. The limit engine reads the wall clock, so the window opens there —
 * not at the `now` the sweep is driven with.
 */
async function exhaustArchiveLimit(): Promise<void> {
  const limit = await db
    .selectFrom('limits')
    .select(['id', 'max_count'])
    .where('resource', '=', 'mailbox')
    .where('operation', '=', 'archive')
    .where('scope', '=', 'per_window')
    .executeTakeFirstOrThrow()
  await db
    .insertInto('limit_counters_window')
    .values({
      limit_id: limit.id,
      window_start: Math.floor(Date.now() / 1000),
      count: limit.max_count,
    })
    .execute()
}

/** Clear the filled counter so a later beat is allowed again. */
async function restoreArchiveLimit(): Promise<void> {
  await db.deleteFrom('limit_counters_window').execute()
}

beforeEach(async () => {
  db = openDatabase(':memory:')
  await runMigrations(db)
  archiveCalls = []
  archiveBehaviour = () => Promise.resolve({ archived: true })
  await seedDueRow()
})

afterEach(async () => {
  await closeDatabase(db)
  vi.restoreAllMocks()
})

describe('the pending-archive sweep (d-41v9yqvh)', () => {
  it('leaves a row that is not yet due alone', async () => {
    const summaries = await scheduler().runDuePendingArchives(DUE_AT - 1)
    expect(summaries).toEqual([])
    expect(archiveCalls).toEqual([])
    expect(await statusOf()).toBe('pending')
  })

  it('when its pipeline is deleted: never performs, and what was recorded stays readable', async () => {
    await db.updateTable('pipelines').set({ deleted_at: 6000 }).where('id', '=', pipelineId).execute()

    const [summary] = await scheduler().runDuePendingArchives(NOW)
    expect(summary.outcome).toBe('abandoned')
    expect(archiveCalls).toEqual([])
    expect(await statusOf()).toBe('abandoned')
    expect(await eventTypes()).toEqual(['pending_archive_skipped'])
  })

  it('when its account is deleted: never performs', async () => {
    await db.updateTable('accounts').set({ deleted_at: 6000 }).where('id', '=', accountId).execute()

    const [summary] = await scheduler().runDuePendingArchives(NOW)
    expect(summary.outcome).toBe('abandoned')
    expect(archiveCalls).toEqual([])
    expect(await statusOf()).toBe('abandoned')
  })

  it('when its operator is deleted: never performs', async () => {
    await db.updateTable('operators').set({ deleted_at: 6000 }).where('id', '=', operatorId).execute()

    const [summary] = await scheduler().runDuePendingArchives(NOW)
    expect(summary.outcome).toBe('abandoned')
    expect(await statusOf()).toBe('abandoned')
  })

  it('when its pipeline is not active on the account: nothing performs and it still stands', async () => {
    await db.updateTable('accounts').set({ active_pipeline_id: null }).where('id', '=', accountId).execute()

    const [summary] = await scheduler().runDuePendingArchives(NOW)
    expect(summary.outcome).toBe('deferred')
    expect(archiveCalls).toEqual([])
    expect(await statusOf()).toBe('pending')
    expect(await eventTypes()).toEqual([])
  })

  it('fires late where the pipeline returns while it still stands', async () => {
    await db.updateTable('accounts').set({ active_pipeline_id: null }).where('id', '=', accountId).execute()
    await scheduler().runDuePendingArchives(NOW)
    await db.updateTable('accounts').set({ active_pipeline_id: pipelineId }).where('id', '=', accountId).execute()

    const [summary] = await scheduler().runDuePendingArchives(NOW + 60)
    expect(summary.outcome).toBe('archived')
    expect(archiveCalls).toHaveLength(1)
    expect(await statusOf()).toBe('archived')
  })

  it('when the message has already left the inbox: the mailbox is untouched', async () => {
    await setSourceState('archived')

    const [summary] = await scheduler().runDuePendingArchives(NOW)
    expect(summary.outcome).toBe('already_departed')
    expect(archiveCalls).toEqual([])
    expect(await statusOf()).toBe('already_departed')
    expect(await eventTypes()).toEqual(['pending_archive_skipped'])
  })

  it('judges departure from grinbox’s own record, taking no fresh read (d-hgqlouvn)', async () => {
    // The record says present though the mailbox has moved on; the call is made
    // and the backend answers it as the no-op it is.
    archiveBehaviour = () => Promise.resolve({ archived: false })

    const [summary] = await scheduler().runDuePendingArchives(NOW)
    expect(summary.outcome).toBe('archived')
    expect(archiveCalls).toHaveLength(1)
  })

  it('when a limit denies the call: it stays due and the next heartbeat tries again', async () => {
    await exhaustArchiveLimit()

    const [first] = await scheduler().runDuePendingArchives(NOW)
    expect(first.outcome).toBe('deferred')
    expect(archiveCalls).toEqual([])
    expect(await statusOf()).toBe('pending')
    expect(await eventTypes()).toEqual(['resource_op_limited'])

    // The next beat retries, and succeeds once the window has room again.
    await restoreArchiveLimit()
    const [second] = await scheduler().runDuePendingArchives(NOW + 60)
    expect(second.outcome).toBe('archived')
    expect(await statusOf()).toBe('archived')
  })

  it('records a limit denial once, not once per beat (d-6a4p1edu)', async () => {
    await exhaustArchiveLimit()

    await scheduler().runDuePendingArchives(NOW)
    await scheduler().runDuePendingArchives(NOW + 60)
    await scheduler().runDuePendingArchives(NOW + 120)

    expect(await eventTypes()).toEqual(['resource_op_limited'])
    expect(await statusOf()).toBe('pending')
  })

  it('when the call fails past its retries: it concludes failed on that run', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    archiveBehaviour = () => Promise.reject(new Error('gmail 500'))

    const [summary] = await scheduler().runDuePendingArchives(NOW)
    expect(summary.outcome).toBe('failed')
    expect(await statusOf()).toBe('failed')
    expect(await eventTypes()).toEqual(['resource_op_failed'])
    // The mailbox write policy is two further attempts (d-m5zk9xcw).
    expect(archiveCalls).toHaveLength(3)
  })

  it('otherwise: the message is archived, recorded on the run that recorded it', async () => {
    const [summary] = await scheduler().runDuePendingArchives(NOW)
    expect(summary).toMatchObject({
      pendingArchiveId,
      messageId,
      triageId,
      operatorId,
      outcome: 'archived',
    })
    expect(archiveCalls).toEqual([{ backendMessageId: 'gmail-abc' }])
    expect(await statusOf()).toBe('archived')
    expect(await eventTypes()).toEqual(['resource_op_succeeded'])

    const run = await db
      .selectFrom('triage_events')
      .select(['operator_id'])
      .where('triage_id', '=', triageId)
      .executeTakeFirstOrThrow()
    expect(run.operator_id).toBe(operatorId)
  })

  it('does not re-work a row it already settled', async () => {
    await scheduler().runDuePendingArchives(NOW)
    const again = await scheduler().runDuePendingArchives(NOW + 60)
    expect(again).toEqual([])
    expect(archiveCalls).toHaveLength(1)
  })

  it('deletion outranks departure where both hold', async () => {
    await db.updateTable('pipelines').set({ deleted_at: 6000 }).where('id', '=', pipelineId).execute()
    await setSourceState('archived')

    const [summary] = await scheduler().runDuePendingArchives(NOW)
    expect(summary.outcome).toBe('abandoned')
  })
})
