import { describe, expect, it } from 'vitest'
import { type DB, closeDatabase } from '../../db/index.js'
import { createApiRoutes } from './index.js'
import type { PreviewResponse } from './operators.js'
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

/**
 * Seeds a Pipeline with three Messages, each current under it:
 *  - m1 (oldest): tags { urgency: 'low', source: 'newsletter' }
 *  - m2 (middle): tags { urgency: 'high', source: 'work' }
 *  - m3 (newest): tags { source: 'work' }   (no `urgency` key yet)
 */
async function seed(db: DB) {
  const userId = await insertUser(db)
  const pid = await insertPipeline(db, userId, 'pipe')
  const opId = await insertOperator(db, pid, {
    name: 'urgency',
    typeKey: 'rule_based_tagger',
    configJson: ruleTaggerConfig('urgency', ['high', 'low']),
  })
  const acctId = await insertAccount(db, userId, { activePipelineId: pid })

  const m1 = await insertMessage(db, acctId, {
    backendMessageId: 'm1',
    from: 'alice@example.com',
    subject: 'Quarterly report',
    snippet: 'numbers in',
    receivedAt: 1000,
  })
  await insertTriage(db, {
    messageId: m1,
    pipelineId: pid,
    operatorId: opId,
    startedAt: 1100,
    makeCurrent: true,
    tags: [
      { key: 'urgency', value: 'low' },
      { key: 'source', value: 'newsletter' },
    ],
  })

  const m2 = await insertMessage(db, acctId, {
    backendMessageId: 'm2',
    from: 'boss@work.com',
    subject: 'URGENT: deadline',
    snippet: 'today',
    receivedAt: 2000,
  })
  await insertTriage(db, {
    messageId: m2,
    pipelineId: pid,
    operatorId: opId,
    startedAt: 2100,
    makeCurrent: true,
    tags: [
      { key: 'urgency', value: 'high' },
      { key: 'source', value: 'work' },
    ],
  })

  const m3 = await insertMessage(db, acctId, {
    backendMessageId: 'm3',
    from: 'colleague@work.com',
    subject: 'lunch',
    snippet: 'tacos',
    receivedAt: 3000,
  })
  await insertTriage(db, {
    messageId: m3,
    pipelineId: pid,
    operatorId: opId,
    startedAt: 3100,
    makeCurrent: true,
    tags: [{ key: 'source', value: 'work' }],
  })

  return { userId, pid, opId, acctId, m1, m2, m3 }
}

function app(db: DB) {
  return createApiRoutes({ db, now: fixedNow })
}

async function post(db: DB, body: unknown) {
  return app(db).request('/api/operators/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/operators/preview', () => {
  it('flags changed rows, marks new-key current_value null, and counts', async () => {
    const db = await freshDb()
    try {
      const { pid } = await seed(db)
      // Draft: subject contains "urgent" -> high, else low. Output key = urgency.
      const config = {
        output_tag_key: 'urgency',
        output_value_enum: ['high', 'low'],
        rules: [{ match: 'subject contains "urgent"', output: 'high' }],
        fallback: { output: 'low' },
      }
      const res = await post(db, { pipeline_id: pid, config })
      expect(res.status).toBe(200)
      const body = (await res.json()) as PreviewResponse

      expect(body.total_evaluated).toBe(3)
      // Newest first: m3, m2, m1
      const byId = new Map(body.results.map((r) => [r.message_id, r]))

      // m1: current urgency=low, draft (subject "Quarterly report") -> low. no change.
      const r1 = byId.get(body.results.find((r) => r.subject === 'Quarterly report')?.message_id as number)
      expect(r1?.current_value).toBe('low')
      expect(r1?.draft_value).toBe('low')
      expect(r1?.changed).toBe(false)

      // m2: current urgency=high, draft (subject "URGENT: deadline") -> high. no change.
      const r2 = body.results.find((r) => r.subject === 'URGENT: deadline')
      expect(r2?.current_value).toBe('high')
      expect(r2?.draft_value).toBe('high')
      expect(r2?.changed).toBe(false)

      // m3: no urgency key yet -> current_value null; draft (subject "lunch") -> low. changed.
      const r3 = body.results.find((r) => r.subject === 'lunch')
      expect(r3?.current_value).toBe(null)
      expect(r3?.draft_value).toBe('low')
      expect(r3?.changed).toBe(true)

      expect(body.changed_count).toBe(1)
    } finally {
      await closeDatabase(db)
    }
  })

  it('reads input tags (tag.<key>) from the Triage as match context', async () => {
    const db = await freshDb()
    try {
      const { pid } = await seed(db)
      // Draft keys off another Operator's output (`tag.source`): work -> high.
      const config = {
        output_tag_key: 'urgency',
        output_value_enum: ['high', 'low'],
        rules: [{ match: 'tag.source == "work"', output: 'high' }],
        fallback: { output: 'low' },
      }
      const res = await post(db, { pipeline_id: pid, config })
      const body = (await res.json()) as PreviewResponse

      const r1 = body.results.find((r) => r.subject === 'Quarterly report')
      // m1 source=newsletter -> low; was low -> no change
      expect(r1?.draft_value).toBe('low')
      expect(r1?.changed).toBe(false)

      const r2 = body.results.find((r) => r.subject === 'URGENT: deadline')
      // m2 source=work -> high; was high -> no change
      expect(r2?.draft_value).toBe('high')
      expect(r2?.changed).toBe(false)

      const r3 = body.results.find((r) => r.subject === 'lunch')
      // m3 source=work -> high; had no urgency (null) -> changed
      expect(r3?.draft_value).toBe('high')
      expect(r3?.current_value).toBe(null)
      expect(r3?.changed).toBe(true)

      expect(body.changed_count).toBe(1)
    } finally {
      await closeDatabase(db)
    }
  })

  it('respects limit and newest-first ordering', async () => {
    const db = await freshDb()
    try {
      const { pid } = await seed(db)
      const config = {
        output_tag_key: 'urgency',
        output_value_enum: ['high', 'low'],
        rules: [],
        fallback: { output: 'low' },
      }
      const res = await post(db, { pipeline_id: pid, config, limit: 2 })
      const body = (await res.json()) as PreviewResponse
      expect(body.total_evaluated).toBe(2)
      // Newest two: m3 (3000), m2 (2000), in DESC order.
      expect(body.results.map((r) => r.subject)).toEqual(['lunch', 'URGENT: deadline'])
    } finally {
      await closeDatabase(db)
    }
  })

  it('returns empty results for a Pipeline with no current Triages', async () => {
    const db = await freshDb()
    try {
      const userId = await insertUser(db)
      const emptyPid = await insertPipeline(db, userId, 'empty')
      const config = {
        output_tag_key: 'urgency',
        output_value_enum: ['high', 'low'],
        rules: [],
        fallback: { output: 'low' },
      }
      const res = await post(db, { pipeline_id: emptyPid, config })
      expect(res.status).toBe(200)
      const body = (await res.json()) as PreviewResponse
      expect(body).toEqual({
        results: [],
        changed_count: 0,
        total_evaluated: 0,
      })
    } finally {
      await closeDatabase(db)
    }
  })

  it('rejects a non-rule-based / invalid config with 400', async () => {
    const db = await freshDb()
    try {
      const { pid } = await seed(db)
      // Missing required fields / wrong shape (e.g. an LLM-tagger-ish blob).
      const res = await post(db, {
        pipeline_id: pid,
        config: { model_id: 'anthropic.claude', prompt: 'classify' },
      })
      expect(res.status).toBe(400)
    } finally {
      await closeDatabase(db)
    }
  })

  it('rejects a config whose rule output is outside output_value_enum (400)', async () => {
    const db = await freshDb()
    try {
      const { pid } = await seed(db)
      const res = await post(db, {
        pipeline_id: pid,
        config: {
          output_tag_key: 'urgency',
          output_value_enum: ['high', 'low'],
          rules: [{ match: 'subject contains "x"', output: 'medium' }],
          fallback: { output: 'low' },
        },
      })
      expect(res.status).toBe(400)
    } finally {
      await closeDatabase(db)
    }
  })

  it('surfaces a malformed match expression as a 400 with the parse error', async () => {
    const db = await freshDb()
    try {
      const { pid } = await seed(db)
      const config = {
        output_tag_key: 'urgency',
        output_value_enum: ['high', 'low'],
        // `subject` with no operator/operand is a parse error at eval time.
        rules: [{ match: 'subject ==', output: 'high' }],
        fallback: { output: 'low' },
      }
      const res = await post(db, { pipeline_id: pid, config })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string; message: string }
      expect(body.error).toBe('invalid_match_expression')
      expect(typeof body.message).toBe('string')
    } finally {
      await closeDatabase(db)
    }
  })

  it('marks rows unchanged when the draft reproduces the current value', async () => {
    const db = await freshDb()
    try {
      const { pid } = await seed(db)
      // Draft mirrors the seeded tags exactly: source==work -> high else low.
      const config = {
        output_tag_key: 'urgency',
        output_value_enum: ['high', 'low'],
        rules: [
          { match: 'subject contains "urgent"', output: 'high' },
          { match: 'subject contains "quarterly"', output: 'low' },
        ],
        fallback: { output: 'low' },
      }
      const res = await post(db, { pipeline_id: pid, config })
      const body = (await res.json()) as PreviewResponse
      // m1 low->low, m2 high->high are unchanged; m3 (null)->low changed.
      const changed = body.results.filter((r) => r.changed)
      expect(changed.map((r) => r.subject)).toEqual(['lunch'])
    } finally {
      await closeDatabase(db)
    }
  })
})
