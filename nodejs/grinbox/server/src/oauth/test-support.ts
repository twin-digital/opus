/**
 * Test-only helpers for the OAuth suite: a configurable fake {@link
 * GoogleOAuthClient} and a migrated in-memory DB seeded with a User. Not exported
 * from the package barrel.
 */

import { randomBytes } from 'node:crypto'
import type { Kysely } from 'kysely'
import { makeEncryptor } from '../crypto/encryption.js'
import { openDatabase } from '../db/connection.js'
import { runMigrations } from '../db/migrator.js'
import type { Database } from '../db/schema.js'
import {
  type ConsentUrlParams,
  GMAIL_SCOPES,
  type GoogleOAuthClient,
  InvalidGrantError,
  type RefreshResult,
  type TokenExchangeResult,
} from './google-client.js'

/** A real Encryptor over a random 32-byte key — exercises the storage round-trip. */
export function testEncryptor() {
  return makeEncryptor(randomBytes(32))
}

/** A migrated in-memory DB with a single seeded User (id returned). */
export async function freshDbWithUser(): Promise<{
  db: Kysely<Database>
  userId: number
}> {
  const db = openDatabase(':memory:')
  await runMigrations(db)
  const user = await db
    .insertInto('users')
    .values({ name: 'u', email: 'u@example.com', created_at: 1000 })
    .returning('id')
    .executeTakeFirstOrThrow()
  return { db, userId: user.id }
}

export interface FakeGoogleOptions {
  /** Token returned by `exchangeCode`. Default includes a refresh token. */
  readonly exchange?: Partial<TokenExchangeResult>
  /** Whether `exchangeCode` omits the refresh token (the prompt=consent failure). */
  readonly omitRefreshToken?: boolean
  /** Email `fetchProfileEmail` returns. */
  readonly email?: string
  /** Refresh behavior: a result, or 'invalid_grant' to throw InvalidGrantError. */
  readonly refresh?: RefreshResult | 'invalid_grant'
}

/** A spying fake Google client; records calls and returns configured values. */
export interface FakeGoogleClient extends GoogleOAuthClient {
  readonly calls: {
    consentUrl: ConsentUrlParams[]
    exchange: { code: string; codeVerifier: string }[]
    profile: string[]
    refresh: string[]
  }
}

export function makeFakeGoogleClient(options: FakeGoogleOptions = {}): FakeGoogleClient {
  const calls: FakeGoogleClient['calls'] = {
    consentUrl: [],
    exchange: [],
    profile: [],
    refresh: [],
  }

  return {
    calls,
    buildConsentUrl(params: ConsentUrlParams): string {
      calls.consentUrl.push(params)
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.searchParams.set('access_type', 'offline')
      url.searchParams.set('prompt', 'consent')
      url.searchParams.set('scope', GMAIL_SCOPES.join(' '))
      url.searchParams.set('client_id', 'test-client-id')
      url.searchParams.set('redirect_uri', 'https://grinbox.pegasuspad.com/oauth/callback')
      url.searchParams.set('state', params.state)
      url.searchParams.set('code_challenge', params.codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('response_type', 'code')
      return url.toString()
    },
    exchangeCode(args): Promise<TokenExchangeResult> {
      calls.exchange.push(args)
      const base: TokenExchangeResult = {
        refreshToken: 'refresh-abc',
        accessToken: 'access-xyz',
        expiresInSeconds: 3600,
        scope: GMAIL_SCOPES.join(' '),
        ...options.exchange,
      }
      if (options.omitRefreshToken) {
        return Promise.resolve({ ...base, refreshToken: undefined })
      }
      return Promise.resolve(base)
    },
    fetchProfileEmail(accessToken): Promise<string> {
      calls.profile.push(accessToken)
      return Promise.resolve(options.email ?? 'mailbox@example.com')
    },
    refreshAccessToken(refreshToken): Promise<RefreshResult> {
      calls.refresh.push(refreshToken)
      if (options.refresh === 'invalid_grant') {
        return Promise.reject(new InvalidGrantError())
      }
      return Promise.resolve(options.refresh ?? { accessToken: 'access-new', expiresInSeconds: 3600 })
    },
  }
}
