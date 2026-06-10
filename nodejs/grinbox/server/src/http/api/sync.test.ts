import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type DB, closeDatabase } from '../../db/index.js'
import { createApiRoutes } from './index.js'
import { fixedNow, freshDb } from './test-support.js'

/**
 * `POST /api/sync`: invokes the injected `syncNow` seam and returns its result,
 * or reports `sync_unavailable` (503) when the seam isn't wired.
 */
describe('POST /api/sync', () => {
  let db: DB
  beforeEach(async () => {
    db = await freshDb()
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('invokes syncNow and returns its summary', async () => {
    const syncNow = vi.fn(async () => ({ accounts: 2, newMessages: 5 }))
    const app = createApiRoutes({ db, now: fixedNow, syncNow })

    const res = await app.request('/api/sync', { method: 'POST' })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ accounts: 2, newMessages: 5 })
    expect(syncNow).toHaveBeenCalledTimes(1)
  })

  it('returns 503 sync_unavailable when no syncNow is wired', async () => {
    const app = createApiRoutes({ db, now: fixedNow })

    const res = await app.request('/api/sync', { method: 'POST' })

    expect(res.status).toBe(503)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('sync_unavailable')
  })
})
