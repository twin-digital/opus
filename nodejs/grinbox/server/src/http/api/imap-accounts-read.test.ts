import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createImapAccount } from '../../config/imap-account.js'
import { makeEncryptor } from '../../crypto/encryption.js'
import { type DB, closeDatabase } from '../../db/index.js'
import { capabilitiesFrom, serializeCapabilities } from '../../providers/account-capabilities.js'
import type { AccountSummary } from './accounts.js'
import { createApiRoutes } from './index.js'
import { fixedNow, freshDb, insertUser } from './test-support.js'

const encryptor = makeEncryptor(Buffer.alloc(32, 5))

const CONNECTION = { host: 'mail.example.com', port: 993, security: 'tls' as const, username: 'user@example.com' }
const FOLDERS = { arrival: 'INBOX', archived: 'Archive', trashed: 'Trash', spam: 'Junk' }

describe('the account read surface for an IMAP account', () => {
  let db: DB
  let accountId: number

  beforeEach(async () => {
    db = await freshDb()
    await insertUser(db)
    accountId = await createImapAccount(db, encryptor, {
      userId: 1,
      actorUserId: 1,
      name: 'work',
      settings: { ...CONNECTION, folders: FOLDERS },
      password: 'the-secret',
    })
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  async function read(): Promise<AccountSummary> {
    const res = await createApiRoutes({ db, now: fixedNow }).request(`/api/accounts/${accountId}`)
    expect(res.status).toBe(200)
    return ((await res.json()) as { account: AccountSummary }).account
  }

  it('shows the stored connection and folders, and no password (r-0kn0oida, d-r3ogwkv7)', async () => {
    const account = await read()

    expect(account.imap).toEqual({
      host: 'mail.example.com',
      port: 993,
      security: 'tls',
      username: 'user@example.com',
      folders: FOLDERS,
    })
    expect(JSON.stringify(account)).not.toContain('the-secret')
  })

  it('carries what the account can carry, with a reason for each gap (d-5h66e3zl, d-qzxvoph1)', async () => {
    const declared = capabilitiesFrom(
      ['apply_category'],
      { archive: 'no safe move', file: 'no safe move', send_message: 'an IMAP account does not send' },
      4000,
    )
    await db
      .updateTable('accounts')
      .set({ capabilities_json: serializeCapabilities(declared) })
      .where('id', '=', accountId)
      .execute()

    const account = await read()
    expect(account.capabilities?.supported).toEqual(['apply_category'])
    expect(account.capabilities?.unsupported).toEqual({
      archive: 'no safe move',
      file: 'no safe move',
      send_message: 'an IMAP account does not send',
    })
    expect(account.capabilities?.read_at).toBe(4000)
  })

  it('carries no declaration for an account that has never polled', async () => {
    expect((await read()).capabilities).toBeNull()
  })

  it('reads as paused, with the reason, once the server refused the password (d-v4mejzw5, d-hinqfmdf)', async () => {
    await db.updateTable('accounts').set({ paused_reason: 'credential_rejected' }).where('id', '=', accountId).execute()

    const account = await read()
    expect(account.status).toBe('paused')
    expect(account.paused_reason).toBe('credential_rejected')
  })

  it("reads as ok on the strength of its own credential kind, not gmail's (d-hinqfmdf)", async () => {
    const pipeline = await db
      .insertInto('pipelines')
      .values({ user_id: 1, name: 'p', description: null, created_at: 0 })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.updateTable('accounts').set({ active_pipeline_id: pipeline.id }).where('id', '=', accountId).execute()

    expect((await read()).status).toBe('ok')
  })

  it('reads as needing auth once its password is gone', async () => {
    await db.updateTable('credentials').set({ deleted_at: 1 }).where('account_id', '=', accountId).execute()
    expect((await read()).status).toBe('needs_auth')
  })

  it('carries no imap block on an account of another backend', async () => {
    const gmail = await db
      .insertInto('accounts')
      .values({
        user_id: 1,
        name: 'g',
        icon: null,
        color: null,
        provider_type: 'gmail',
        active_pipeline_id: null,
        settings_json: JSON.stringify({ email: 'g@example.com' }),
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

    const res = await createApiRoutes({ db, now: fixedNow }).request(`/api/accounts/${gmail.id}`)
    expect(((await res.json()) as { account: AccountSummary }).account.imap).toBeNull()
  })
})

describe('GET /api/accounts/:id/folders (r-e40s6olu)', () => {
  let db: DB
  beforeEach(async () => {
    db = await freshDb()
    await insertUser(db)
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('offers the folders the account has, named verbatim (d-k8va629q)', async () => {
    const id = await createImapAccount(db, encryptor, {
      userId: 1,
      actorUserId: 1,
      name: 'work',
      settings: { ...CONNECTION, folders: FOLDERS },
      password: 'p',
    })
    const folders = [
      { name: 'INBOX', proposed_role: 'arrival' as const },
      { name: 'INBOX.Receipts', proposed_role: null },
    ]
    const routes = createApiRoutes({ db, now: fixedNow, accountFolders: () => Promise.resolve(folders) })

    const res = await routes.request(`/api/accounts/${id}/folders`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ folders })
  })

  it('reports a 404 for an account that does not exist', async () => {
    const routes = createApiRoutes({ db, now: fixedNow, accountFolders: () => Promise.resolve([]) })
    expect((await routes.request('/api/accounts/999/folders')).status).toBe(404)
  })

  it('says so plainly when the deployment cannot look', async () => {
    const res = await createApiRoutes({ db, now: fixedNow }).request('/api/accounts/1/folders')
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ error: { code: 'folders_unavailable' } })
  })
})
