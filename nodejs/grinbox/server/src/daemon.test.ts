import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Daemon-level wiring of the live external clients:
 *  - the poll ProviderFactory is the live (credential-backed) one when OAuth is
 *    configured, and the null factory otherwise (unconfigured path unchanged);
 *  - boot is unchanged on the fully-unconfigured path (no OAuth, no bedrock
 *    region): `/healthz` still 200s and the daemon idles, then shuts down.
 *
 * `googleapis` is mocked so the OAuth-configured poll path never hits the
 * network; the OAuth token lifecycle uses the real token-store over a seeded
 * encrypted credential + the mocked `google.auth.OAuth2`.refreshAccessToken.
 */

const messagesList = vi.fn()
const messagesGet = vi.fn()
const getProfile = vi.fn()
const setCredentials = vi.fn()
const refreshAccessToken = vi.fn()

const gmailFactory = vi.fn(() => ({
  users: {
    getProfile,
    history: { list: vi.fn() },
    messages: { list: messagesList, get: messagesGet, modify: vi.fn() },
    threads: { get: vi.fn() },
  },
}))

class FakeOAuth2 {
  setCredentials = setCredentials
  refreshAccessToken = refreshAccessToken
  generateAuthUrl = () => 'https://consent'
  getToken = vi.fn()
}

vi.mock('googleapis', () => ({
  google: { gmail: gmailFactory, auth: { OAuth2: FakeOAuth2 } },
}))

const { startDaemon } = await import('./daemon.js')
const { makeEncryptor } = await import('./crypto/encryption.js')
const { storeGmailCredential } = await import('./oauth/token-store.js')
const { resolveActingUserId } = await import('./http/api/deps.js')

import type { Daemon } from './daemon.js'

/** A stable base64 key per test so the seeded credential and the daemon's
 * encryptor share one key (the daemon decodes this same value at boot). */
const ENC_KEY_B64 = randomBytes(32).toString('base64')

// A unique port per daemon in this run: config rejects port 0, so allocate
// distinct high ports from a per-process random base to avoid collisions.
let nextPort = 9100 + Math.floor(Math.random() * 400)
function pickPort(): number {
  return nextPort++
}

function baseEnv(port: number): NodeJS.ProcessEnv {
  return {
    GRINBOX_DB_PATH: ':memory:',
    GRINBOX_HTTP_PORT: String(port),
    GRINBOX_HTTP_HOST: '127.0.0.1',
    GRINBOX_TOKEN_ENC_KEY: ENC_KEY_B64,
  }
}

/** Resolve once the daemon's HTTP server has finished binding — `serve()` binds
 * asynchronously, so a test that drives the scheduler without first making a
 * request would otherwise reach `shutdown` before the socket is listening. */
async function waitListening(d: Daemon): Promise<void> {
  if (d.server.listening) {
    return
  }
  await new Promise<void>((resolve) => d.server.once('listening', resolve))
}

describe('startDaemon — live client wiring', () => {
  let daemon: Daemon | null = null

  beforeEach(() => {
    messagesList.mockReset()
    messagesGet.mockReset()
    getProfile.mockReset()
    setCredentials.mockReset()
    refreshAccessToken.mockReset()
    gmailFactory.mockClear()
  })
  afterEach(async () => {
    if (daemon) {
      await daemon.shutdown()
    }
    daemon = null
    vi.restoreAllMocks()
  })

  it('boots, serves /healthz, and idles cleanly with no OAuth and no bedrock region', async () => {
    const port = pickPort()
    daemon = await startDaemon(baseEnv(port))

    const res = await fetch(`http://127.0.0.1:${port}/healthz`)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ status: 'ok' })

    // Idle: a poll tick with no Accounts polls nothing and does not throw.
    const summaries = await daemon.pollScheduler.pollDueAccounts()
    expect(summaries).toEqual([])
  })

  it('bootstraps the single MVP User on a fresh DB so writes can resolve an acting user', async () => {
    daemon = await startDaemon(baseEnv(pickPort()))
    await waitListening(daemon)
    const { db } = daemon

    // A freshly-migrated DB had no users; startDaemon provisioned one.
    const users = await db.selectFrom('users').selectAll().execute()
    expect(users).toHaveLength(1)
    expect(users[0]?.name).toBe('Grinbox')

    // resolveActingUserId now succeeds (was null → writes 4xx pre-bootstrap),
    // and the User has its 6 default Limits seeded.
    const actingUserId = await resolveActingUserId(db)
    expect(actingUserId).toBe(users[0]?.id)
    const limits = await db
      .selectFrom('limits')
      .select((eb) => eb.fn.countAll<number>().as('n'))
      .executeTakeFirstOrThrow()
    expect(limits.n).toBe(6)
  })

  it('with OAuth unconfigured, the scheduler skips a credentialed Account (null factory)', async () => {
    daemon = await startDaemon(baseEnv(pickPort()))
    await waitListening(daemon)
    const { db } = daemon

    await seedCredentialedAccount(db)
    // The null factory returns null for the Account → it is skipped, so the
    // cycle returns no summaries and never touches googleapis.
    const summaries = await daemon.pollScheduler.pollDueAccounts(2_000_000_000)
    expect(summaries).toEqual([])
    expect(gmailFactory).not.toHaveBeenCalled()
  })

  it('with OAuth configured, the scheduler polls a credentialed Account via the live factory', async () => {
    daemon = await startDaemon({
      ...baseEnv(pickPort()),
      GRINBOX_OAUTH_CLIENT_ID: 'client-id',
      GRINBOX_OAUTH_CLIENT_SECRET: 'client-secret',
    })
    await waitListening(daemon)
    const { db } = daemon

    await seedCredentialedAccount(db)
    messagesList.mockResolvedValue({ data: { messages: [{ id: 'g1' }] } })
    getProfile.mockResolvedValue({ data: { historyId: 'H500' } })
    // The candidate fetch (getMessage) must return a valid payload so the upsert
    // records a new Message.
    messagesGet.mockResolvedValue({
      data: {
        id: 'g1',
        threadId: null,
        snippet: 'hi',
        internalDate: '1700000000000',
        payload: { headers: [{ name: 'Subject', value: 'Invoice' }] },
      },
    })

    const summaries = await daemon.pollScheduler.pollDueAccounts(2_000_000_000)

    // The live factory built a credential-backed GmailProvider, so the Account
    // was actually polled (one candidate discovered through mocked googleapis).
    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({ candidates: 1, newMessages: 1 })
    expect(gmailFactory).toHaveBeenCalled()
  })
})

/** Seed a user + active-pipeline Gmail Account with a fresh live credential.
 * The credential is encrypted with the same key the daemon decoded from
 * `GRINBOX_TOKEN_ENC_KEY`, so the live poll path can decrypt it. */
async function seedCredentialedAccount(db: Daemon['db']): Promise<{ accountId: number }> {
  const encryptor = makeEncryptor(Buffer.from(ENC_KEY_B64, 'base64'))

  const user = await db
    .insertInto('users')
    .values({ name: 'u', email: 'u@example.com', created_at: 1000 })
    .returning('id')
    .executeTakeFirstOrThrow()
  const pipeline = await db
    .insertInto('pipelines')
    .values({
      user_id: user.id,
      name: 'p',
      description: null,
      created_at: 1000,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const account = await db
    .insertInto('accounts')
    .values({
      user_id: user.id,
      name: 'a',
      provider_type: 'gmail',
      active_pipeline_id: pipeline.id,
      settings_json: JSON.stringify({ email: 'u@example.com' }),
      poll_interval_seconds: 600,
      last_polled_at: null,
      last_history_cursor: null,
      created_at: 1000,
    })
    .returning('id')
    .executeTakeFirstOrThrow()

  await storeGmailCredential(db, encryptor, {
    userId: user.id,
    accountId: account.id,
    actorUserId: null,
    payload: {
      refresh_token: 'refresh-1',
      access_token: 'access-fresh',
      access_token_expires_at: 4_000_000_000,
      scopes: 'scope-a',
    },
    now: 1000,
  })

  return { accountId: account.id }
}
