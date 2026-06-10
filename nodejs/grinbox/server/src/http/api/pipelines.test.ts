import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type DB, closeDatabase } from '../../db/index.js'
import { createApiRoutes } from './index.js'
import type { PipelineDetail } from './pipelines.js'
import {
  fixedNow,
  freshDb,
  insertAccount,
  insertOperator,
  insertPipeline,
  insertUser,
  ruleTaggerConfig,
} from './test-support.js'

describe('GET /api/pipelines', () => {
  let db: DB
  beforeEach(async () => {
    db = await freshDb()
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('returns empty list with no pipelines', async () => {
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/pipelines')
    expect(await res.json()).toEqual({ pipelines: [] })
  })

  it('counts active accounts per pipeline', async () => {
    const userId = await insertUser(db)
    const p1 = await insertPipeline(db, userId, 'one', 'first pipe')
    const p2 = await insertPipeline(db, userId, 'two')
    await insertAccount(db, userId, { name: 'a1', activePipelineId: p1 })
    await insertAccount(db, userId, { name: 'a2', activePipelineId: p1 })
    await insertAccount(db, userId, { name: 'a3', activePipelineId: null })

    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/pipelines')
    const body = (await res.json()) as {
      pipelines: {
        id: number
        description: string | null
        active_account_count: number
      }[]
    }
    const byId = new Map(body.pipelines.map((p) => [p.id, p]))
    expect(byId.get(p1)?.active_account_count).toBe(2)
    expect(byId.get(p1)?.description).toBe('first pipe')
    expect(byId.get(p2)?.active_account_count).toBe(0)
  })

  it('detail returns operators with contracts + tag-key registry', async () => {
    const userId = await insertUser(db)
    const pid = await insertPipeline(db, userId, 'pipe')
    await insertOperator(db, pid, {
      name: 'urgency',
      typeKey: 'rule_based_tagger',
      configJson: ruleTaggerConfig('urgency', ['high', 'low']),
    })
    await insertOperator(db, pid, {
      name: 'category',
      typeKey: 'rule_based_tagger',
      configJson: ruleTaggerConfig('category', ['work', 'personal']),
    })
    // A disabled operator: listed but excluded from the tag-key registry.
    await insertOperator(db, pid, {
      name: 'disabled-one',
      typeKey: 'rule_based_tagger',
      configJson: ruleTaggerConfig('archived', ['yes', 'no']),
      enabled: false,
    })

    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request(`/api/pipelines/${pid}`)
    expect(res.status).toBe(200)
    const { pipeline } = (await res.json()) as { pipeline: PipelineDetail }

    expect(pipeline.operators).toHaveLength(3)
    // These Taggers reference no upstream Tags (no `tag.<key>` in any Rule), so
    // none declares an input → every operator is an independent group-0 source.
    expect(pipeline.operators.every((o) => o.group === 0)).toBe(true)
    const urgency = pipeline.operators.find((o) => o.name === 'urgency')
    expect(urgency?.contract?.outputs).toEqual([{ key: 'urgency', valueEnum: ['high', 'low'] }])
    const disabled = pipeline.operators.find((o) => o.name === 'disabled-one')
    expect(disabled?.enabled).toBe(false)

    // tag-key registry: only enabled operators' outputs.
    const keys = pipeline.tag_key_registry.map((e) => e.key).sort()
    expect(keys).toEqual(['category', 'urgency'])
    const reg = pipeline.tag_key_registry.find((e) => e.key === 'urgency')
    expect(reg?.value_enum).toEqual(['high', 'low'])
  })

  it('detail returns each operator parsed config for editor pre-population', async () => {
    const userId = await insertUser(db)
    const pid = await insertPipeline(db, userId)
    const ruleConfig = ruleTaggerConfig('urgency', ['high', 'low'])
    await insertOperator(db, pid, {
      name: 'urgency',
      typeKey: 'rule_based_tagger',
      configJson: ruleConfig,
    })

    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request(`/api/pipelines/${pid}`)
    expect(res.status).toBe(200)
    const { pipeline } = (await res.json()) as { pipeline: PipelineDetail }
    const urgency = pipeline.operators.find((o) => o.name === 'urgency')
    // The stored config_json round-trips into the response `config` field.
    expect(urgency?.config).toEqual(JSON.parse(ruleConfig))
  })

  it('detail returns null config for an unparseable config_json', async () => {
    const userId = await insertUser(db)
    const pid = await insertPipeline(db, userId)
    await insertOperator(db, pid, {
      name: 'broken',
      typeKey: 'rule_based_tagger',
      configJson: 'not-json{',
    })
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request(`/api/pipelines/${pid}`)
    const { pipeline } = (await res.json()) as { pipeline: PipelineDetail }
    expect(pipeline.operators[0]?.config).toBeNull()
  })

  it('detail tolerates an unknown type / unparseable config (contract null)', async () => {
    const userId = await insertUser(db)
    const pid = await insertPipeline(db, userId)
    await insertOperator(db, pid, {
      name: 'weird',
      typeKey: 'not_a_real_type',
      configJson: '{}',
    })
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request(`/api/pipelines/${pid}`)
    expect(res.status).toBe(200)
    const { pipeline } = (await res.json()) as { pipeline: PipelineDetail }
    expect(pipeline.operators[0]?.contract).toBeNull()
    expect(pipeline.tag_key_registry).toEqual([])
  })

  it('detail 404s for missing pipeline', async () => {
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/pipelines/123')
    expect(res.status).toBe(404)
  })
})
