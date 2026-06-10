import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type DB, closeDatabase } from '../../db/index.js'
import { createApiRoutes } from './index.js'
import type { MessageListResponse } from './messages.js'
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

async function seedInbox(db: DB) {
  const userId = await insertUser(db)
  const pid = await insertPipeline(db, userId, 'pipe')
  const opId = await insertOperator(db, pid, {
    name: 'urgency',
    typeKey: 'rule_based_tagger',
    configJson: ruleTaggerConfig('urgency', ['high', 'low']),
  })
  const acctId = await insertAccount(db, userId, { activePipelineId: pid })

  // m1: older, current triage with urgency=high
  const m1 = await insertMessage(db, acctId, {
    backendMessageId: 'm1',
    from: 'alice@example.com',
    subject: 'Quarterly report',
    snippet: 'the numbers are in',
    receivedAt: 1000,
  })
  await insertTriage(db, {
    messageId: m1,
    pipelineId: pid,
    operatorId: opId,
    startedAt: 1100,
    status: 'completed',
    makeCurrent: true,
    tags: [{ key: 'urgency', value: 'high' }],
  })

  // m2: newer, current triage with urgency=low, partial status
  const m2 = await insertMessage(db, acctId, {
    backendMessageId: 'm2',
    from: 'bob@example.com',
    subject: 'Lunch plans',
    snippet: 'tacos?',
    receivedAt: 2000,
  })
  await insertTriage(db, {
    messageId: m2,
    pipelineId: pid,
    operatorId: opId,
    startedAt: 2100,
    status: 'partial',
    makeCurrent: true,
    tags: [{ key: 'urgency', value: 'low' }],
  })

  // m3: no triage at all (never processed)
  const m3 = await insertMessage(db, acctId, {
    backendMessageId: 'm3',
    from: 'carol@example.com',
    subject: 'Untriaged',
    snippet: 'nothing yet',
    receivedAt: 3000,
  })

  return { userId, pid, opId, acctId, m1, m2, m3 }
}

describe('GET /api/messages', () => {
  let db: DB
  beforeEach(async () => {
    db = await freshDb()
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('returns empty list + page metadata when no messages', async () => {
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/messages')
    const body = (await res.json()) as MessageListResponse
    expect(body.messages).toEqual([])
    expect(body.page).toEqual({ limit: 50, offset: 0, total: 0 })
  })

  it('orders received_at DESC and joins current tags + latest status', async () => {
    const { m1, m2, m3 } = await seedInbox(db)
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/messages')
    const body = (await res.json()) as MessageListResponse
    expect(body.messages.map((m) => m.id)).toEqual([m3, m2, m1])
    expect(body.page.total).toBe(3)

    const r1 = body.messages.find((m) => m.id === m1)
    expect(r1?.current_tags).toEqual([expect.objectContaining({ key: 'urgency', value: 'high' })])
    expect(r1?.latest_triage_status).toBe('completed')

    const r2 = body.messages.find((m) => m.id === m2)
    expect(r2?.latest_triage_status).toBe('partial')

    const r3 = body.messages.find((m) => m.id === m3)
    expect(r3?.current_tags).toEqual([])
    expect(r3?.latest_triage_status).toBeNull()
  })

  it('paginates over the full match set', async () => {
    await seedInbox(db)
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/messages?limit=2&offset=0')
    const body = (await res.json()) as MessageListResponse
    expect(body.messages).toHaveLength(2)
    expect(body.page.total).toBe(3)

    const res2 = await app.request('/api/messages?limit=2&offset=2')
    const body2 = (await res2.json()) as MessageListResponse
    expect(body2.messages).toHaveLength(1)
  })

  it('filters by status (latest current triage)', async () => {
    const { m2 } = await seedInbox(db)
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/messages?status=partial')
    const body = (await res.json()) as MessageListResponse
    expect(body.messages.map((m) => m.id)).toEqual([m2])
  })

  it('filters by tagKey + tagValue presence', async () => {
    const { m1 } = await seedInbox(db)
    const app = createApiRoutes({ db, now: fixedNow })
    const all = await app.request('/api/messages?tagKey=urgency')
    expect(((await all.json()) as MessageListResponse).messages).toHaveLength(2)

    const high = await app.request('/api/messages?tagKey=urgency&tagValue=high')
    const body = (await high.json()) as MessageListResponse
    expect(body.messages.map((m) => m.id)).toEqual([m1])
  })

  it('defaults to source_state=present and reveals others with sourceState=all', async () => {
    const { acctId } = await seedInbox(db)
    // m1/m2/m3 are present (default); add one archived + one trashed.
    await insertMessage(db, acctId, {
      backendMessageId: 'arch',
      subject: 'Archived',
      receivedAt: 4000,
      sourceState: 'archived',
    })
    await insertMessage(db, acctId, {
      backendMessageId: 'trash',
      subject: 'Trashed',
      receivedAt: 5000,
      sourceState: 'trashed',
    })
    const app = createApiRoutes({ db, now: fixedNow })

    // Default: only the three present messages.
    const def = (await (await app.request('/api/messages')).json()) as MessageListResponse
    expect(def.messages.every((m) => m.source_state === 'present')).toBe(true)
    expect(def.page.total).toBe(3)

    // all: every disposition.
    const all = (await (await app.request('/api/messages?sourceState=all')).json()) as MessageListResponse
    expect(all.page.total).toBe(5)

    // A specific state.
    const arch = (await (await app.request('/api/messages?sourceState=archived')).json()) as MessageListResponse
    expect(arch.messages.map((m) => m.subject)).toEqual(['Archived'])
  })

  it('searches over from/subject/snippet', async () => {
    const { m1, m2 } = await seedInbox(db)
    const app = createApiRoutes({ db, now: fixedNow })

    const bySubject = await app.request('/api/messages?q=Lunch')
    expect(((await bySubject.json()) as MessageListResponse).messages.map((m) => m.id)).toEqual([m2])

    const byFrom = await app.request('/api/messages?q=alice')
    expect(((await byFrom.json()) as MessageListResponse).messages.map((m) => m.id)).toEqual([m1])

    const bySnippet = await app.request('/api/messages?q=tacos')
    expect(((await bySnippet.json()) as MessageListResponse).messages.map((m) => m.id)).toEqual([m2])
  })

  it('escapes LIKE wildcards in q', async () => {
    const userId = await insertUser(db)
    const acctId = await insertAccount(db, userId, {})
    await insertMessage(db, acctId, {
      backendMessageId: 'p',
      subject: '50% off',
      receivedAt: 10,
    })
    await insertMessage(db, acctId, {
      backendMessageId: 'q',
      subject: 'no discount',
      receivedAt: 20,
    })
    const app = createApiRoutes({ db, now: fixedNow })
    // '%' must be matched literally, not as a wildcard.
    const res = await app.request(`/api/messages?q=${encodeURIComponent('50%')}`)
    const body = (await res.json()) as MessageListResponse
    expect(body.messages).toHaveLength(1)
    expect(body.messages[0]?.subject).toBe('50% off')
  })

  it('sorts a NULL received_at row last under received_at DESC', async () => {
    const userId = await insertUser(db)
    const acctId = await insertAccount(db, userId, {})
    const newer = await insertMessage(db, acctId, {
      backendMessageId: 'newer',
      receivedAt: 2000,
    })
    const older = await insertMessage(db, acctId, {
      backendMessageId: 'older',
      receivedAt: 1000,
    })
    const nullRow = await insertMessage(db, acctId, {
      backendMessageId: 'null',
      receivedAt: null,
    })
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/messages')
    const body = (await res.json()) as MessageListResponse
    // Dated rows DESC first, the NULL-received_at row last.
    expect(body.messages.map((m) => m.id)).toEqual([newer, older, nullRow])
  })

  it('filters by date range', async () => {
    const { m2 } = await seedInbox(db)
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/messages?dateFrom=1500&dateTo=2500')
    const body = (await res.json()) as MessageListResponse
    expect(body.messages.map((m) => m.id)).toEqual([m2])
  })

  it('filters by accountId', async () => {
    const { acctId, userId } = await seedInbox(db)
    const otherAcct = await insertAccount(db, userId, { name: 'other' })
    await insertMessage(db, otherAcct, {
      backendMessageId: 'x',
      subject: 'elsewhere',
      receivedAt: 9000,
    })
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request(`/api/messages?accountId=${acctId}`)
    const body = (await res.json()) as MessageListResponse
    expect(body.messages).toHaveLength(3)
  })

  it('pipelineId filter scopes current tags + excludes non-current messages', async () => {
    const { pid, m1 } = await seedInbox(db)
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request(`/api/messages?pipelineId=${pid}`)
    const body = (await res.json()) as MessageListResponse
    // m3 (no current triage) excluded under a pipeline filter.
    expect(body.messages.find((m) => m.id === m1)?.current_tags).toHaveLength(1)
    expect(body.messages).toHaveLength(2)
  })

  it('merges current tags across two pipelines, scopes by pipelineId, and tiebreaks status by later-started triage', async () => {
    // One Message current under two Pipelines, each tagging a different key.
    const userId = await insertUser(db)
    const pA = await insertPipeline(db, userId, 'pipeA')
    const pB = await insertPipeline(db, userId, 'pipeB')
    const opA = await insertOperator(db, pA, {
      name: 'urgency',
      typeKey: 'rule_based_tagger',
      configJson: ruleTaggerConfig('urgency', ['high', 'low']),
    })
    const opB = await insertOperator(db, pB, {
      name: 'category',
      typeKey: 'rule_based_tagger',
      configJson: ruleTaggerConfig('category', ['work', 'personal']),
    })
    const acctId = await insertAccount(db, userId, { activePipelineId: pA })
    const mid = await insertMessage(db, acctId, {
      backendMessageId: 'm',
      subject: 'shared',
      receivedAt: 1000,
    })

    // Pipeline A's current triage: started EARLIER, status completed.
    await insertTriage(db, {
      messageId: mid,
      pipelineId: pA,
      operatorId: opA,
      startedAt: 1100,
      status: 'completed',
      makeCurrent: true,
      tags: [{ key: 'urgency', value: 'high' }],
    })
    // Pipeline B's current triage: started LATER, status partial — the
    // later-started triage across pipelines wins the latest-status tiebreak.
    await insertTriage(db, {
      messageId: mid,
      pipelineId: pB,
      operatorId: opB,
      startedAt: 1200,
      status: 'partial',
      makeCurrent: true,
      tags: [{ key: 'category', value: 'work' }],
    })

    const app = createApiRoutes({ db, now: fixedNow })

    // No pipelineId filter: tags from BOTH current triages merge; status is the
    // later-started (pipeline B, partial) triage.
    const allRes = await app.request('/api/messages')
    const all = (await allRes.json()) as MessageListResponse
    const merged = all.messages.find((m) => m.id === mid)
    expect(merged?.current_tags.map((t) => t.key).sort()).toEqual(['category', 'urgency'])
    expect(merged?.latest_triage_status).toBe('partial')

    // pipelineId=A scopes tags + status to pipeline A only.
    const aRes = await app.request(`/api/messages?pipelineId=${pA}`)
    const a = (await aRes.json()) as MessageListResponse
    const aRow = a.messages.find((m) => m.id === mid)
    expect(aRow?.current_tags.map((t) => t.key)).toEqual(['urgency'])
    expect(aRow?.latest_triage_status).toBe('completed')

    // pipelineId=B scopes to pipeline B only.
    const bRes = await app.request(`/api/messages?pipelineId=${pB}`)
    const b = (await bRes.json()) as MessageListResponse
    const bRow = b.messages.find((m) => m.id === mid)
    expect(bRow?.current_tags.map((t) => t.key)).toEqual(['category'])
    expect(bRow?.latest_triage_status).toBe('partial')
  })
})

describe('GET /api/messages/:id', () => {
  let db: DB
  beforeEach(async () => {
    db = await freshDb()
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('returns message header/body, current tags, and triage history most-recent-first', async () => {
    const userId = await insertUser(db)
    const pid = await insertPipeline(db, userId)
    const opId = await insertOperator(db, pid, {
      name: 'urgency',
      typeKey: 'rule_based_tagger',
      configJson: ruleTaggerConfig('urgency', ['high', 'low']),
    })
    const acctId = await insertAccount(db, userId, { activePipelineId: pid })
    const mid = await insertMessage(db, acctId, {
      backendMessageId: 'm',
      from: 'a@x.com',
      subject: 'Hi',
      bodyText: 'body here',
      receivedAt: 1000,
    })

    // first triage (older)
    await insertTriage(db, {
      messageId: mid,
      pipelineId: pid,
      operatorId: opId,
      startedAt: 1100,
      status: 'completed',
      tags: [{ key: 'urgency', value: 'low' }],
      events: [
        {
          eventType: 'tag_set',
          detailsJson: JSON.stringify({ key: 'urgency', value: 'low' }),
          recordedAt: 1101,
        },
      ],
    })
    // second triage (newer, current)
    await insertTriage(db, {
      messageId: mid,
      pipelineId: pid,
      operatorId: opId,
      startedAt: 1200,
      triggeredBy: 'user_replay',
      status: 'completed',
      makeCurrent: true,
      tags: [{ key: 'urgency', value: 'high' }],
      events: [
        {
          eventType: 'resource_op_limited',
          detailsJson: JSON.stringify({
            resource: 'pushover_api',
            operation: 'send_notification',
            scope: 'per_message',
          }),
          recordedAt: 1201,
        },
      ],
    })

    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request(`/api/messages/${mid}`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      message: { id: number; body_text: string | null }
      current_tags: { key: string; value: string }[]
      triages: {
        triggered_by: string
        started_at: number
        operator_runs: unknown[]
        events: unknown[]
        tags: unknown[]
      }[]
    }
    expect(body.message.id).toBe(mid)
    expect(body.message.body_text).toBe('body here')
    // current tags come from the latest (current) triage
    expect(body.current_tags).toEqual([expect.objectContaining({ key: 'urgency', value: 'high' })])
    // most-recent-first
    expect(body.triages.map((t) => t.started_at)).toEqual([1200, 1100])
    expect(body.triages[0]?.triggered_by).toBe('user_replay')
    expect(body.triages[0]?.operator_runs).toHaveLength(1)
    expect(body.triages[0]?.events).toHaveLength(1)
    expect(body.triages[0]?.tags).toHaveLength(1)
  })

  it('404s for missing message', async () => {
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/messages/4242')
    expect(res.status).toBe(404)
  })
})
