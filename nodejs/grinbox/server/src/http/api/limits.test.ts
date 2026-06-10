import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type DB, closeDatabase, seedDefaultLimits } from '../../db/index.js'
import { createApiRoutes } from './index.js'
import type { LimitEntry, MessageUsage, WindowUsage } from './limits.js'
import { FIXED_NOW, fixedNow, freshDb, insertUser } from './test-support.js'

describe('GET /api/limits', () => {
  let db: DB
  beforeEach(async () => {
    db = await freshDb()
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('returns empty list with no limits', async () => {
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/limits')
    expect(await res.json()).toEqual({ limits: [] })
  })

  it('reports default limits with zero usage when no counters exist', async () => {
    const userId = await insertUser(db)
    await seedDefaultLimits(db, userId)
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/limits')
    const body = (await res.json()) as { limits: LimitEntry[] }
    expect(body.limits.length).toBe(6)
    for (const l of body.limits) {
      if (l.usage.kind === 'per_window') {
        expect(l.usage.current_count).toBe(0)
        expect(l.usage.window_active).toBe(false)
      } else {
        expect(l.usage.messages_counted).toBe(0)
      }
    }
  })

  it('reports active window count and zeroes an expired window', async () => {
    const userId = await insertUser(db)
    await seedDefaultLimits(db, userId)
    // pushover send_notification per_window has window_seconds=600.
    const active = await db
      .selectFrom('limits')
      .where('resource', '=', 'pushover_api')
      .where('scope', '=', 'per_window')
      .select('id')
      .executeTakeFirstOrThrow()
    // Active window: started 100s ago (< 600).
    await db
      .insertInto('limit_counters_window')
      .values({ limit_id: active.id, window_start: FIXED_NOW - 100, count: 4 })
      .execute()

    // gmail apply_label per_window window=600 → set an expired window.
    const expired = await db
      .selectFrom('limits')
      .where('resource', '=', 'gmail_api')
      .where('operation', '=', 'apply_label')
      .select('id')
      .executeTakeFirstOrThrow()
    await db
      .insertInto('limit_counters_window')
      .values({
        limit_id: expired.id,
        window_start: FIXED_NOW - 700,
        count: 99,
      })
      .execute()

    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/limits')
    const body = (await res.json()) as { limits: LimitEntry[] }
    const activeEntry = body.limits.find((l) => l.id === active.id)
    expect((activeEntry?.usage as WindowUsage).current_count).toBe(4)
    expect((activeEntry?.usage as WindowUsage).window_active).toBe(true)

    const expiredEntry = body.limits.find((l) => l.id === expired.id)
    expect((expiredEntry?.usage as WindowUsage).current_count).toBe(0)
    expect((expiredEntry?.usage as WindowUsage).window_active).toBe(false)
  })

  it('treats an exactly-window-old counter as expired (now - start == window_seconds)', async () => {
    const userId = await insertUser(db)
    await seedDefaultLimits(db, userId)
    // pushover send_notification per_window has window_seconds=600.
    const limit = await db
      .selectFrom('limits')
      .where('resource', '=', 'pushover_api')
      .where('scope', '=', 'per_window')
      .select(['id', 'window_seconds'])
      .executeTakeFirstOrThrow()
    expect(limit.window_seconds).toBe(600)
    // Exactly at the boundary: now - window_start == window_seconds. The check
    // is strict `<`, so this window is expired (count reported as 0).
    await db
      .insertInto('limit_counters_window')
      .values({
        limit_id: limit.id,
        window_start: FIXED_NOW - 600,
        count: 7,
      })
      .execute()

    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/limits')
    const body = (await res.json()) as { limits: LimitEntry[] }
    const entry = body.limits.find((l) => l.id === limit.id)
    expect((entry?.usage as WindowUsage).window_active).toBe(false)
    expect((entry?.usage as WindowUsage).current_count).toBe(0)
  })

  it('aggregates per-message counters', async () => {
    const userId = await insertUser(db)
    await seedDefaultLimits(db, userId)
    const perMessage = await db
      .selectFrom('limits')
      .where('scope', '=', 'per_message')
      .where('resource', '=', 'pushover_api')
      .select('id')
      .executeTakeFirstOrThrow()
    // Need real messages for the FK.
    const acctId = (
      await db
        .insertInto('accounts')
        .values({
          user_id: userId,
          name: 'a',
          provider_type: 'gmail',
          settings_json: '{}',
          created_at: 1000,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
    ).id
    const mkMsg = async (bid: string) =>
      (
        await db
          .insertInto('messages')
          .values({
            account_id: acctId,
            backend_message_id: bid,
            created_at: 1000,
          })
          .returning('id')
          .executeTakeFirstOrThrow()
      ).id
    const a = await mkMsg('a')
    const b = await mkMsg('b')
    await db
      .insertInto('limit_counters_message')
      .values([
        { limit_id: perMessage.id, message_id: a, count: 1 },
        { limit_id: perMessage.id, message_id: b, count: 3 },
      ])
      .execute()

    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/limits')
    const body = (await res.json()) as { limits: LimitEntry[] }
    const entry = body.limits.find((l) => l.id === perMessage.id)
    const usage = entry?.usage as MessageUsage
    expect(usage.messages_counted).toBe(2)
    expect(usage.max_message_count).toBe(3)
  })
})
