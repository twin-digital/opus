import { randomBytes } from 'node:crypto'
import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * {@link createLiveProviderFactory}: maps a credentialed Gmail Account to a
 * pollable {@link GmailProvider}, returns `null` for a non-Gmail Account, and
 * realizes the needs-reauth / no-credential skip lazily on the first Gmail call
 * (the synchronous seam can't await the credential check — see the factory's
 * module header).
 *
 * `googleapis` is mocked so the live client never hits the network; the OAuth
 * token lifecycle uses the *real* `resolveGmailAccessToken` over a seeded
 * encrypted credential + a fake {@link GoogleOAuthClient}, so this test also
 * proves the factory → live client → token-store wiring composes end to end.
 */

// --- googleapis mock --------------------------------------------------------

const messagesList = vi.fn()
const getProfile = vi.fn()
const setCredentials = vi.fn()

const gmailFactory = vi.fn(() => ({
  users: {
    getProfile,
    history: { list: vi.fn() },
    messages: { list: messagesList, get: vi.fn(), modify: vi.fn() },
    threads: { get: vi.fn() },
  },
}))

class FakeOAuth2 {
  setCredentials = setCredentials
}

vi.mock('googleapis', () => ({
  google: { gmail: gmailFactory, auth: { OAuth2: FakeOAuth2 } },
}))

const { createLiveProviderFactory } = await import('./live-provider-factory.js')
const { openDatabase } = await import('../db/connection.js')
const { runMigrations } = await import('../db/migrator.js')
const { makeEncryptor } = await import('../crypto/encryption.js')
const { storeGmailCredential, NeedsReauthError } = await import('../oauth/token-store.js')
const { makeFakeGoogleClient } = await import('../oauth/test-support.js')

import type { Database } from '../db/schema.js'
import type { PollableAccount } from './poll-cycle.js'

const encryptor = makeEncryptor(randomBytes(32))

async function freshDb(): Promise<Kysely<Database>> {
  const db = openDatabase(':memory:')
  await runMigrations(db)
  return db
}

async function seedUser(db: Kysely<Database>): Promise<number> {
  const u = await db
    .insertInto('users')
    .values({ name: 'u', email: 'u@example.com', created_at: 1000 })
    .returning('id')
    .executeTakeFirstOrThrow()
  return u.id
}

async function seedAccount(db: Kysely<Database>, userId: number, providerType: string): Promise<number> {
  const a = await db
    .insertInto('accounts')
    .values({
      user_id: userId,
      name: 'a',
      provider_type: providerType,
      active_pipeline_id: null,
      settings_json: JSON.stringify({ email: 'u@example.com' }),
      created_at: 1000,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return a.id
}

function pollable(id: number, providerType: string): PollableAccount {
  return {
    id,
    providerType,
    activePipelineId: 1,
    settingsJson: JSON.stringify({ email: 'u@example.com' }),
    lastHistoryCursor: null,
    lastPolledAt: null,
    lastReconciledAt: null,
  }
}

/** A live credential whose access token is comfortably fresh (no refresh). */
async function seedFreshCredential(db: Kysely<Database>, userId: number, accountId: number): Promise<void> {
  await storeGmailCredential(db, encryptor, {
    userId,
    accountId,
    actorUserId: null,
    payload: {
      refresh_token: 'refresh-1',
      access_token: 'access-fresh',
      // Far in the future relative to the real wall clock so the live client's
      // per-call resolve returns the cached token without a refresh.
      access_token_expires_at: 4_000_000_000,
      scopes: 'scope-a',
    },
    now: 1000,
  })
}

describe('createLiveProviderFactory', () => {
  beforeEach(() => {
    messagesList.mockReset()
    getProfile.mockReset()
    setCredentials.mockReset()
    gmailFactory.mockClear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a GmailProvider that polls a credentialed Gmail Account', async () => {
    const db = await freshDb()
    const userId = await seedUser(db)
    const accountId = await seedAccount(db, userId, 'gmail')
    await seedFreshCredential(db, userId, accountId)

    messagesList.mockResolvedValue({ data: { messages: [{ id: 'g1' }] } })
    getProfile.mockResolvedValue({ data: { historyId: 'H100' } })

    const factory = createLiveProviderFactory({
      db,
      encryptor,
      googleClient: makeFakeGoogleClient(),
    })
    const provider = factory(pollable(accountId, 'gmail'))
    expect(provider).not.toBeNull()

    // First sync: query-based list + latest historyId, driven through the mocked
    // googleapis with the credential's fresh access token.
    const listing = await provider?.listCandidates({ id: accountId, settingsJson: '{}', lastPolledAt: null }, null)
    expect(listing).toEqual({ backendMessageIds: ['g1'], newCursor: 'H100' })
    expect(setCredentials).toHaveBeenCalledWith({
      access_token: 'access-fresh',
    })
    await db.destroy()
  })

  it('returns null for a non-Gmail provider_type', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const db = await freshDb()
    const factory = createLiveProviderFactory({
      db,
      encryptor,
      googleClient: makeFakeGoogleClient(),
    })
    expect(factory(pollable(1, 'imap'))).toBeNull()
    await db.destroy()
  })

  it('returns a Provider that throws NeedsReauthError on the first call (lazy skip)', async () => {
    const db = await freshDb()
    const userId = await seedUser(db)
    const accountId = await seedAccount(db, userId, 'gmail')
    // A credential whose access token is expired → resolve refreshes → the fake
    // Google client reports invalid_grant → NeedsReauthError + credential
    // soft-deleted (the needs-reauth state).
    await storeGmailCredential(db, encryptor, {
      userId,
      accountId,
      actorUserId: null,
      payload: {
        refresh_token: 'refresh-1',
        access_token: 'access-old',
        access_token_expires_at: 0,
        scopes: 'scope-a',
      },
      now: 1000,
    })

    const factory = createLiveProviderFactory({
      db,
      encryptor,
      googleClient: makeFakeGoogleClient({ refresh: 'invalid_grant' }),
    })
    const provider = factory(pollable(accountId, 'gmail'))
    expect(provider).not.toBeNull()

    await expect(
      provider?.listCandidates({ id: accountId, settingsJson: '{}', lastPolledAt: null }, null),
    ).rejects.toBeInstanceOf(NeedsReauthError)

    // The credential is now soft-deleted: the Account stays in the needs-auth
    // state until re-authorized.
    const live = await db
      .selectFrom('credentials')
      .select('id')
      .where('account_id', '=', accountId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    expect(live).toBeUndefined()
    await db.destroy()
  })

  it('returns a Provider that throws NoGmailCredentialError when no credential exists', async () => {
    const db = await freshDb()
    const userId = await seedUser(db)
    const accountId = await seedAccount(db, userId, 'gmail')
    // No credential seeded.

    const factory = createLiveProviderFactory({
      db,
      encryptor,
      googleClient: makeFakeGoogleClient(),
    })
    const provider = factory(pollable(accountId, 'gmail'))
    const { NoGmailCredentialError } = await import('../oauth/token-store.js')
    await expect(
      provider?.listCandidates({ id: accountId, settingsJson: '{}', lastPolledAt: null }, null),
    ).rejects.toBeInstanceOf(NoGmailCredentialError)
    await db.destroy()
  })
})
