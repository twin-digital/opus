import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TOKEN_ENC_KEY_ENV, loadConfig } from '../../config.js'
import { makeEncryptor } from '../../crypto/encryption.js'
import { type DB, closeDatabase } from '../../db/index.js'
import { version } from '../../version.js'
import { createApp } from '../app.js'
import { createApiRoutes } from './index.js'
import { fixedNow, freshDb, insertAccount, insertGmailCredential, insertPipeline, insertUser } from './test-support.js'

describe('GET /api/accounts', () => {
  let db: DB
  beforeEach(async () => {
    db = await freshDb()
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('returns empty list when no accounts exist', async () => {
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/accounts')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ accounts: [] })
  })

  it('derives ok / no_pipeline / needs_auth statuses', async () => {
    const userId = await insertUser(db)
    const pipelineId = await insertPipeline(db, userId, 'pipe')

    // ok: has pipeline + live oauth credential
    const okId = await insertAccount(db, userId, {
      name: 'ok-acct',
      activePipelineId: pipelineId,
      lastPolledAt: 1234,
    })
    await insertGmailCredential(db, userId, okId)

    // no_pipeline: credential present, no active pipeline
    const noPipeId = await insertAccount(db, userId, {
      name: 'nopipe-acct',
      activePipelineId: null,
    })
    await insertGmailCredential(db, userId, noPipeId)

    // needs_auth: pipeline assigned but no credential
    await insertAccount(db, userId, {
      name: 'noauth-acct',
      activePipelineId: pipelineId,
    })

    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/accounts')
    const body = (await res.json()) as {
      accounts: {
        name: string
        status: string
        active_pipeline_name: string | null
      }[]
    }
    const byName = new Map(body.accounts.map((a) => [a.name, a]))
    expect(byName.get('ok-acct')?.status).toBe('ok')
    expect(byName.get('ok-acct')?.active_pipeline_name).toBe('pipe')
    expect(byName.get('nopipe-acct')?.status).toBe('no_pipeline')
    expect(byName.get('noauth-acct')?.status).toBe('needs_auth')
  })

  it('prefers needs_auth over no_pipeline when both apply', async () => {
    // No credential AND no active pipeline: needs_auth must win.
    const userId = await insertUser(db)
    await insertAccount(db, userId, {
      name: 'both-missing',
      activePipelineId: null,
    })
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/accounts')
    const body = (await res.json()) as { accounts: { status: string }[] }
    expect(body.accounts[0]?.status).toBe('needs_auth')
  })

  it('treats a soft-deleted credential as needs_auth', async () => {
    const userId = await insertUser(db)
    const pipelineId = await insertPipeline(db, userId)
    const acctId = await insertAccount(db, userId, {
      activePipelineId: pipelineId,
    })
    const credId = await insertGmailCredential(db, userId, acctId)
    await db.updateTable('credentials').set({ deleted_at: 2000 }).where('id', '=', credId).execute()

    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/accounts')
    const body = (await res.json()) as { accounts: { status: string }[] }
    expect(body.accounts[0]?.status).toBe('needs_auth')
  })

  it('excludes soft-deleted accounts', async () => {
    const userId = await insertUser(db)
    const acctId = await insertAccount(db, userId)
    await db.updateTable('accounts').set({ deleted_at: 2000 }).where('id', '=', acctId).execute()
    const app = createApiRoutes({ db, now: fixedNow })
    const res = await app.request('/api/accounts')
    expect(await res.json()).toEqual({ accounts: [] })
  })

  it('GET /api/accounts/:id returns detail or 404', async () => {
    const userId = await insertUser(db)
    const pipelineId = await insertPipeline(db, userId, 'pipe')
    const acctId = await insertAccount(db, userId, {
      name: 'detail',
      activePipelineId: pipelineId,
    })
    await insertGmailCredential(db, userId, acctId)
    const app = createApiRoutes({ db, now: fixedNow })

    const ok = await app.request(`/api/accounts/${acctId}`)
    expect(ok.status).toBe(200)
    const body = (await ok.json()) as {
      account: { id: number; status: string }
    }
    expect(body.account.id).toBe(acctId)
    expect(body.account.status).toBe('ok')

    const missing = await app.request('/api/accounts/9999')
    expect(missing.status).toBe(404)

    const bad = await app.request('/api/accounts/not-a-number')
    expect(bad.status).toBe(400)
  })
})

describe('createApp mounts /api alongside /healthz and /oauth', () => {
  let db: DB
  beforeEach(async () => {
    db = await freshDb()
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  it('serves /healthz and /api/accounts from one app', async () => {
    const config = loadConfig({
      [TOKEN_ENC_KEY_ENV]: randomBytes(32).toString('base64'),
    })
    const encryptor = makeEncryptor(config.tokenEncKey)
    const app = createApp({ db, config, encryptor, version, now: fixedNow })

    const health = await app.request('/healthz')
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ status: 'ok', version })

    const accounts = await app.request('/api/accounts')
    expect(accounts.status).toBe(200)
    expect(await accounts.json()).toEqual({ accounts: [] })
  })
})
