import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The credential-backed Action clients wired into the execution loop.
 *
 * Drives **Apply Category** and **Notify** runs end-to-end through `runWorker`
 * over the real per-run {@link buildMakeUnderlyingClients} builder, asserting:
 *  - apply_category resolves the Message's Account `gmail_oauth` credential and
 *    calls `messages.modify` with the resolved label **id** (label name → id via
 *    `labels.list` / `labels.create`);
 *  - notify resolves its `credentials_id` Pushover credential, decrypts it, and
 *    posts via `fetch` with the rendered message + decrypted creds;
 *  - the `resource_op_succeeded` event + `resource_usage_json` land;
 *  - no-credential paths fail the run gracefully (run `failed`, Triage `partial`,
 *    no crash);
 *  - the per-Message Notify Limit de-dupes a replay (`skipped_by_limit`).
 *
 * `googleapis` is mocked (no network): `google.gmail` exposes the labels +
 * messages.modify surface, `google.auth.OAuth2` is a no-op credential holder.
 * The Pushover transport is a fake `fetch`; the Google OAuth client is a stub
 * whose `refreshAccessToken` is never reached (the seeded token is fresh).
 */

// --- googleapis mock --------------------------------------------------------

const labelsList = vi.fn()
const labelsCreate = vi.fn()
const messagesModify = vi.fn()
const setCredentials = vi.fn()

const gmailFactory = vi.fn(() => ({
  users: {
    labels: { list: labelsList, create: labelsCreate },
    messages: { modify: messagesModify },
  },
}))

class FakeOAuth2 {
  setCredentials = setCredentials
}

vi.mock('googleapis', () => ({
  google: {
    gmail: gmailFactory,
    auth: { OAuth2: FakeOAuth2 },
  },
}))

const { buildMakeUnderlyingClients } = await import('./underlying-clients.js')
const { freshDb, seedBase } = await import('../pipeline/test-helpers.js')
const { seedDefaultLimits } = await import('../db/seed.js')
const { createOperator } = await import('../pipeline/operator-save.js')
const { enqueueTriage } = await import('../pipeline/triage-enqueue.js')
const { claimOperatorRun } = await import('../pipeline/claim.js')
const { runWorker } = await import('../execution/worker.js')
const { makeEncryptor } = await import('../crypto/encryption.js')
const { encryptTokenPayload, GMAIL_OAUTH_KIND } = await import('../oauth/token-store.js')
const { storePushoverCredential } = await import('../config/credential-store.js')

import type { Config } from '../config.js'
import type { Encryptor } from '../crypto/encryption.js'
import type { Database } from '../db/schema.js'
import type { WorkerRunRow } from '../execution/worker.js'
import type { GoogleOAuthClient } from '../oauth/google-client.js'

const encryptor: Encryptor = makeEncryptor(Buffer.alloc(32))

function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    dbPath: ':memory:',
    httpPort: 8787,
    httpHost: '127.0.0.1',
    tokenEncKey: Buffer.alloc(32),
    operatorTimeoutMs: 30_000,
    workerPoolSize: 3,
    ...overrides,
  } as Config
}

/** A Google OAuth client stub; refresh is never reached (token is fresh). */
function fakeGoogleClient(): GoogleOAuthClient {
  return {
    buildConsentUrl: () => 'unused',
    exchangeCode: async () => {
      throw new Error('unused')
    },
    fetchProfileEmail: async () => {
      throw new Error('unused')
    },
    refreshAccessToken: async () => {
      throw new Error('refresh should not be reached (token is fresh)')
    },
  }
}

/** Seed a fresh (non-expiring) gmail_oauth credential for an Account. */
async function seedGmailCredential(db: Kysely<Database>, userId: number, accountId: number): Promise<void> {
  const dataEnc = encryptTokenPayload(encryptor, {
    refresh_token: 'rt',
    access_token: 'fresh-access-token',
    access_token_expires_at: Math.floor(Date.now() / 1000) + 3600,
    scopes: 'https://www.googleapis.com/auth/gmail.modify',
  })
  await db
    .insertInto('credentials')
    .values({
      user_id: userId,
      account_id: accountId,
      kind: GMAIL_OAUTH_KIND,
      data_enc: dataEnc,
      created_at: 1000,
    })
    .execute()
}

/** A fake `fetch` returning a Pushover-style 200; records the last call. */
function fakePushoverFetch() {
  const calls: { url: string; body: string }[] = []
  const fetchMock = vi.fn(async (url: string, init: { body: string }) => {
    calls.push({ url, body: init.body })
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ status: 1, request: 'req-1' }),
    }
  })
  return { fetchMock, calls }
}

describe('credential-backed Action clients through the worker', () => {
  let db: Kysely<Database>
  let originalFetch: typeof globalThis.fetch

  beforeEach(async () => {
    labelsList.mockReset()
    labelsCreate.mockReset()
    messagesModify.mockReset()
    setCredentials.mockReset()
    gmailFactory.mockClear()
    originalFetch = globalThis.fetch
    db = await freshDb()
  })
  afterEach(async () => {
    globalThis.fetch = originalFetch
    await db.destroy()
    vi.restoreAllMocks()
  })

  async function claimRun(
    typeKey: 'apply_category' | 'notify',
    configJson: string,
    seed: { userId: number; pipelineId: number; messageId: number },
  ): Promise<WorkerRunRow> {
    const opId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: typeKey,
      typeKey,
      configJson,
      enabled: true,
      actorUserId: null,
    })
    const { triageId } = await enqueueTriage(db, {
      messageId: seed.messageId,
      pipelineId: seed.pipelineId,
      triggeredBy: 'message_arrival',
      actorUserId: null,
    })
    await claimOperatorRun(db, triageId, opId, 1500)
    return {
      triage_id: triageId,
      operator_id: opId,
      message_id: seed.messageId,
      type_key: typeKey,
      type_code_version: '1',
      op_config_json: configJson,
    }
  }

  it('apply_category fires against the Account gmail credential (name→id resolve + modify)', async () => {
    const seed = await seedBase(db)
    await seedDefaultLimits(db, seed.userId)
    await seedGmailCredential(db, seed.userId, seed.accountId)

    // Label does not exist yet → list miss, create returns its id, modify uses it.
    labelsList.mockResolvedValue({ data: { labels: [] } })
    labelsCreate.mockResolvedValue({ data: { id: 'Label_42' } })
    messagesModify.mockResolvedValue({ data: {} })

    const configJson = JSON.stringify({ category_template: 'Grinbox/Bills' })
    const row = await claimRun('apply_category', configJson, seed)

    const makeClients = buildMakeUnderlyingClients({
      db,
      encryptor,
      config: testConfig(),
      googleClient: fakeGoogleClient(),
    })
    await runWorker(db, row, makeClients, testConfig())

    // The label name was resolved/created to an id, then modify used the id.
    expect(labelsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ name: 'Grinbox/Bills' }),
      }),
      expect.anything(),
    )
    expect(messagesModify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'me',
        id: 'm1',
        requestBody: { addLabelIds: ['Label_42'] },
      }),
      expect.anything(),
    )

    const run = await db
      .selectFrom('triage_operator_runs')
      .selectAll()
      .where('triage_id', '=', row.triage_id)
      .where('operator_id', '=', row.operator_id)
      .executeTakeFirstOrThrow()
    expect(run.status).toBe('completed')

    // resource_op_succeeded event + usage landed for apply_label.
    const events = await db
      .selectFrom('triage_events')
      .selectAll()
      .where('triage_id', '=', row.triage_id)
      .where('event_type', '=', 'resource_op_succeeded')
      .execute()
    expect(events).toHaveLength(1)
    expect(JSON.parse(events[0]?.details_json as string)).toMatchObject({
      resource: 'gmail_api',
      operation: 'apply_label',
    })
    const usage = JSON.parse(run.resource_usage_json as string)
    expect(usage['gmail_api.apply_label']).toMatchObject({
      calls: 1,
      succeeded: 1,
    })
  })

  it('notify fires against its credentials_id Pushover credential (rendered msg + decrypted creds)', async () => {
    const seed = await seedBase(db)
    await seedDefaultLimits(db, seed.userId)
    const credId = await storePushoverCredential(db, encryptor, {
      userId: seed.userId,
      payload: { app_token: 'APPTOK', user_key: 'USERKEY' },
      actorUserId: null,
    })

    const { fetchMock, calls } = fakePushoverFetch()
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

    const configJson = JSON.stringify({
      message_template: 'hi from {{from}}',
      credentials_id: credId,
    })
    const row = await claimRun('notify', configJson, seed)

    const makeClients = buildMakeUnderlyingClients({
      db,
      encryptor,
      config: testConfig(),
      googleClient: fakeGoogleClient(),
    })
    await runWorker(db, row, makeClients, testConfig())

    expect(fetchMock).toHaveBeenCalledTimes(1)
    // The decrypted creds + rendered message hit the wire (form-encoded body).
    expect(calls[0]?.body).toContain('token=APPTOK')
    expect(calls[0]?.body).toContain('user=USERKEY')
    expect(calls[0]?.body).toContain('message=hi+from')

    const run = await db
      .selectFrom('triage_operator_runs')
      .selectAll()
      .where('triage_id', '=', row.triage_id)
      .where('operator_id', '=', row.operator_id)
      .executeTakeFirstOrThrow()
    expect(run.status).toBe('completed')

    const events = await db
      .selectFrom('triage_events')
      .selectAll()
      .where('triage_id', '=', row.triage_id)
      .where('event_type', '=', 'resource_op_succeeded')
      .execute()
    expect(events).toHaveLength(1)
    expect(JSON.parse(events[0]?.details_json as string)).toMatchObject({
      resource: 'pushover_api',
      operation: 'send_notification',
    })
  })

  it('apply_category on an Account with no live gmail credential fails the run gracefully', async () => {
    const seed = await seedBase(db)
    await seedDefaultLimits(db, seed.userId)
    // No gmail_oauth credential seeded.

    const configJson = JSON.stringify({ category_template: 'Grinbox/Bills' })
    const row = await claimRun('apply_category', configJson, seed)

    const makeClients = buildMakeUnderlyingClients({
      db,
      encryptor,
      config: testConfig(),
      googleClient: fakeGoogleClient(),
    })
    // Must not throw out of the worker — a graceful per-run failure.
    await runWorker(db, row, makeClients, testConfig())

    expect(messagesModify).not.toHaveBeenCalled()
    const run = await db
      .selectFrom('triage_operator_runs')
      .select(['status'])
      .where('triage_id', '=', row.triage_id)
      .where('operator_id', '=', row.operator_id)
      .executeTakeFirstOrThrow()
    expect(run.status).toBe('failed')
    const triage = await db
      .selectFrom('triages')
      .select(['status'])
      .where('id', '=', row.triage_id)
      .executeTakeFirstOrThrow()
    expect(triage.status).toBe('partial')
  })

  it('notify with a deleted credential fails the run gracefully', async () => {
    const seed = await seedBase(db)
    await seedDefaultLimits(db, seed.userId)
    const credId = await storePushoverCredential(db, encryptor, {
      userId: seed.userId,
      payload: { app_token: 'APPTOK', user_key: 'USERKEY' },
      actorUserId: null,
    })
    // Soft-delete it: the per-run resolver finds no live row → "not configured".
    await db.updateTable('credentials').set({ deleted_at: 2000 }).where('id', '=', credId).execute()

    const { fetchMock } = fakePushoverFetch()
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

    const configJson = JSON.stringify({
      message_template: 'hi',
      credentials_id: credId,
    })
    const row = await claimRun('notify', configJson, seed)

    const makeClients = buildMakeUnderlyingClients({
      db,
      encryptor,
      config: testConfig(),
      googleClient: fakeGoogleClient(),
    })
    await runWorker(db, row, makeClients, testConfig())

    expect(fetchMock).not.toHaveBeenCalled()
    const run = await db
      .selectFrom('triage_operator_runs')
      .select(['status'])
      .where('triage_id', '=', row.triage_id)
      .where('operator_id', '=', row.operator_id)
      .executeTakeFirstOrThrow()
    expect(run.status).toBe('failed')
  })

  it('unconfigured daemon (no OAuth client) → gmail apply_label is "not configured"', async () => {
    const seed = await seedBase(db)
    await seedDefaultLimits(db, seed.userId)
    await seedGmailCredential(db, seed.userId, seed.accountId)

    // googleClient: null mirrors a daemon booted without OAuth client config.
    const makeClients = buildMakeUnderlyingClients({
      db,
      encryptor,
      config: testConfig(),
      googleClient: null,
    })
    const clients = makeClients({
      accountId: seed.accountId,
      notifyCredentialsId: null,
    })
    await expect(
      clients.gmail_api.apply_label({ backendMessageId: 'm1', label: 'L' }, new AbortController().signal),
    ).rejects.toThrow(/no Resource client is configured/i)
    // Even with a seeded credential present, no OAuth client means no resolve.
    expect(messagesModify).not.toHaveBeenCalled()

    // And with no notify credential the pushover op is "not configured" too.
    await expect(
      clients.pushover_api.send_notification({ message: 'hi' }, new AbortController().signal),
    ).rejects.toThrow(/no Resource client is configured/i)
  })

  it('the per-Message Notify Limit de-dupes a replayed Triage (skipped_by_limit)', async () => {
    const seed = await seedBase(db)
    await seedDefaultLimits(db, seed.userId)
    const credId = await storePushoverCredential(db, encryptor, {
      userId: seed.userId,
      payload: { app_token: 'APPTOK', user_key: 'USERKEY' },
      actorUserId: null,
    })

    const { fetchMock } = fakePushoverFetch()
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch

    const configJson = JSON.stringify({
      message_template: 'hi',
      credentials_id: credId,
    })
    const makeClients = buildMakeUnderlyingClients({
      db,
      encryptor,
      config: testConfig(),
      googleClient: fakeGoogleClient(),
    })

    // One Notify Operator; two Triages over the SAME Message (a replay).
    const opId = await createOperator(db, {
      pipelineId: seed.pipelineId,
      name: 'notify',
      typeKey: 'notify',
      configJson,
      enabled: true,
      actorUserId: null,
    })
    const runFor = async (): Promise<WorkerRunRow> => {
      const { triageId } = await enqueueTriage(db, {
        messageId: seed.messageId,
        pipelineId: seed.pipelineId,
        triggeredBy: 'message_arrival',
        actorUserId: null,
      })
      await claimOperatorRun(db, triageId, opId, 1500)
      return {
        triage_id: triageId,
        operator_id: opId,
        message_id: seed.messageId,
        type_key: 'notify',
        type_code_version: '1',
        op_config_json: configJson,
      }
    }

    // First notify: fires (sends once).
    const first = await runFor()
    await runWorker(db, first, makeClients, testConfig())
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Replay: a second Triage over the same Message. The per-Message Limit
    // (max 1) denies → skipped_by_limit, a clean no-op (run completes, no send).
    const second = await runFor()
    await runWorker(db, second, makeClients, testConfig())
    expect(fetchMock).toHaveBeenCalledTimes(1) // still once — deduped

    const run = await db
      .selectFrom('triage_operator_runs')
      .select(['status'])
      .where('triage_id', '=', second.triage_id)
      .where('operator_id', '=', second.operator_id)
      .executeTakeFirstOrThrow()
    expect(run.status).toBe('completed')

    const limited = await db
      .selectFrom('triage_events')
      .selectAll()
      .where('triage_id', '=', second.triage_id)
      .where('event_type', '=', 'resource_op_limited')
      .execute()
    expect(limited).toHaveLength(1)
  })
})
