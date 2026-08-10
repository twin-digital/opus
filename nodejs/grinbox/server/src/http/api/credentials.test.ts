import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type DB, closeDatabase } from '../../db/index.js'
import type { CredentialSummary } from './credentials.js'
import { createApiRoutes } from './index.js'
import {
  fixedNow,
  freshDb,
  insertAccount,
  insertCredential,
  insertGmailCredential,
  insertUser,
} from './test-support.js'

describe('GET /api/credentials', () => {
  let db: DB
  beforeEach(async () => {
    db = await freshDb()
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('returns empty list with no credentials', async () => {
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/credentials')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ credentials: [] })
  })

  it('returns non-secret metadata for live credentials', async () => {
    const userId = await insertUser(db)
    const pushId = await insertCredential(db, userId, {
      kind: 'pushover',
      createdAt: 1234,
      updatedAt: 5678,
    })

    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/credentials')
    const { credentials } = (await res.json()) as {
      credentials: CredentialSummary[]
    }
    expect(credentials).toHaveLength(1)
    const cred = credentials[0]
    expect(cred).toEqual({
      id: pushId,
      kind: 'pushover',
      account_id: null,
      created_at: 1234,
      updated_at: 5678,
    })
  })

  it('never exposes the encrypted blob (data_enc absent)', async () => {
    const userId = await insertUser(db)
    await insertCredential(db, userId, {
      kind: 'pushover',
      dataEnc: Buffer.from('TOP-SECRET'),
    })

    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/credentials')
    const raw = await res.text()
    // No secret field on the wire, and the secret bytes never appear.
    expect(raw).not.toContain('data_enc')
    expect(raw).not.toContain('TOP-SECRET')

    const { credentials } = JSON.parse(raw) as {
      credentials: CredentialSummary[]
    }
    for (const cred of credentials) {
      expect('data_enc' in (cred as object)).toBe(false)
    }
  })

  it('passes through a non-null account_id (gmail_oauth row)', async () => {
    const userId = await insertUser(db)
    const acctId = await insertAccount(db, userId, {})
    const credId = await insertGmailCredential(db, userId, acctId)

    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/credentials?kind=gmail_oauth')
    const { credentials } = (await res.json()) as {
      credentials: CredentialSummary[]
    }
    expect(credentials).toHaveLength(1)
    expect(credentials[0]?.id).toBe(credId)
    expect(credentials[0]?.account_id).toBe(acctId)
  })

  it('honors the ?kind= filter', async () => {
    // A user-scoped (account-null) pushover credential is unique per (user,kind),
    // so use two users to get two live pushover credentials.
    const userA = await insertUser(db, 'a')
    const userB = await insertUser(db, 'b')
    await insertCredential(db, userA, { kind: 'pushover' })
    await insertCredential(db, userA, { kind: 'gmail_oauth' })
    await insertCredential(db, userB, { kind: 'pushover' })

    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/credentials?kind=pushover')
    const { credentials } = (await res.json()) as {
      credentials: CredentialSummary[]
    }
    expect(credentials).toHaveLength(2)
    expect(credentials.every((c) => c.kind === 'pushover')).toBe(true)
  })

  it('excludes soft-deleted credentials', async () => {
    const userId = await insertUser(db)
    const id = await insertCredential(db, userId, { kind: 'pushover' })
    await db.updateTable('credentials').set({ deleted_at: 2000 }).where('id', '=', id).execute()

    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/credentials')
    const { credentials } = (await res.json()) as {
      credentials: CredentialSummary[]
    }
    expect(credentials).toEqual([])
  })
})
