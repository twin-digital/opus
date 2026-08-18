import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase } from '../../db/connection.js'
import type { Database } from '../../db/schema.js'
import { freshDb } from '../../pipeline/test-helpers.js'
import { isLocationKey, locationKey, makeImapMessageStore, referencedMessageIds } from './imap-message-store.js'

describe('locationKey (d-00smatg0)', () => {
  it('names where the message was, and is recognisable as such', () => {
    const key = locationKey({ folder: 'INBOX', uidValidity: 100, uid: 7 })
    expect(key).toBe('imap-loc:100:7:INBOX')
    expect(isLocationKey(key)).toBe(true)
    expect(isLocationKey('<one@x>')).toBe(false)
  })
})

describe('referencedMessageIds (d-q96iw28w)', () => {
  it('reads References oldest-first, then In-Reply-To, without repeats', () => {
    expect(referencedMessageIds({ references: '<a@x> <b@x>', 'in-reply-to': '<b@x>' })).toEqual(['<a@x>', '<b@x>'])
  })

  it('names nothing for a message that answers nothing', () => {
    expect(referencedMessageIds({})).toEqual([])
  })
})

describe('the IMAP message store', () => {
  let db: Kysely<Database>

  beforeEach(async () => {
    db = await freshDb()
    await db.insertInto('users').values({ name: 'u', email: null, created_at: 0 }).execute()
    await db
      .insertInto('accounts')
      .values({
        user_id: 1,
        name: 'a',
        icon: null,
        color: null,
        provider_type: 'imap',
        active_pipeline_id: null,
        settings_json: '{}',
        last_polled_at: null,
        last_history_cursor: null,
        last_reconciled_at: null,
        capabilities_json: null,
        paused_reason: null,
        created_at: 0,
        deleted_at: null,
      })
      .execute()
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  async function seedMessage(values: {
    backendMessageId: string
    threadId?: string | null
    folder?: string
    uidValidity?: number
    uid?: number
    state?: 'present' | 'archived'
  }): Promise<void> {
    await db
      .insertInto('messages')
      .values({
        account_id: 1,
        backend_message_id: values.backendMessageId,
        backend_thread_id: values.threadId ?? null,
        created_at: 100,
        source_state: values.state ?? 'present',
        imap_folder: values.folder ?? null,
        imap_uidvalidity: values.uidValidity ?? null,
        imap_uid: values.uid ?? null,
      })
      .execute()
  }

  it('reads back where a message was last seen (d-k4nt8zbu)', async () => {
    await seedMessage({ backendMessageId: '<one@x>', folder: 'INBOX', uidValidity: 100, uid: 4 })
    const store = makeImapMessageStore(db)

    expect(await store.locationOf(1, '<one@x>')).toEqual({ folder: 'INBOX', uidValidity: 100, uid: 4 })
    expect(await store.locationOf(1, '<absent@x>')).toBeNull()
  })

  it('reads no location for a row that carries none', async () => {
    await seedMessage({ backendMessageId: '<one@x>' })
    expect(await makeImapMessageStore(db).locationOf(1, '<one@x>')).toBeNull()
  })

  it('lists the messages held without an identity that survives a move', async () => {
    await seedMessage({ backendMessageId: '<one@x>', folder: 'INBOX', uidValidity: 100, uid: 1 })
    await seedMessage({
      backendMessageId: 'imap-loc:100:2:INBOX',
      folder: 'INBOX',
      uidValidity: 100,
      uid: 2,
      state: 'archived',
    })

    expect(await makeImapMessageStore(db).unidentified(1)).toEqual([
      {
        backendMessageId: 'imap-loc:100:2:INBOX',
        location: { folder: 'INBOX', uidValidity: 100, uid: 2 },
        state: 'archived',
      },
    ])
  })

  describe('placeInThread (d-q96iw28w, d-y3uh9ofx)', () => {
    it('makes a message that answers nothing its own thread', async () => {
      const placement = await makeImapMessageStore(db).placeInThread(1, { 'message-id': '<root@x>' })
      expect(placement).toEqual({ backendThreadId: '<root@x>', isReply: false, messageCount: 0 })
    })

    it('joins the thread a referenced message already sits in', async () => {
      await seedMessage({ backendMessageId: '<root@x>', threadId: '<root@x>' })
      const placement = await makeImapMessageStore(db).placeInThread(1, {
        'message-id': '<reply@x>',
        'in-reply-to': '<root@x>',
      })
      expect(placement).toEqual({ backendThreadId: '<root@x>', isReply: true, messageCount: 2 })
    })

    it('takes the oldest ancestor the headers name where grinbox holds none of them', async () => {
      const placement = await makeImapMessageStore(db).placeInThread(1, {
        'message-id': '<reply@x>',
        references: '<root@x> <mid@x>',
      })
      expect(placement).toMatchObject({ backendThreadId: '<root@x>', isReply: true })
    })

    it('counts the messages grinbox holds in the thread, not what the server has', async () => {
      await seedMessage({ backendMessageId: '<root@x>', threadId: '<root@x>' })
      await seedMessage({ backendMessageId: '<second@x>', threadId: '<root@x>' })
      const placement = await makeImapMessageStore(db).placeInThread(1, {
        'message-id': '<third@x>',
        'in-reply-to': '<root@x>',
      })
      expect(placement.messageCount).toBe(3)
    })
  })
})
