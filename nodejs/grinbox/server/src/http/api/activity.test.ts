import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type DB, closeDatabase } from '../../db/index.js'
import type { ActivityResponse } from './activity.js'
import { createApiRoutes } from './index.js'
import {
  fixedNow,
  freshDb,
  insertAccount,
  insertMessage,
  insertOperator,
  insertPipeline,
  insertTriage,
  insertUser,
  ruleTaggerConfig,
} from './test-support.js'

async function seedActivity(db: DB) {
  const userId = await insertUser(db)
  const pid = await insertPipeline(db, userId)
  const opId = await insertOperator(db, pid, {
    name: 'urgency',
    typeKey: 'rule_based_tagger',
    configJson: ruleTaggerConfig('urgency'),
  })
  const acctId = await insertAccount(db, userId, { activePipelineId: pid })
  const mid = await insertMessage(db, acctId, {
    backendMessageId: 'm',
    receivedAt: 1000,
  })

  // Triage with a limited event (warning) + a failed event (error).
  await insertTriage(db, {
    messageId: mid,
    pipelineId: pid,
    operatorId: opId,
    startedAt: 1000,
    events: [
      {
        eventType: 'resource_op_limited',
        detailsJson: JSON.stringify({
          resource: 'pushover_api',
          operation: 'send_notification',
          scope: 'per_window',
        }),
        recordedAt: 1010,
      },
      {
        eventType: 'resource_op_failed',
        detailsJson: JSON.stringify({
          resource: 'gmail_api',
          operation: 'apply_label',
          error: 'boom',
        }),
        recordedAt: 1020,
      },
      // succeeded events must NOT appear in the feed.
      {
        eventType: 'resource_op_succeeded',
        detailsJson: JSON.stringify({
          resource: 'pushover_api',
          operation: 'send_notification',
        }),
        recordedAt: 1030,
      },
    ],
  })

  // A failed operator run (error).
  await insertTriage(db, {
    messageId: mid,
    pipelineId: pid,
    operatorId: opId,
    startedAt: 2000,
    status: 'partial',
    runStatus: 'failed',
    runError: 'operator threw',
  })

  return { mid, opId }
}

describe('GET /api/activity', () => {
  let db: DB
  beforeEach(async () => {
    db = await freshDb()
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('returns empty feed with no events', async () => {
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/activity')
    const body = (await res.json()) as ActivityResponse
    expect(body.events).toEqual([])
  })

  it('feeds resource-op limited/failed + failed runs, most-recent-first', async () => {
    await seedActivity(db)
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/activity')
    const body = (await res.json()) as ActivityResponse
    // limited(1010) + failed-event(1020) + failed-run(2001) = 3, succeeded excluded
    expect(body.events).toHaveLength(3)
    expect(body.events.map((e) => e.recorded_at)).toEqual([2001, 1020, 1010])
    expect(body.events[0]?.event_type).toBe('operator_run_failed')
    expect(body.events[0]?.detail).toBe('operator threw')
    const limited = body.events.find((e) => e.event_type === 'resource_op_limited')
    expect(limited?.severity).toBe('warning')
    expect(limited?.resource).toBe('pushover_api')
  })

  it('filters by severity', async () => {
    await seedActivity(db)
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/activity?severity=warning')
    const body = (await res.json()) as ActivityResponse
    expect(body.events).toHaveLength(1)
    expect(body.events[0]?.event_type).toBe('resource_op_limited')
  })

  it('filters by resource', async () => {
    await seedActivity(db)
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/activity?resource=gmail_api')
    const body = (await res.json()) as ActivityResponse
    expect(body.events).toHaveLength(1)
    expect(body.events[0]?.resource).toBe('gmail_api')
  })

  it('paginates the cross-source feed most-recent-first with page metadata', async () => {
    const userId = await insertUser(db)
    const pid = await insertPipeline(db, userId)
    const opId = await insertOperator(db, pid, {
      name: 'urgency',
      typeKey: 'rule_based_tagger',
      configJson: ruleTaggerConfig('urgency'),
    })
    const acctId = await insertAccount(db, userId, { activePipelineId: pid })
    const mid = await insertMessage(db, acctId, {
      backendMessageId: 'm',
      receivedAt: 1000,
    })

    // Five limited events at increasing recorded_at; plus a failed run that
    // sorts to the very top (recorded at 6001 via started_at+1). Six entries
    // total, drawn from both sources.
    await insertTriage(db, {
      messageId: mid,
      pipelineId: pid,
      operatorId: opId,
      startedAt: 1000,
      events: [10, 20, 30, 40, 50].map((t) => ({
        eventType: 'resource_op_limited' as const,
        detailsJson: JSON.stringify({ resource: 'pushover_api', scope: 'x' }),
        recordedAt: t,
      })),
    })
    await insertTriage(db, {
      messageId: mid,
      pipelineId: pid,
      operatorId: opId,
      startedAt: 6000,
      status: 'partial',
      runStatus: 'failed',
      runError: 'top',
    })

    const app = createApiRoutes({ db, now: fixedNow })

    // Page 1: first 4 of 6, most-recent-first (failed run 6001, then 50,40,30).
    const p1 = (await (await app.request('/api/activity?limit=4&offset=0')).json()) as ActivityResponse
    expect(p1.events).toHaveLength(4)
    expect(p1.events.map((e) => e.recorded_at)).toEqual([6001, 50, 40, 30])
    expect(p1.page).toEqual({ limit: 4, offset: 0 })

    // Page 2: the remaining 2 (20, 10).
    const p2 = (await (await app.request('/api/activity?limit=4&offset=4')).json()) as ActivityResponse
    expect(p2.events.map((e) => e.recorded_at)).toEqual([20, 10])
    expect(p2.page).toEqual({ limit: 4, offset: 4 })
  })
})
