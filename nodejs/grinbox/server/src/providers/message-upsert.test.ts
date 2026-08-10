import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase, openDatabase } from '../db/connection.js'
import { runMigrations } from '../db/migrator.js'
import type { DB } from '../db/schema.js'
import { messageViewFromRow } from '../operators/types.js'
import { loadMessageRow, upsertMessage } from './message-upsert.js'
import type { FetchedMessage } from './provider.js'

/**
 * `upsertMessage` over a migrated in-memory DB + a seeded account. Exercises:
 * insert vs. update idempotency on `(account_id, backend_message_id)`,
 * `received_at` backfill when the header is missing, `isNew` semantics, and the
 * round-trip back through `messageViewFromRow`.
 */

async function seedAccount(db: DB): Promise<number> {
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
      settings_json: JSON.stringify({ email: 'u@example.com' }),
      created_at: ts,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return account.id
}

function fetched(overrides: Partial<FetchedMessage> = {}): FetchedMessage {
  return {
    backendMessageId: 'm1',
    backendThreadId: 't1',
    from: 'a@b.com',
    to: 'me@x.com',
    subject: 'hi',
    snippet: 'preview',
    receivedAt: 5000,
    headers: { from: 'a@b.com', subject: 'hi' },
    bodyFetched: false,
    ...overrides,
  }
}

describe('upsertMessage', () => {
  let db: DB
  let accountId: number

  beforeEach(async () => {
    db = openDatabase(':memory:')
    await runMigrations(db)
    accountId = await seedAccount(db)
  })

  afterEach(async () => {
    await closeDatabase(db)
  })

  it('inserts a new row and reports isNew', async () => {
    const res = await upsertMessage(db, accountId, fetched(), 9000)
    expect(res.isNew).toBe(true)
    expect(res.messageId).toBeGreaterThan(0)

    const row = await loadMessageRow(db, res.messageId)
    expect(row.backend_message_id).toBe('m1')
    expect(row.received_at).toBe(5000)
    expect(row.created_at).toBe(9000)
    // Metadata-only read path: body untouched, fetch never attempted.
    expect(row.body_fetched_at).toBeNull()
    expect(row.body_text).toBeNull()
  })

  it('is idempotent: repeat upsert updates the same row and reports not-new', async () => {
    const first = await upsertMessage(db, accountId, fetched(), 9000)
    const second = await upsertMessage(
      db,
      accountId,
      fetched({ subject: 'updated', headers: { subject: 'updated' } }),
      9500,
    )
    expect(second.isNew).toBe(false)
    expect(second.messageId).toBe(first.messageId)

    const count = await db
      .selectFrom('messages')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow()
    expect(count.n).toBe(1)

    const row = await loadMessageRow(db, second.messageId)
    expect(row.subject).toBe('updated')
    // created_at is a first-fetch snapshot, never rewritten.
    expect(row.created_at).toBe(9000)
  })

  it('update path refreshes every mutable conflict column (full column assertion)', async () => {
    // Dropping any of these from the doUpdateSet would ship undetected; assert
    // each conflict-updated column actually takes the new fetch's value.
    await upsertMessage(db, accountId, fetched(), 9000)
    const second = await upsertMessage(
      db,
      accountId,
      fetched({
        backendThreadId: 't-new',
        from: 'new-from@x.com',
        to: 'new-to@x.com',
        subject: 's-new',
        snippet: 'snippet-new',
        headers: { from: 'new-from@x.com', subject: 's-new', extra: 'v' },
      }),
      9500,
    )
    const row = await loadMessageRow(db, second.messageId)
    expect(row.backend_thread_id).toBe('t-new')
    expect(row.from_header).toBe('new-from@x.com')
    expect(row.to_header).toBe('new-to@x.com')
    expect(row.subject).toBe('s-new')
    expect(row.snippet).toBe('snippet-new')
    expect(JSON.parse(row.headers_json ?? '{}')).toEqual({
      from: 'new-from@x.com',
      subject: 's-new',
      extra: 'v',
    })
  })

  it('backfills received_at from created_at when the header time is missing', async () => {
    const res = await upsertMessage(db, accountId, fetched({ receivedAt: null }), 7777)
    const row = await loadMessageRow(db, res.messageId)
    expect(row.received_at).toBe(7777)
  })

  it('does not clobber a populated received_at with a backfilled one on repeat', async () => {
    const first = await upsertMessage(db, accountId, fetched(), 9000)
    await upsertMessage(db, accountId, fetched({ receivedAt: null }), 9500)
    const row = await loadMessageRow(db, first.messageId)
    // The real header time from the first fetch is preserved.
    expect(row.received_at).toBe(5000)
  })

  it('round-trips through messageViewFromRow including thread + headers', async () => {
    const res = await upsertMessage(db, accountId, fetched(), 9000)
    const row = await loadMessageRow(db, res.messageId)
    const view = messageViewFromRow(row)

    expect(view.from).toBe('a@b.com')
    expect(view.subject).toBe('hi')
    expect(view.snippet).toBe('preview')
    expect(view.receivedAt).toBe(5000)
    expect(view.headers.get('from')).toBe('a@b.com')
    expect(view.thread?.backendThreadId).toBe('t1')
  })

  it('records body_fetched_at and body when a body was fetched', async () => {
    const res = await upsertMessage(
      db,
      accountId,
      fetched({ bodyFetched: true, bodyText: 'full body', bodyHtml: null }),
      8000,
    )
    const row = await loadMessageRow(db, res.messageId)
    expect(row.body_fetched_at).toBe(8000)
    expect(row.body_text).toBe('full body')
  })

  it('preserves a prior body when a later metadata-only fetch arrives', async () => {
    const first = await upsertMessage(db, accountId, fetched({ bodyFetched: true, bodyText: 'full body' }), 8000)
    await upsertMessage(db, accountId, fetched({ bodyFetched: false }), 8500)
    const row = await loadMessageRow(db, first.messageId)
    expect(row.body_text).toBe('full body')
    expect(row.body_fetched_at).toBe(8000)
  })
})
