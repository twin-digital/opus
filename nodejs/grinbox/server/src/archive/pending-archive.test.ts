/**
 * The pending Archive's stored shape and the settlement reconcile
 * (d-grcdd4ov, d-0tajzoy7). The sweep that performs a due row has its own
 * tests beside the scheduler.
 */

import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../db/schema.js'
import { settleTriageIfTerminal } from '../pipeline/persist.js'
import { freshDb, seedBase } from '../pipeline/test-helpers.js'
import {
  loadStandingPendingArchives,
  pendingArchiveDueAt,
  pendingArchiveRecordedEvent,
  reconcilePendingArchiveOnSettle,
} from './pending-archive.js'

let db: Kysely<Database>
let messageId: number
let pipelineId: number
let nextOperator = 0

beforeEach(async () => {
  db = await freshDb()
  const seeded = await seedBase(db)
  messageId = seeded.messageId
  pipelineId = seeded.pipelineId
  nextOperator = 0
})

afterEach(async () => {
  await db.destroy()
})

/** Seed an Archive Operator on the base Pipeline; return its id. */
async function seedArchiveOperator(): Promise<number> {
  nextOperator += 1
  const op = await db
    .insertInto('operators')
    .values({
      pipeline_id: pipelineId,
      name: `archive-${nextOperator}`,
      type_key: 'archive',
      type_code_version: '1',
      config_json: '{}',
      enabled: 1,
      created_at: 1000,
      updated_at: 1000,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return op.id
}

/**
 * Run one Triage of the base Message to completion, with each entry of
 * `recordings` an Archive run that recorded a pending Archive due at that
 * moment. Returns the Triage id.
 */
async function settleTriage(startedAt: number, recordings: readonly number[]): Promise<number> {
  const triage = await db
    .insertInto('triages')
    .values({
      message_id: messageId,
      pipeline_id: pipelineId,
      triggered_by: 'message_arrival',
      actor_user_id: null,
      started_at: startedAt,
      ended_at: null,
      status: 'running',
      error_summary: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  let sequence = 0
  for (const dueAt of recordings) {
    const operatorId = await seedArchiveOperator()
    await db
      .insertInto('triage_operator_runs')
      .values({
        triage_id: triage.id,
        operator_id: operatorId,
        message_id: messageId,
        type_key: 'archive',
        type_code_version: '1',
        op_config_json: '{}',
        status: 'completed',
        started_at: startedAt,
        finished_at: startedAt,
        duration_ms: 0,
        skip_reason: null,
        error_summary: null,
        resource_usage_json: null,
        created_at: startedAt,
      })
      .execute()
    sequence += 1
    const event = pendingArchiveRecordedEvent({ due_at: dueAt, delay_seconds: dueAt - 1000 })
    await db
      .insertInto('triage_events')
      .values({
        triage_id: triage.id,
        operator_id: operatorId,
        sequence_num: sequence,
        event_type: event.eventType,
        details_json: event.detailsJson,
        recorded_at: startedAt,
      })
      .execute()
  }

  if (recordings.length === 0) {
    // A Triage with no run at all never settles; give it one completed run that
    // recorded nothing.
    const operatorId = await seedArchiveOperator()
    await db
      .insertInto('triage_operator_runs')
      .values({
        triage_id: triage.id,
        operator_id: operatorId,
        message_id: messageId,
        type_key: 'archive',
        type_code_version: '1',
        op_config_json: '{}',
        status: 'completed',
        started_at: startedAt,
        finished_at: startedAt,
        duration_ms: 0,
        skip_reason: null,
        error_summary: null,
        resource_usage_json: null,
        created_at: startedAt,
      })
      .execute()
  }

  await db.transaction().execute(async (tx) => {
    await settleTriageIfTerminal(tx, triage.id, startedAt)
  })
  return triage.id
}

async function standing(): Promise<{ due_at: number; triage_id: number } | undefined> {
  return (await loadStandingPendingArchives(db, [messageId])).get(messageId)
}

describe('pendingArchiveDueAt', () => {
  it('measures the delay from the message take-in, not the triage', () => {
    expect(pendingArchiveDueAt(1_700_000_000, 86_400)).toBe(1_700_086_400)
  })
})

describe('the settlement reconcile', () => {
  it('makes a settled triage the message’s pending archive', async () => {
    const triageId = await settleTriage(2000, [5000])
    expect(await standing()).toMatchObject({ due_at: 5000, triage_id: triageId })
  })

  it('takes the earliest due where one triage recorded several', async () => {
    await settleTriage(2000, [9000, 4000, 7000])
    expect((await standing())?.due_at).toBe(4000)
  })

  it('replaces the standing one when a later triage records another', async () => {
    await settleTriage(2000, [5000])
    const second = await settleTriage(3000, [8000])
    expect(await standing()).toMatchObject({ due_at: 8000, triage_id: second })

    const superseded = await db
      .selectFrom('pending_archives')
      .select(['status'])
      .where('due_at', '=', 5000)
      .executeTakeFirstOrThrow()
    expect(superseded.status).toBe('superseded')
  })

  it('cancels the standing one when a later triage records none', async () => {
    await settleTriage(2000, [5000])
    await settleTriage(3000, [])
    expect(await standing()).toBeUndefined()

    const cancelled = await db
      .selectFrom('pending_archives')
      .select(['status', 'settled_at'])
      .where('due_at', '=', 5000)
      .executeTakeFirstOrThrow()
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.settled_at).toBe(3000)
  })

  it('leaves the standing one alone when an older triage settles late', async () => {
    await settleTriage(3000, [8000])
    await settleTriage(2000, [5000])
    expect((await standing())?.due_at).toBe(8000)
  })

  it('is idempotent for one triage', async () => {
    const triageId = await settleTriage(2000, [5000])
    await db.transaction().execute(async (tx) => {
      await reconcilePendingArchiveOnSettle(tx, triageId, 2500)
    })
    const rows = await db.selectFrom('pending_archives').select(['id']).execute()
    expect(rows).toHaveLength(1)
  })
})
