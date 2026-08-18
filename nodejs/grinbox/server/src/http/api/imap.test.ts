import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createImapAccount } from '../../config/imap-account.js'
import { makeEncryptor } from '../../crypto/encryption.js'
import { type DB, closeDatabase } from '../../db/index.js'
import { allCapabilities } from '../../providers/account-capabilities.js'
import { ImapCredentialRejectedError } from '../../providers/imap/imap-client.js'
import { ImapCertificateError } from '../../providers/imap/imap-session.js'
import { parseImapSettings } from '../../providers/imap/imap-settings.js'
import type { ImapProbe, ImapProbeResult } from './deps.js'
import { createApiRoutes } from './index.js'
import { fixedNow, freshDb, insertUser } from './test-support.js'

const encryptor = makeEncryptor(Buffer.alloc(32, 3))

const CONNECTION = { host: 'mail.example.com', port: 993, security: 'tls' as const, username: 'u' }
const FOLDERS = { arrival: 'INBOX', archived: 'Archive', trashed: 'Trash', spam: 'Junk' }

const PROBED: ImapProbeResult = {
  folders: [
    { name: 'INBOX', proposed_role: 'arrival' },
    { name: 'Archive', proposed_role: 'archived' },
    { name: 'Trash', proposed_role: 'trashed' },
    { name: 'Junk', proposed_role: 'spam' },
    { name: 'INBOX.Receipts', proposed_role: null },
  ],
  capabilities: allCapabilities(0),
}

function routes(db: DB, imapProbe?: ImapProbe) {
  return createApiRoutes({ db, now: fixedNow, encryptor, imapProbe })
}

function post(path: string, body: unknown): Request {
  return new Request(`http://local${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/imap', () => {
  let db: DB
  beforeEach(async () => {
    db = await freshDb()
    await insertUser(db)
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  describe('POST /api/imap/probe (d-fuln110d, r-e40s6olu)', () => {
    it('reports the folders the account has and what it can carry', async () => {
      const probe = vi.fn<ImapProbe>(() => Promise.resolve(PROBED))
      const res = await routes(db, probe).request(post('/api/imap/probe', { ...CONNECTION, password: 'p' }))

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual(PROBED)
      expect(probe).toHaveBeenCalledWith(CONNECTION, 'p')
    })

    it('leaves nothing behind (d-8jc4taom)', async () => {
      await routes(db, () => Promise.resolve(PROBED)).request(post('/api/imap/probe', { ...CONNECTION, password: 'p' }))
      expect(await db.selectFrom('accounts').selectAll().execute()).toEqual([])
      expect(await db.selectFrom('credentials').selectAll().execute()).toEqual([])
    })

    it('names a refused credential as such (d-oaaz2fwk)', async () => {
      const probe = () => Promise.reject(new ImapCredentialRejectedError('the server refused it'))
      const res = await routes(db, probe).request(post('/api/imap/probe', { ...CONNECTION, password: 'p' }))

      expect(res.status).toBe(401)
      expect(await res.json()).toMatchObject({ error: { code: 'account_login_failed' } })
    })

    it('names a certificate that would not verify apart from an unreachable server (d-lru4i8rp)', async () => {
      const probe = () => Promise.reject(new ImapCertificateError('self-signed'))
      const res = await routes(db, probe).request(post('/api/imap/probe', { ...CONNECTION, password: 'p' }))

      expect(res.status).toBe(502)
      expect(await res.json()).toMatchObject({ error: { code: 'certificate_unverified' } })
    })

    it('says so plainly when no transport is configured', async () => {
      const res = await routes(db).request(post('/api/imap/probe', { ...CONNECTION, password: 'p' }))
      expect(res.status).toBe(503)
      expect(await res.json()).toMatchObject({ error: { code: 'imap_unavailable' } })
    })
  })

  describe('POST /api/imap/accounts (d-8jc4taom)', () => {
    const body = { ...CONNECTION, password: 'p', name: 'work', address: 'u@example.com', folders: FOLDERS }

    it('creates the account once the folders are accepted', async () => {
      const res = await routes(db, () => Promise.resolve(PROBED)).request(post('/api/imap/accounts', body))
      expect(res.status).toBe(201)
      const { account_id } = (await res.json()) as { account_id: number }

      const account = await db.selectFrom('accounts').selectAll().where('id', '=', account_id).executeTakeFirstOrThrow()
      expect(account.provider_type).toBe('imap')
      expect(parseImapSettings(account.settings_json).folders).toEqual(FOLDERS)
    })

    it('returns no password in any form (r-0kn0oida)', async () => {
      const secret = 'correct-horse-battery-staple'
      const res = await routes(db, () => Promise.resolve(PROBED)).request(
        post('/api/imap/accounts', { ...body, password: secret }),
      )
      const payload = JSON.stringify(await res.json())
      expect(payload).not.toContain(secret)
      expect(payload).not.toContain(Buffer.from(secret).toString('base64'))

      const account = await db.selectFrom('accounts').select('settings_json').executeTakeFirstOrThrow()
      expect(account.settings_json).not.toContain(secret)
    })

    it('refuses a folder the account does not have, and stores nothing (r-g1iwlbzs)', async () => {
      const res = await routes(db, () => Promise.resolve(PROBED)).request(
        post('/api/imap/accounts', { ...body, folders: { ...FOLDERS, archived: 'Nope' } }),
      )
      expect(res.status).toBe(400)
      expect(await db.selectFrom('accounts').selectAll().execute()).toEqual([])
    })

    it('refuses two roles naming one folder (d-zxvkt95o, d-oaaz2fwk)', async () => {
      const res = await routes(db, () => Promise.resolve(PROBED)).request(
        post('/api/imap/accounts', { ...body, folders: { ...FOLDERS, archived: 'INBOX' } }),
      )
      expect(res.status).toBe(400)
      expect(await db.selectFrom('accounts').selectAll().execute()).toEqual([])
    })

    it('stores nothing when the login is refused', async () => {
      const probe = () => Promise.reject(new ImapCredentialRejectedError('no'))
      const res = await routes(db, probe).request(post('/api/imap/accounts', body))
      expect(res.status).toBe(401)
      expect(await db.selectFrom('accounts').selectAll().execute()).toEqual([])
    })
  })

  describe('PUT /api/imap/accounts/:id/connection (d-r3ogwkv7)', () => {
    async function seedAccount(): Promise<number> {
      return createImapAccount(db, encryptor, {
        userId: 1,
        actorUserId: 1,
        name: 'work',
        settings: { ...CONNECTION, address: 'u@example.com', folders: FOLDERS },
        password: 'old',
      })
    }

    it('restates the connection and resumes polling', async () => {
      const id = await seedAccount()
      await db.updateTable('accounts').set({ paused_reason: 'credential_rejected' }).where('id', '=', id).execute()

      const res = await routes(db, () => Promise.resolve(PROBED)).request(
        new Request(`http://local/api/imap/accounts/${id}/connection`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...CONNECTION, host: 'mail2.example.com', password: 'new' }),
        }),
      )

      expect(res.status).toBe(200)
      const account = await db.selectFrom('accounts').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
      expect(account.paused_reason).toBeNull()
      expect(parseImapSettings(account.settings_json).host).toBe('mail2.example.com')
    })

    it('stores nothing when the restated login is refused', async () => {
      const id = await seedAccount()
      const probe = () => Promise.reject(new ImapCredentialRejectedError('no'))
      const res = await routes(db, probe).request(
        new Request(`http://local/api/imap/accounts/${id}/connection`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...CONNECTION, host: 'mail2.example.com', password: 'new' }),
        }),
      )

      expect(res.status).toBe(401)
      const account = await db.selectFrom('accounts').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
      expect(parseImapSettings(account.settings_json).host).toBe('mail.example.com')
    })
  })

  describe('PATCH /api/imap/accounts/:id/folders (d-8pdx8qsd)', () => {
    it('points a role at another folder', async () => {
      const id = await createImapAccount(db, encryptor, {
        userId: 1,
        actorUserId: 1,
        name: 'work',
        settings: { ...CONNECTION, address: 'u@example.com', folders: FOLDERS },
        password: 'p',
      })

      const res = await routes(db, () => Promise.resolve(PROBED)).request(
        new Request(`http://local/api/imap/accounts/${id}/folders`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ folders: { ...FOLDERS, archived: 'INBOX.Receipts' } }),
        }),
      )

      expect(res.status).toBe(200)
      const account = await db.selectFrom('accounts').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
      expect(parseImapSettings(account.settings_json).folders.archived).toBe('INBOX.Receipts')
    })
  })
})
