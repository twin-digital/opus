import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, openDatabase } from '../db/connection.js'
import { runMigrations } from '../db/migrator.js'
import type { DB } from '../db/schema.js'
import { seedDefaultLimits } from '../db/seed.js'
import { checkAndConsumeLimits } from './limits.js'

/**
 * Limit engine over a migrated in-memory DB seeded with the default Limits.
 * Exercises: per_window allow-to-cap-then-deny, tumbling reset, per_message
 * accumulation, and increment-only-on-allow.
 */

async function seedUserAndMessage(db: DB): Promise<{ userId: number; messageId: number }> {
  const ts = 1000
  const user = await db
    .insertInto('users')
    .values({ name: 'u', email: 'u@example.com', created_at: ts })
    .returning('id')
    .executeTakeFirstOrThrow()
  const account = await db
    .insertInto('accounts')
    .values({
      user_id: user.id,
      name: 'a',
      provider_type: 'gmail',
      settings_json: '{}',
      created_at: ts,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const message = await db
    .insertInto('messages')
    .values({
      account_id: account.id,
      backend_message_id: 'm1',
      created_at: ts,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await seedDefaultLimits(db, user.id)
  return { userId: user.id, messageId: message.id }
}

describe('checkAndConsumeLimits', () => {
  let db: DB

  beforeEach(async () => {
    db = openDatabase(':memory:')
    await runMigrations(db)
  })

  afterEach(async () => {
    await closeDatabase(db)
  })

  it('allows up to a per_window cap then denies', async () => {
    const { userId, messageId } = await seedUserAndMessage(db)
    // gmail_api.apply_label per_window cap is 100; lower-cap window is
    // llm_bedrock.invoke_model = 50, but the cleanest is pushover per_window=10.
    // Use a custom message id per call is unnecessary for per_window.
    const args = {
      userId,
      resource: 'pushover_api',
      operation: 'send_notification',
      messageId,
    }
    // pushover_api.send_notification also has a per_message cap of 1, so vary
    // the message to isolate the per_window behavior.
    const results: boolean[] = []
    for (let i = 0; i < 12; i++) {
      // unique message per attempt so per_message never denies
      const msg = await db
        .insertInto('messages')
        .values({
          account_id: 1,
          backend_message_id: `pw-${i}`,
          created_at: 1000,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      const r = await checkAndConsumeLimits(db, { ...args, messageId: msg.id }, 2000)
      results.push(r.allowed)
    }
    // First 10 allowed, then denied.
    expect(results.slice(0, 10).every((a) => a)).toBe(true)
    expect(results.slice(10).every((a) => !a)).toBe(true)
  })

  it('reports the denying per_window limit id + scope', async () => {
    const { userId, messageId } = await seedUserAndMessage(db)
    const limit = await db
      .selectFrom('limits')
      .select('id')
      .where('user_id', '=', userId)
      .where('resource', '=', 'llm_bedrock')
      .where('operation', '=', 'invoke_model')
      .where('scope', '=', 'per_window')
      .executeTakeFirstOrThrow()
    // invoke_model only has a per_window cap (50), so per_message won't fire.
    let last = await checkAndConsumeLimits(
      db,
      {
        userId,
        resource: 'llm_bedrock',
        operation: 'invoke_model',
        messageId,
      },
      2000,
    )
    for (let i = 0; i < 60; i++) {
      last = await checkAndConsumeLimits(
        db,
        {
          userId,
          resource: 'llm_bedrock',
          operation: 'invoke_model',
          messageId,
        },
        2000,
      )
    }
    expect(last.allowed).toBe(false)
    if (!last.allowed) {
      expect(last.scope).toBe('per_window')
      expect(last.limit_id).toBe(limit.id)
    }
  })

  it('resets a tumbling window after window_seconds elapses', async () => {
    const { userId } = await seedUserAndMessage(db)
    const consume = (now: number, msgId: number) =>
      checkAndConsumeLimits(
        db,
        {
          userId,
          resource: 'pushover_api',
          operation: 'send_notification',
          messageId: msgId,
        },
        now,
      )
    // Window is 600s. Exhaust the cap of 10 at t=1000 (unique messages).
    for (let i = 0; i < 10; i++) {
      const msg = await db
        .insertInto('messages')
        .values({ account_id: 1, backend_message_id: `r-${i}`, created_at: 1 })
        .returning('id')
        .executeTakeFirstOrThrow()
      expect((await consume(1000, msg.id)).allowed).toBe(true)
    }
    const overMsg = await db
      .insertInto('messages')
      .values({ account_id: 1, backend_message_id: 'r-over', created_at: 1 })
      .returning('id')
      .executeTakeFirstOrThrow()
    expect((await consume(1000, overMsg.id)).allowed).toBe(false)
    // After the window elapses (t >= 1000 + 600), the counter resets.
    const afterMsg = await db
      .insertInto('messages')
      .values({ account_id: 1, backend_message_id: 'r-after', created_at: 1 })
      .returning('id')
      .executeTakeFirstOrThrow()
    expect((await consume(1601, afterMsg.id)).allowed).toBe(true)
  })

  it('accumulates a per_message counter and denies at the cap', async () => {
    const { userId, messageId } = await seedUserAndMessage(db)
    // pushover_api.send_notification per_message cap = 1.
    const args = {
      userId,
      resource: 'pushover_api',
      operation: 'send_notification',
      messageId,
    }
    const first = await checkAndConsumeLimits(db, args, 2000)
    expect(first.allowed).toBe(true)
    const second = await checkAndConsumeLimits(db, args, 2000)
    expect(second.allowed).toBe(false)
    if (!second.allowed) {
      expect(second.scope).toBe('per_message')
    }
  })

  it('does not increment any counter when a Limit denies', async () => {
    const { userId, messageId } = await seedUserAndMessage(db)
    const windowLimit = await db
      .selectFrom('limits')
      .select('id')
      .where('user_id', '=', userId)
      .where('resource', '=', 'pushover_api')
      .where('operation', '=', 'send_notification')
      .where('scope', '=', 'per_window')
      .executeTakeFirstOrThrow()
    // First call: per_message (cap 1) + per_window both allow → both at 1.
    await checkAndConsumeLimits(
      db,
      {
        userId,
        resource: 'pushover_api',
        operation: 'send_notification',
        messageId,
      },
      2000,
    )
    const windowAfterFirst = await db
      .selectFrom('limit_counters_window')
      .select('count')
      .where('limit_id', '=', windowLimit.id)
      .executeTakeFirstOrThrow()
    expect(windowAfterFirst.count).toBe(1)
    // Second call on the SAME message: per_message denies. The per_window
    // counter must NOT have been incremented (all-or-nothing).
    const denied = await checkAndConsumeLimits(
      db,
      {
        userId,
        resource: 'pushover_api',
        operation: 'send_notification',
        messageId,
      },
      2000,
    )
    expect(denied.allowed).toBe(false)
    const windowAfterDeny = await db
      .selectFrom('limit_counters_window')
      .select('count')
      .where('limit_id', '=', windowLimit.id)
      .executeTakeFirstOrThrow()
    expect(windowAfterDeny.count).toBe(1)
  })

  it('allows when no Limit matches the operation', async () => {
    const { userId, messageId } = await seedUserAndMessage(db)
    const r = await checkAndConsumeLimits(
      db,
      {
        userId,
        resource: 'gmail_api',
        operation: 'fetch_metadata', // no default Limit for this op
        messageId,
      },
      2000,
    )
    expect(r.allowed).toBe(true)
  })
})
