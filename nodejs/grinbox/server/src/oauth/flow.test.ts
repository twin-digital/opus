import { describe, expect, it } from 'vitest'
import {
  AccountNotFoundError,
  DEFAULT_USER_ID,
  InvalidStateError,
  completeAuthorization,
  startAuthorization,
} from './flow.js'
import { GMAIL_SCOPES, MissingRefreshTokenError } from './google-client.js'
import { createPendingAuthStore } from './pending-auth.js'
import { freshDbWithUser, makeFakeGoogleClient, testEncryptor } from './test-support.js'
import { decryptTokenPayload } from './token-store.js'

describe('startAuthorization', () => {
  it('builds a consent URL with all mandatory params and persists pending-auth', () => {
    const store = createPendingAuthStore()
    const google = makeFakeGoogleClient()

    const { consentUrl, state } = startAuthorization(store, google)

    const url = new URL(consentUrl)
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('scope')).toBe(GMAIL_SCOPES.join(' '))
    expect(url.searchParams.get('state')).toBe(state)
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')

    // Pending-auth persisted and consumable by that state.
    expect(store.size()).toBe(1)
    const pending = store.consume(state)
    expect(pending?.pkceVerifier).toBeTruthy()
    expect(pending?.accountId).toBeUndefined()
  })

  it('binds an accountId for re-auth', () => {
    const store = createPendingAuthStore()
    const google = makeFakeGoogleClient()
    const { state } = startAuthorization(store, google, { accountId: 42 })
    expect(store.consume(state)?.accountId).toBe(42)
  })
})

describe('completeAuthorization', () => {
  it('exchanges, fetches email, upserts account, stores credential, logs metadata-only', async () => {
    const { db } = await freshDbWithUser()
    const encryptor = testEncryptor()
    const store = createPendingAuthStore()
    const google = makeFakeGoogleClient({ email: 'me@example.com' })

    const { state } = startAuthorization(store, google)
    const result = await completeAuthorization(db, encryptor, store, google, {
      state,
      code: 'auth-code',
      now: 5000,
    })

    expect(result.email).toBe('me@example.com')

    // Account upserted with provider + email settings.
    const account = await db
      .selectFrom('accounts')
      .selectAll()
      .where('id', '=', result.accountId)
      .executeTakeFirstOrThrow()
    expect(account.provider_type).toBe('gmail')
    expect(JSON.parse(account.settings_json)).toEqual({
      email: 'me@example.com',
    })

    // Credential stored; payload decrypts back to the exchanged tokens.
    const cred = await db
      .selectFrom('credentials')
      .selectAll()
      .where('id', '=', result.credentialId)
      .executeTakeFirstOrThrow()
    expect(cred.kind).toBe('gmail_oauth')
    expect(cred.account_id).toBe(result.accountId)
    expect(cred.deleted_at).toBeNull()
    const payload = decryptTokenPayload(encryptor, cred.data_enc)
    expect(payload).toEqual({
      refresh_token: 'refresh-abc',
      access_token: 'access-xyz',
      access_token_expires_at: 5000 + 3600,
      scopes: GMAIL_SCOPES.join(' '),
    })

    // change_log: created, with NO data_enc / token material in the snapshots.
    const log = await db
      .selectFrom('change_log')
      .selectAll()
      .where('entity_type', '=', 'credential')
      .executeTakeFirstOrThrow()
    const after = log.after_json ?? ''
    expect(after).not.toContain('refresh-abc')
    expect(after).not.toContain('access-xyz')
    expect(JSON.parse(after)).toMatchObject({
      kind: 'gmail_oauth',
      account_id: result.accountId,
    })
    expect(log.user_id).toBe(DEFAULT_USER_ID)

    // State was single-use: consuming it again is gone.
    expect(store.consume(state)).toBeUndefined()
  })

  it('rejects an unknown / already-consumed state', async () => {
    const { db } = await freshDbWithUser()
    const encryptor = testEncryptor()
    const store = createPendingAuthStore()
    const google = makeFakeGoogleClient()

    await expect(
      completeAuthorization(db, encryptor, store, google, {
        state: 'never-issued',
        code: 'c',
      }),
    ).rejects.toBeInstanceOf(InvalidStateError)
  })

  it('rejects an expired state', async () => {
    const { db } = await freshDbWithUser()
    const encryptor = testEncryptor()
    let clock = 0
    const store = createPendingAuthStore({ ttlMs: 1000, now: () => clock })
    const google = makeFakeGoogleClient()
    const { state } = startAuthorization(store, google)

    clock = 2000
    await expect(completeAuthorization(db, encryptor, store, google, { state, code: 'c' })).rejects.toBeInstanceOf(
      InvalidStateError,
    )
  })

  it('surfaces a retryable error and stores nothing when no refresh token returned', async () => {
    const { db } = await freshDbWithUser()
    const encryptor = testEncryptor()
    const store = createPendingAuthStore()
    const google = makeFakeGoogleClient({ omitRefreshToken: true })

    const { state } = startAuthorization(store, google)
    await expect(completeAuthorization(db, encryptor, store, google, { state, code: 'c' })).rejects.toBeInstanceOf(
      MissingRefreshTokenError,
    )

    // No credential and no account were created.
    const creds = await db.selectFrom('credentials').selectAll().execute()
    expect(creds).toHaveLength(0)
  })

  it('throws AccountNotFoundError when re-auth binds to a missing account', async () => {
    const { db } = await freshDbWithUser()
    const encryptor = testEncryptor()
    const store = createPendingAuthStore()
    const google = makeFakeGoogleClient()

    const { state } = startAuthorization(store, google, { accountId: 999 })
    await expect(completeAuthorization(db, encryptor, store, google, { state, code: 'c' })).rejects.toBeInstanceOf(
      AccountNotFoundError,
    )
  })

  it('correlates the stored PKCE verifier through to exchangeCode (a constant verifier would not pass)', async () => {
    const { db } = await freshDbWithUser()
    const encryptor = testEncryptor()
    const store = createPendingAuthStore()
    const google = makeFakeGoogleClient()

    // Capture the verifier the store persisted at /start, then assert the very
    // same value reached exchangeCode — proving the per-flow verifier is replayed
    // (not a constant). Peek without consuming so the flow can consume it.
    const { state } = startAuthorization(store, google)
    const peeked = store.consume(state)
    const storedVerifier = peeked?.pkceVerifier
    expect(storedVerifier).toBeTruthy()
    // Re-seed the same state→verifier so completeAuthorization can consume it.
    store.put(state, { pkceVerifier: storedVerifier as string })

    await completeAuthorization(db, encryptor, store, google, {
      state,
      code: 'auth-code',
      now: 5000,
    })

    expect(google.calls.exchange).toHaveLength(1)
    expect(google.calls.exchange[0]?.codeVerifier).toBe(storedVerifier)
  })

  it('two concurrent flows each replay their own verifier (no cross-flow leakage)', async () => {
    const { db } = await freshDbWithUser()
    const encryptor = testEncryptor()
    const store = createPendingAuthStore()
    const google = makeFakeGoogleClient()

    const a = startAuthorization(store, google)
    const b = startAuthorization(store, google)
    const verifierA = store.consume(a.state)?.pkceVerifier
    const verifierB = store.consume(b.state)?.pkceVerifier
    expect(verifierA).not.toBe(verifierB)
    store.put(a.state, { pkceVerifier: verifierA as string })
    store.put(b.state, { pkceVerifier: verifierB as string })

    await completeAuthorization(db, encryptor, store, google, {
      state: a.state,
      code: 'code-a',
      now: 5000,
    })
    await completeAuthorization(db, encryptor, store, google, {
      state: b.state,
      code: 'code-b',
      now: 5000,
    })

    // Each exchange got the verifier minted for its own state.
    expect(google.calls.exchange).toEqual([
      { code: 'code-a', codeVerifier: verifierA },
      { code: 'code-b', codeVerifier: verifierB },
    ])
  })

  it('a new-account flow whose email matches a live Account returns that Account id (dedupe / merge, no duplicate)', async () => {
    const { db } = await freshDbWithUser()
    const encryptor = testEncryptor()
    const store = createPendingAuthStore()
    const google = makeFakeGoogleClient({ email: 'dup@example.com' })

    // First new-account flow creates the Account.
    const first = await completeAuthorization(db, encryptor, store, google, {
      state: startAuthorization(store, google).state,
      code: 'c1',
      now: 1000,
    })

    // Second new-account flow (no accountId bound) for the same mailbox email
    // merges onto the existing Account rather than creating a duplicate.
    const second = await completeAuthorization(db, encryptor, store, google, {
      state: startAuthorization(store, google).state,
      code: 'c2',
      now: 2000,
    })

    expect(second.accountId).toBe(first.accountId)
    const accounts = await db
      .selectFrom('accounts')
      .selectAll()
      .where('provider_type', '=', 'gmail')
      .where('deleted_at', 'is', null)
      .execute()
    expect(accounts).toHaveLength(1)
  })

  it('re-auth bound to an account soft-deletes the prior credential, leaving exactly one live', async () => {
    const { db } = await freshDbWithUser()
    const encryptor = testEncryptor()
    const store = createPendingAuthStore()
    const google = makeFakeGoogleClient({ email: 'me@example.com' })

    // First authorization → creates the Account + first credential.
    const first = await completeAuthorization(db, encryptor, store, google, {
      state: startAuthorization(store, google).state,
      code: 'c1',
      now: 1000,
    })

    // Re-auth bound to that Account.
    const second = await completeAuthorization(db, encryptor, store, google, {
      state: startAuthorization(store, google, { accountId: first.accountId }).state,
      code: 'c2',
      now: 2000,
    })
    expect(second.accountId).toBe(first.accountId)
    expect(second.credentialId).not.toBe(first.credentialId)

    // Exactly one live gmail_oauth credential for the account; prior soft-deleted.
    const live = await db
      .selectFrom('credentials')
      .selectAll()
      .where('account_id', '=', first.accountId)
      .where('kind', '=', 'gmail_oauth')
      .where('deleted_at', 'is', null)
      .execute()
    expect(live).toHaveLength(1)
    expect(live.at(0)?.id).toBe(second.credentialId)

    const prior = await db
      .selectFrom('credentials')
      .selectAll()
      .where('id', '=', first.credentialId)
      .executeTakeFirstOrThrow()
    expect(prior.deleted_at).not.toBeNull()
  })
})
