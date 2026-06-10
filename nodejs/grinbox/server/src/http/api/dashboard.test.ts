import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type DB, closeDatabase } from '../../db/index.js'
import type { DashboardResponse } from './dashboard.js'
import { createApiRoutes } from './index.js'
import {
  FIXED_NOW,
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

const DAY = 86_400

describe('GET /api/dashboard', () => {
  let db: DB
  beforeEach(async () => {
    db = await freshDb()
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('reports an all-empty first-run state', async () => {
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/dashboard')
    const body = (await res.json()) as DashboardResponse
    expect(body.first_run).toEqual({
      has_account: false,
      has_pipeline: false,
      has_assigned_pipeline: false,
    })
    expect(body.triages_last_24h).toBe(0)
    expect(body.notifications_sent_today).toBe(0)
    expect(body.top_tags).toEqual([])
    expect(body.recent_operator_edits).toEqual([])
  })

  it('computes 24h/today windows, top tags, error/limit counts, and recent edits', async () => {
    const userId = await insertUser(db)
    const pid = await insertPipeline(db, userId)
    const opId = await insertOperator(db, pid, {
      name: 'urgency',
      typeKey: 'rule_based_tagger',
      configJson: ruleTaggerConfig('urgency', ['high', 'low']),
    })
    const acctId = await insertAccount(db, userId, { activePipelineId: pid })
    const m1 = await insertMessage(db, acctId, {
      backendMessageId: 'm1',
      receivedAt: FIXED_NOW - 10,
    })
    const m2 = await insertMessage(db, acctId, {
      backendMessageId: 'm2',
      receivedAt: FIXED_NOW - 20,
    })

    const startOfToday = FIXED_NOW - (FIXED_NOW % DAY)

    // In-window triage (now-100): current, tag urgency=high, with a limited
    // event + a notification-succeeded event recorded *today*.
    await insertTriage(db, {
      messageId: m1,
      pipelineId: pid,
      operatorId: opId,
      startedAt: FIXED_NOW - 100,
      makeCurrent: true,
      tags: [{ key: 'urgency', value: 'high' }],
      events: [
        {
          eventType: 'resource_op_limited',
          detailsJson: JSON.stringify({ resource: 'pushover_api' }),
          recordedAt: FIXED_NOW - 90,
        },
        {
          eventType: 'resource_op_failed',
          detailsJson: JSON.stringify({ resource: 'gmail_api' }),
          recordedAt: FIXED_NOW - 80,
        },
        {
          eventType: 'resource_op_succeeded',
          detailsJson: JSON.stringify({ operation: 'send_notification' }),
          recordedAt: Math.max(startOfToday + 5, FIXED_NOW - 70),
        },
      ],
    })

    // Another current triage with urgency=high → top_tags count should be 2.
    await insertTriage(db, {
      messageId: m2,
      pipelineId: pid,
      operatorId: opId,
      startedAt: FIXED_NOW - 200,
      makeCurrent: true,
      tags: [{ key: 'urgency', value: 'high' }],
    })

    // An OLD triage (> 24h ago) — must NOT count toward triages_last_24h.
    await insertTriage(db, {
      messageId: m1,
      pipelineId: pid,
      operatorId: opId,
      startedAt: FIXED_NOW - DAY - 500,
    })

    // change_log: a recent operator edit.
    await db
      .insertInto('change_log')
      .values({
        user_id: userId,
        actor_user_id: userId,
        entity_type: 'operator',
        entity_id: opId,
        action: 'updated',
        before_json: null,
        after_json: '{}',
        recorded_at: FIXED_NOW - 50,
      })
      .execute()

    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/dashboard')
    const body = (await res.json()) as DashboardResponse

    expect(body.first_run).toEqual({
      has_account: true,
      has_pipeline: true,
      has_assigned_pipeline: true,
    })
    // two in-window triages (the old one excluded)
    expect(body.triages_last_24h).toBe(2)
    expect(body.notifications_sent_today).toBe(1)
    expect(body.top_tags).toEqual([{ key: 'urgency', value: 'high', count: 2 }])
    expect(body.errors_last_24h).toBe(1)
    expect(body.limit_hits_last_24h).toBe(1)
    expect(body.recent_operator_edits).toHaveLength(1)
    expect(body.recent_operator_edits[0]?.operator_id).toBe(opId)
    expect(body.recent_operator_edits[0]?.action).toBe('updated')
  })

  it('counts a notification between since24h and start-of-today toward 24h windows but not notifications_sent_today', async () => {
    const userId = await insertUser(db)
    const pid = await insertPipeline(db, userId)
    const opId = await insertOperator(db, pid, {
      name: 'urgency',
      typeKey: 'rule_based_tagger',
      configJson: ruleTaggerConfig('urgency', ['high', 'low']),
    })
    const acctId = await insertAccount(db, userId, { activePipelineId: pid })
    const mid = await insertMessage(db, acctId, {
      backendMessageId: 'm1',
      receivedAt: FIXED_NOW - 10,
    })

    const since24h = FIXED_NOW - DAY
    const startOfToday = FIXED_NOW - (FIXED_NOW % DAY)
    // The boundary case only exists when start-of-today is strictly after the
    // trailing-24h start (i.e. now isn't exactly at midnight UTC).
    expect(startOfToday).toBeGreaterThan(since24h)
    // A timestamp inside the gap: after the 24h floor, before today's UTC start.
    const between = since24h + 100
    expect(between).toBeLessThan(startOfToday)

    // A send_notification succeeded event recorded in that gap, and a triage
    // started in the same gap.
    await insertTriage(db, {
      messageId: mid,
      pipelineId: pid,
      operatorId: opId,
      startedAt: between,
      makeCurrent: true,
      events: [
        {
          eventType: 'resource_op_succeeded',
          detailsJson: JSON.stringify({ operation: 'send_notification' }),
          recordedAt: between,
        },
      ],
    })

    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/dashboard')
    const body = (await res.json()) as DashboardResponse

    // The triage is within the trailing 24h window.
    expect(body.triages_last_24h).toBe(1)
    // But the notification predates UTC start-of-today, so it must NOT count.
    expect(body.notifications_sent_today).toBe(0)
  })

  it('reports failed_triages_last_24h for a real status=failed triage', async () => {
    const userId = await insertUser(db)
    const pid = await insertPipeline(db, userId)
    const opId = await insertOperator(db, pid, {
      name: 'urgency',
      typeKey: 'rule_based_tagger',
      configJson: ruleTaggerConfig('urgency', ['high', 'low']),
    })
    const acctId = await insertAccount(db, userId, { activePipelineId: pid })
    const mid = await insertMessage(db, acctId, {
      backendMessageId: 'm1',
      receivedAt: FIXED_NOW - 10,
    })
    await insertTriage(db, {
      messageId: mid,
      pipelineId: pid,
      operatorId: opId,
      startedAt: FIXED_NOW - 100,
      status: 'failed',
    })

    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/dashboard')
    const body = (await res.json()) as DashboardResponse
    expect(body.failed_triages_last_24h).toBe(1)
  })

  it('counts top_tags across two pipelines a message is current under', async () => {
    const userId = await insertUser(db)
    const pA = await insertPipeline(db, userId, 'pipeA')
    const pB = await insertPipeline(db, userId, 'pipeB')
    const opA = await insertOperator(db, pA, {
      name: 'urgency',
      typeKey: 'rule_based_tagger',
      configJson: ruleTaggerConfig('urgency', ['high', 'low']),
    })
    const opB = await insertOperator(db, pB, {
      name: 'urgency2',
      typeKey: 'rule_based_tagger',
      configJson: ruleTaggerConfig('urgency', ['high', 'low']),
    })
    const acctId = await insertAccount(db, userId, { activePipelineId: pA })
    const mid = await insertMessage(db, acctId, {
      backendMessageId: 'm1',
      receivedAt: FIXED_NOW - 10,
    })
    // The same Message is current under both pipelines, each tagging urgency=high.
    await insertTriage(db, {
      messageId: mid,
      pipelineId: pA,
      operatorId: opA,
      startedAt: FIXED_NOW - 100,
      makeCurrent: true,
      tags: [{ key: 'urgency', value: 'high' }],
    })
    await insertTriage(db, {
      messageId: mid,
      pipelineId: pB,
      operatorId: opB,
      startedAt: FIXED_NOW - 90,
      makeCurrent: true,
      tags: [{ key: 'urgency', value: 'high' }],
    })

    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/dashboard')
    const body = (await res.json()) as DashboardResponse
    // Both current triages' tags are counted → urgency=high appears twice.
    expect(body.top_tags).toEqual([{ key: 'urgency', value: 'high', count: 2 }])
  })
})
