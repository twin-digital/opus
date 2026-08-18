import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase } from '../db/connection.js'
import type { Database } from '../db/schema.js'
import { freshDb } from '../pipeline/test-helpers.js'
import type { ImapMessageStore } from '../providers/imap/imap-message-store.js'
import { IMAP_PROVIDER_TYPE } from '../providers/imap/imap-settings.js'
import { FakeSession, type FakeServer, fakeMessage, fakeServer } from '../providers/imap/test-support.js'
import { MessageGoneError, UnknownFolderError, imapMailboxBackend } from './imap-backend.js'

const SIGNAL = new AbortController().signal

const SETTINGS = {
  host: 'mail.example.com',
  port: 993,
  security: 'tls',
  username: 'u',
  folders: { arrival: 'INBOX', archived: 'Archive', trashed: 'Trash', spam: 'Junk' },
}

function store(overrides: Partial<ImapMessageStore> = {}): ImapMessageStore {
  return {
    locationOf: () => Promise.resolve(null),
    unidentified: () => Promise.resolve([]),
    placeInThread: () => Promise.resolve({ backendThreadId: null, isReply: false, messageCount: 1 }),
    ...overrides,
  }
}

describe('the IMAP mailbox backend', () => {
  let db: Kysely<Database>
  let accountId: number
  let server: FakeServer
  let sessions: FakeSession[]

  beforeEach(async () => {
    db = await freshDb()
    await db.insertInto('users').values({ name: 'u', email: null, created_at: 0 }).execute()
    const account = await db
      .insertInto('accounts')
      .values({
        user_id: 1,
        name: 'a',
        icon: null,
        color: null,
        provider_type: IMAP_PROVIDER_TYPE,
        active_pipeline_id: null,
        settings_json: JSON.stringify(SETTINGS),
        last_polled_at: null,
        last_history_cursor: null,
        last_reconciled_at: null,
        capabilities_json: null,
        paused_reason: null,
        created_at: 0,
        deleted_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    accountId = account.id
    server = fakeServer()
    sessions = []
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  function backend(overrides: Partial<ImapMessageStore> = {}) {
    return imapMailboxBackend({
      db,
      store: store(overrides),
      openSession: () => {
        const session = new FakeSession(server)
        sessions.push(session)
        return Promise.resolve(session)
      },
    })
  }

  describe('archive (d-661z414c, d-8am29x25)', () => {
    it('moves the message out of the arrival folder', async () => {
      server.folders.INBOX.messages = [fakeMessage(1, { 'message-id': '<one@x>' })]
      const result = await backend().archive(accountId, { backendMessageId: '<one@x>' }, SIGNAL)

      expect(result).toEqual({ archived: true })
      expect(sessions[0]?.moves).toEqual([{ from: 'INBOX', uid: 1, to: 'Archive' }])
      expect(server.folders.Archive.messages).toHaveLength(1)
    })

    it('leaves a message the user already moved where it is', async () => {
      server.folders.Junk.messages = [fakeMessage(1, { 'message-id': '<one@x>' })]
      const result = await backend().archive(accountId, { backendMessageId: '<one@x>' }, SIGNAL)

      expect(result).toEqual({ archived: false })
      expect(sessions[0]?.moves).toEqual([])
      expect(server.folders.Junk.messages).toHaveLength(1)
    })

    it('fails where the message is no longer findable', async () => {
      await expect(backend().archive(accountId, { backendMessageId: '<gone@x>' }, SIGNAL)).rejects.toBeInstanceOf(
        MessageGoneError,
      )
    })
  })

  describe('file (d-jj2mymbi, d-k8va629q)', () => {
    it('moves the message into the folder the user named', async () => {
      server.folders.Receipts = { uidValidity: 500, messages: [] }
      server.folders.INBOX.messages = [fakeMessage(1, { 'message-id': '<one@x>' })]

      expect(await backend().file(accountId, { backendMessageId: '<one@x>', folder: 'Receipts' }, SIGNAL)).toEqual({
        filed: true,
      })
      expect(server.folders.Receipts.messages).toHaveLength(1)
      expect(server.folders.INBOX.messages).toHaveLength(0)
    })

    it('files a message out of a folder other than the arrival one', async () => {
      server.folders.Receipts = { uidValidity: 500, messages: [] }
      server.folders.Archive.messages = [fakeMessage(1, { 'message-id': '<one@x>' })]

      await backend().file(accountId, { backendMessageId: '<one@x>', folder: 'Receipts' }, SIGNAL)
      expect(sessions[0]?.moves).toEqual([{ from: 'Archive', uid: 1, to: 'Receipts' }])
    })

    it('refuses a folder the account does not have, and creates none (r-g1iwlbzs)', async () => {
      server.folders.INBOX.messages = [fakeMessage(1, { 'message-id': '<one@x>' })]

      await expect(
        backend().file(accountId, { backendMessageId: '<one@x>', folder: 'Receipts' }, SIGNAL),
      ).rejects.toBeInstanceOf(UnknownFolderError)
      expect(Object.keys(server.folders)).not.toContain('Receipts')
    })

    it('matches the folder name character for character', async () => {
      server.folders['INBOX.Receipts'] = { uidValidity: 500, messages: [] }
      server.folders.INBOX.messages = [fakeMessage(1, { 'message-id': '<one@x>' })]

      await expect(
        backend().file(accountId, { backendMessageId: '<one@x>', folder: 'inbox.receipts' }, SIGNAL),
      ).rejects.toBeInstanceOf(UnknownFolderError)
      await expect(
        backend().file(accountId, { backendMessageId: '<one@x>', folder: 'INBOX/Receipts' }, SIGNAL),
      ).rejects.toBeInstanceOf(UnknownFolderError)
    })

    it('is a no-op where the message is already in the destination', async () => {
      server.folders.Receipts = { uidValidity: 500, messages: [fakeMessage(1, { 'message-id': '<one@x>' })] }
      const located = backend({
        locationOf: () => Promise.resolve({ folder: 'Receipts', uidValidity: 500, uid: 1 }),
      })

      expect(await located.file(accountId, { backendMessageId: '<one@x>', folder: 'Receipts' }, SIGNAL)).toEqual({
        filed: true,
      })
      expect(sessions[0]?.moves).toEqual([])
    })

    it("cannot find a message filed outside the account's four folders (d-k4nt8zbu)", async () => {
      server.folders.Receipts = { uidValidity: 500, messages: [fakeMessage(1, { 'message-id': '<one@x>' })] }

      await expect(
        backend().file(accountId, { backendMessageId: '<one@x>', folder: 'Receipts' }, SIGNAL),
      ).rejects.toBeInstanceOf(MessageGoneError)
    })
  })

  describe('apply_category (d-bl5oamiz, d-mtgha4ra)', () => {
    it('stores the keyword and touches no other flag', async () => {
      server.folders.INBOX.messages = [{ ...fakeMessage(1, { 'message-id': '<one@x>' }), flags: ['\\Seen'] }]

      expect(
        await backend().apply_category(accountId, { backendMessageId: '<one@x>', category: 'later' }, SIGNAL),
      ).toEqual({ applied: true })
      expect(server.folders.INBOX.messages[0]?.flags).toEqual(['\\Seen', 'later'])
    })
  })

  describe('fetch_body', () => {
    it("reads the body at the message's location", async () => {
      server.folders.INBOX.messages = [
        { ...fakeMessage(1, { 'message-id': '<one@x>' }), bodyText: 'hello', bodyHtml: '<p>hello</p>' },
      ]

      expect(await backend().fetch_body(accountId, { backendMessageId: '<one@x>' }, SIGNAL)).toEqual({
        bodyText: 'hello',
        bodyHtml: '<p>hello</p>',
      })
    })
  })

  it('closes every session it opened (d-p82gksff)', async () => {
    server.folders.INBOX.messages = [fakeMessage(1, { 'message-id': '<one@x>' })]
    await backend().archive(accountId, { backendMessageId: '<one@x>' }, SIGNAL)
    expect(sessions.every((s) => s.closed)).toBe(true)
  })
})
