import { describe, expect, it } from 'vitest'
import { InvalidGrantError } from './google-client.js'
import { type FakeGoogleClient, freshDbWithUser, makeFakeGoogleClient, testEncryptor } from './test-support.js'
import {
  ACCESS_TOKEN_REFRESH_SKEW_SECONDS,
  type GmailTokenPayload,
  NeedsReauthError,
  NoGmailCredentialError,
  decryptTokenPayload,
  encryptTokenPayload,
  resolveGmailAccessToken,
  storeGmailCredential,
} from './token-store.js'

async function seedAccount(db: Awaited<ReturnType<typeof freshDbWithUser>>['db'], userId: number): Promise<number> {
  const acct = await db
    .insertInto('accounts')
    .values({
      user_id: userId,
      name: 'a',
      provider_type: 'gmail',
      active_pipeline_id: null,
      settings_json: JSON.stringify({ email: 'a@example.com' }),
      created_at: 1000,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return acct.id
}

function payload(expiresAt: number): GmailTokenPayload {
  return {
    refresh_token: 'refresh-1',
    access_token: 'access-1',
    access_token_expires_at: expiresAt,
    scopes: 'scope-a scope-b',
  }
}

describe('resolveGmailAccessToken', () => {
  it('throws NoGmailCredentialError when the account has no live credential', async () => {
    const { db, userId } = await freshDbWithUser()
    const encryptor = testEncryptor()
    const accountId = await seedAccount(db, userId)
    const google = makeFakeGoogleClient()

    await expect(resolveGmailAccessToken(db, encryptor, accountId, google, 5000)).rejects.toBeInstanceOf(
      NoGmailCredentialError,
    )
  })

  it('returns the cached access token when it is comfortably fresh', async () => {
    const { db, userId } = await freshDbWithUser()
    const encryptor = testEncryptor()
    const accountId = await seedAccount(db, userId)
    const now = 5000
    await storeGmailCredential(db, encryptor, {
      userId,
      accountId,
      actorUserId: null,
      payload: payload(now + 100_000),
      now,
    })
    const google = makeFakeGoogleClient()

    const token = await resolveGmailAccessToken(db, encryptor, accountId, google, now)
    expect(token).toBe('access-1')
    expect(google.calls.refresh).toHaveLength(0)
  })

  it('refreshes + persists + logs an update when near expiry', async () => {
    const { db, userId } = await freshDbWithUser()
    const encryptor = testEncryptor()
    const accountId = await seedAccount(db, userId)
    const now = 5000
    // Expires within the skew window → refresh.
    await storeGmailCredential(db, encryptor, {
      userId,
      accountId,
      actorUserId: null,
      payload: payload(now + ACCESS_TOKEN_REFRESH_SKEW_SECONDS - 1),
      now,
    })
    const logsBefore = (await db.selectFrom('change_log').selectAll().execute()).length

    const google = makeFakeGoogleClient({
      refresh: { accessToken: 'access-2', expiresInSeconds: 3600 },
    })
    const refreshNow = now + 10
    const token = await resolveGmailAccessToken(db, encryptor, accountId, google, refreshNow)

    expect(token).toBe('access-2')
    expect(google.calls.refresh).toEqual(['refresh-1'])

    // Persisted: re-resolving with a fresh clock returns the new token without
    // hitting Google again (expiry was pushed out by the refresh).
    const cred = await db
      .selectFrom('credentials')
      .selectAll()
      .where('account_id', '=', accountId)
      .where('deleted_at', 'is', null)
      .executeTakeFirstOrThrow()
    expect(cred.updated_at).toBe(refreshNow)

    // change_log gained an 'updated' row with metadata only (no tokens).
    const updates = await db
      .selectFrom('change_log')
      .selectAll()
      .where('action', '=', 'updated')
      .where('entity_type', '=', 'credential')
      .execute()
    expect(updates).toHaveLength(1)
    const update = updates.at(0)
    expect(update?.actor_user_id).toBeNull()
    expect(update?.after_json ?? '').not.toContain('access-2')
    expect(update?.after_json ?? '').not.toContain('refresh-1')
    const logsAfter = (await db.selectFrom('change_log').selectAll().execute()).length
    expect(logsAfter).toBe(logsBefore + 1)
  })

  it('refresh preserves refresh_token + scopes in the re-encrypted payload', async () => {
    // Losing the refresh token on a refresh bricks the Account on the *next*
    // refresh (outside the test window). Decrypt the post-refresh row and assert
    // both the refresh token and the granted scopes survived the re-encryption.
    const { db, userId } = await freshDbWithUser()
    const encryptor = testEncryptor()
    const accountId = await seedAccount(db, userId)
    const now = 5000
    await storeGmailCredential(db, encryptor, {
      userId,
      accountId,
      actorUserId: null,
      payload: payload(now), // at expiry → refresh
      now,
    })
    const google = makeFakeGoogleClient({
      refresh: { accessToken: 'access-rotated', expiresInSeconds: 3600 },
    })

    await resolveGmailAccessToken(db, encryptor, accountId, google, now + 10)

    const cred = await db
      .selectFrom('credentials')
      .select('data_enc')
      .where('account_id', '=', accountId)
      .where('deleted_at', 'is', null)
      .executeTakeFirstOrThrow()
    const after = decryptTokenPayload(encryptor, cred.data_enc)
    expect(after.refresh_token).toBe('refresh-1')
    expect(after.scopes).toBe('scope-a scope-b')
    expect(after.access_token).toBe('access-rotated')
  })

  it('a non-invalid_grant refresh error rethrows and does NOT soft-delete the credential', async () => {
    // A transient blip must not destroy a live credential (that would force an
    // unnecessary, user-visible re-auth).
    const { db, userId } = await freshDbWithUser()
    const encryptor = testEncryptor()
    const accountId = await seedAccount(db, userId)
    const now = 5000
    await storeGmailCredential(db, encryptor, {
      userId,
      accountId,
      actorUserId: null,
      payload: payload(now),
      now,
    })
    const transient = new Error('503 service unavailable')
    const flaky: FakeGoogleClient = {
      ...makeFakeGoogleClient(),
      refreshAccessToken: async () => {
        throw transient
      },
    }

    await expect(resolveGmailAccessToken(db, encryptor, accountId, flaky, now + 10)).rejects.toBe(transient)

    // Credential untouched: still live, never soft-deleted.
    const live = await db
      .selectFrom('credentials')
      .selectAll()
      .where('account_id', '=', accountId)
      .where('deleted_at', 'is', null)
      .execute()
    expect(live).toHaveLength(1)
    // No 'deleted' change_log row was written for this credential.
    const deletes = await db
      .selectFrom('change_log')
      .selectAll()
      .where('action', '=', 'deleted')
      .where('entity_type', '=', 'credential')
      .execute()
    expect(deletes).toHaveLength(0)
  })

  it('a thrown InvalidGrantError (not the literal "invalid_grant" config) also triggers needs-reauth', async () => {
    const { db, userId } = await freshDbWithUser()
    const encryptor = testEncryptor()
    const accountId = await seedAccount(db, userId)
    const now = 5000
    await storeGmailCredential(db, encryptor, {
      userId,
      accountId,
      actorUserId: null,
      payload: payload(now),
      now,
    })
    const client: FakeGoogleClient = {
      ...makeFakeGoogleClient(),
      refreshAccessToken: async () => {
        throw new InvalidGrantError()
      },
    }
    await expect(resolveGmailAccessToken(db, encryptor, accountId, client, now + 10)).rejects.toBeInstanceOf(
      NeedsReauthError,
    )
    const live = await db
      .selectFrom('credentials')
      .selectAll()
      .where('account_id', '=', accountId)
      .where('deleted_at', 'is', null)
      .execute()
    expect(live).toHaveLength(0)
  })

  it('refresh-skew boundary: exactly at the skew edge DOES refresh (> not >=)', async () => {
    // The cached token is returned only when `expires_at - now > SKEW`. At
    // exactly `delta === SKEW` the strict `>` is false → it refreshes. This pins
    // `>` against a `>=` mutant (which would return the cached token here).
    const { db, userId } = await freshDbWithUser()
    const encryptor = testEncryptor()
    const accountId = await seedAccount(db, userId)
    const now = 5000
    await storeGmailCredential(db, encryptor, {
      userId,
      accountId,
      actorUserId: null,
      payload: payload(now + ACCESS_TOKEN_REFRESH_SKEW_SECONDS),
      now,
    })
    const google = makeFakeGoogleClient({
      refresh: { accessToken: 'access-2', expiresInSeconds: 3600 },
    })
    const token = await resolveGmailAccessToken(db, encryptor, accountId, google, now)
    expect(token).toBe('access-2')
    expect(google.calls.refresh).toEqual(['refresh-1'])
  })

  it('refresh-skew boundary: one second past the edge does NOT refresh', async () => {
    // delta === SKEW + 1 > SKEW → cached token returned, Google untouched.
    const { db, userId } = await freshDbWithUser()
    const encryptor = testEncryptor()
    const accountId = await seedAccount(db, userId)
    const now = 5000
    await storeGmailCredential(db, encryptor, {
      userId,
      accountId,
      actorUserId: null,
      payload: payload(now + ACCESS_TOKEN_REFRESH_SKEW_SECONDS + 1),
      now,
    })
    const google = makeFakeGoogleClient()
    const token = await resolveGmailAccessToken(db, encryptor, accountId, google, now)
    expect(token).toBe('access-1')
    expect(google.calls.refresh).toHaveLength(0)
  })

  it('on invalid_grant marks needs-reauth: soft-deletes the credential and throws', async () => {
    const { db, userId } = await freshDbWithUser()
    const encryptor = testEncryptor()
    const accountId = await seedAccount(db, userId)
    const now = 5000
    await storeGmailCredential(db, encryptor, {
      userId,
      accountId,
      actorUserId: null,
      payload: payload(now), // at expiry → triggers refresh
      now,
    })
    const google = makeFakeGoogleClient({ refresh: 'invalid_grant' })

    await expect(resolveGmailAccessToken(db, encryptor, accountId, google, now + 10)).rejects.toBeInstanceOf(
      NeedsReauthError,
    )

    // No live credential remains → the ProviderFactory will resolve null and the
    // poll loop skips the account (the column-free needs-reauth representation).
    const live = await db
      .selectFrom('credentials')
      .selectAll()
      .where('account_id', '=', accountId)
      .where('kind', '=', 'gmail_oauth')
      .where('deleted_at', 'is', null)
      .execute()
    expect(live).toHaveLength(0)

    // Audited as a deletion with metadata only.
    const deletes = await db
      .selectFrom('change_log')
      .selectAll()
      .where('action', '=', 'deleted')
      .where('entity_type', '=', 'credential')
      .execute()
    expect(deletes).toHaveLength(1)
    expect(deletes.at(0)?.before_json ?? '').not.toContain('refresh-1')
  })
})

describe('storeGmailCredential — storage boundaries', () => {
  it('stores ciphertext: data_enc is not plaintext and contains no secret bytes', async () => {
    const { db, userId } = await freshDbWithUser()
    const encryptor = testEncryptor()
    const accountId = await seedAccount(db, userId)
    const now = 5000
    await storeGmailCredential(db, encryptor, {
      userId,
      accountId,
      actorUserId: null,
      payload: payload(now + 100_000),
      now,
    })
    const cred = await db
      .selectFrom('credentials')
      .select('data_enc')
      .where('account_id', '=', accountId)
      .executeTakeFirstOrThrow()
    const raw = Buffer.from(cred.data_enc).toString('utf8')
    // The stored blob must not leak the token material in the clear.
    expect(raw).not.toContain('refresh-1')
    expect(raw).not.toContain('access-1')
    expect(raw).not.toContain('scope-a')
    // But it round-trips back through the encryptor to the original payload.
    expect(decryptTokenPayload(encryptor, cred.data_enc)).toMatchObject({
      refresh_token: 'refresh-1',
      access_token: 'access-1',
    })
  })

  it('records the acting User on the create-path change_log row', async () => {
    const { db, userId } = await freshDbWithUser()
    const encryptor = testEncryptor()
    const accountId = await seedAccount(db, userId)
    const now = 5000
    await storeGmailCredential(db, encryptor, {
      userId,
      accountId,
      actorUserId: userId,
      payload: payload(now + 100_000),
      now,
    })
    const log = await db
      .selectFrom('change_log')
      .selectAll()
      .where('entity_type', '=', 'credential')
      .where('action', '=', 'created')
      .executeTakeFirstOrThrow()
    expect(log.actor_user_id).toBe(userId)
    expect(log.user_id).toBe(userId)
  })
})

describe('decryptTokenPayload', () => {
  it('rejects a blob that does not decrypt/parse to a valid payload', () => {
    const encryptor = testEncryptor()
    // A valid ciphertext whose plaintext is not the expected JSON payload.
    const malformed = encryptor.encrypt(Buffer.from('not json at all', 'utf8'))
    expect(() => decryptTokenPayload(encryptor, malformed)).toThrow()
  })

  it('rejects a payload missing the refresh_token (schema enforced)', () => {
    const encryptor = testEncryptor()
    const blob = encryptor.encrypt(
      Buffer.from(
        JSON.stringify({
          access_token: 'a',
          access_token_expires_at: 1,
          scopes: '',
        }),
        'utf8',
      ),
    )
    expect(() => decryptTokenPayload(encryptor, blob)).toThrow()
  })

  it('round-trips a payload through encrypt → decrypt', () => {
    const encryptor = testEncryptor()
    const p = payload(12_345)
    expect(decryptTokenPayload(encryptor, encryptTokenPayload(encryptor, p))).toEqual(p)
  })
})
