import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type DB, closeDatabase } from '../../db/index.js'
import { resolveInferenceProfile } from '../../resources/bedrock.js'
import { createApiRoutes } from './index.js'
import type { ModelOption } from './models.js'
import { fixedNow, freshDb } from './test-support.js'

describe('GET /api/models', () => {
  let db: DB
  beforeEach(async () => {
    db = await freshDb()
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('returns the offered models with non-empty labels', async () => {
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/models')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { models: ModelOption[] }
    expect(body.models.length).toBeGreaterThan(0)
    for (const model of body.models) {
      expect(model.id.length).toBeGreaterThan(0)
      expect(model.label.length).toBeGreaterThan(0)
    }
  })

  it('offers only ids the daemon can map to an inference profile', async () => {
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/models')
    const body = (await res.json()) as { models: ModelOption[] }
    for (const model of body.models) {
      // Would throw UnmappedModelError for an unmapped id.
      expect(resolveInferenceProfile(model.id)).toMatch(/^global\./)
    }
  })
})
