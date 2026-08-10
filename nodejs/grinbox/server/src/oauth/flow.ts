/**
 * OAuth flow orchestration (oauth-flow.md "The flow"), kept separate from the
 * HTTP layer so the start/callback logic is directly unit-testable.
 *
 *  - {@link startAuthorization} generates `state` + PKCE, persists the
 *    pending-auth entry, and returns the consent URL.
 *  - {@link completeAuthorization} validates+consumes `state`, exchanges the
 *    code, asserts a refresh token, fetches the profile email, upserts the
 *    Account (or binds the re-auth Account), and stores the encrypted Credential.
 */

import type { Kysely } from 'kysely'
import type { Encryptor } from '../crypto/encryption.js'
import type { Database } from '../db/schema.js'
import { type GoogleOAuthClient, MissingRefreshTokenError } from './google-client.js'
import { type PendingAuthStore, createPendingAuthStore } from './pending-auth.js'
import { generatePkcePair, generateState } from './pkce.js'
import { type GmailTokenPayload, storeGmailCredential } from './token-store.js'

/** Raised when a callback's `state` is unknown, already-consumed, or expired. */
export class InvalidStateError extends Error {
  override readonly name = 'InvalidStateError'
  constructor(message = 'unknown, already-used, or expired state') {
    super(message)
  }
}

/** Raised when a re-auth flow binds to an Account that does not exist. */
export class AccountNotFoundError extends Error {
  override readonly name = 'AccountNotFoundError'
  constructor(accountId: number) {
    super(`account ${accountId} not found`)
  }
}

/** The default `user_id` for the single-User MVP (no multi-user auth yet). */
export const DEFAULT_USER_ID = 1

export interface StartAuthorizationInput {
  /**
   * An existing Account to re-authorize (oauth-flow.md "Re-auth"); omit for a
   * new Account. Bound into the pending-auth entry and replayed at callback.
   */
  readonly accountId?: number
}

export interface StartAuthorizationResult {
  readonly consentUrl: string
  /** The generated state (returned for tests / observability). */
  readonly state: string
}

/**
 * Begin an authorization flow: generate `state` + PKCE, persist the pending
 * entry, build the consent URL. The verifier never leaves the server.
 */
export function startAuthorization(
  store: PendingAuthStore,
  googleClient: GoogleOAuthClient,
  input: StartAuthorizationInput = {},
): StartAuthorizationResult {
  const state = generateState()
  const { verifier, challenge } = generatePkcePair()
  store.put(state, { pkceVerifier: verifier, accountId: input.accountId })
  const consentUrl = googleClient.buildConsentUrl({
    state,
    codeChallenge: challenge,
  })
  return { consentUrl, state }
}

export interface CompleteAuthorizationInput {
  readonly state: string
  readonly code: string
  /** Acting User for the `change_log` row; null for system actions. */
  readonly actorUserId?: number | null
  /** Owning User for the Account/Credential; defaults to {@link DEFAULT_USER_ID}. */
  readonly userId?: number
  /** Injected clock (Unix seconds) for deterministic tests. */
  readonly now?: number
}

export interface CompleteAuthorizationResult {
  readonly accountId: number
  readonly email: string
  readonly credentialId: number
}

/**
 * Complete an authorization flow from the callback. Throws {@link InvalidStateError}
 * for a bad `state` and {@link MissingRefreshTokenError} when Google returned no
 * refresh token (no credential is stored on that path).
 */
export async function completeAuthorization(
  db: Kysely<Database>,
  encryptor: Encryptor,
  store: PendingAuthStore,
  googleClient: GoogleOAuthClient,
  input: CompleteAuthorizationInput,
): Promise<CompleteAuthorizationResult> {
  // 1. Validate + consume the state (single-use; CSRF + correlation).
  const pending = store.consume(input.state)
  if (pending === undefined) {
    throw new InvalidStateError()
  }

  const now = input.now ?? Math.floor(Date.now() / 1000)
  const userId = input.userId ?? DEFAULT_USER_ID
  const actorUserId = input.actorUserId ?? null

  // 2. Exchange the code + PKCE verifier (+ client_secret, inside the client).
  const tokens = await googleClient.exchangeCode({
    code: input.code,
    codeVerifier: pending.pkceVerifier,
  })

  // 3. A Daemon needs the refresh token; without it the grant is useless.
  //    Surface a retry instruction and store nothing (oauth-flow.md).
  if (!tokens.refreshToken) {
    throw new MissingRefreshTokenError()
  }

  // 4. Fetch the mailbox email to label / bind the Account.
  const email = await googleClient.fetchProfileEmail(tokens.accessToken)

  // 5. Resolve the Account: bind to the re-auth target, or upsert by email.
  const accountId = await resolveAccount(db, {
    userId,
    accountId: pending.accountId,
    email,
    now,
  })

  // 6. Store the encrypted credential (soft-deletes a prior live one on re-auth).
  const payload: GmailTokenPayload = {
    refresh_token: tokens.refreshToken,
    access_token: tokens.accessToken,
    access_token_expires_at: now + tokens.expiresInSeconds,
    scopes: tokens.scope,
  }
  const credentialId = await storeGmailCredential(db, encryptor, {
    userId,
    accountId,
    actorUserId,
    payload,
    now,
  })

  return { accountId, email, credentialId }
}

/**
 * Resolve the target Account for a completed flow:
 *  - Re-auth (`pending.accountId` set): verify it exists; keep its identity.
 *  - New Account: reuse a non-deleted Gmail Account with the same email if one
 *    exists (idempotent re-add of the same mailbox), else INSERT one with
 *    `provider_type='gmail'` and `settings_json={ email }`.
 */
async function resolveAccount(
  db: Kysely<Database>,
  args: {
    userId: number
    accountId: number | undefined
    email: string
    now: number
  },
): Promise<number> {
  if (args.accountId !== undefined) {
    const existing = await db
      .selectFrom('accounts')
      .select('id')
      .where('id', '=', args.accountId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    if (!existing) {
      throw new AccountNotFoundError(args.accountId)
    }
    return existing.id
  }

  // New Account: dedupe on (user, email) among live Gmail Accounts so re-adding
  // the same mailbox lands on one Account rather than colliding on the name
  // unique index or proliferating rows.
  const rows = await db
    .selectFrom('accounts')
    .select(['id', 'settings_json'])
    .where('user_id', '=', args.userId)
    .where('provider_type', '=', 'gmail')
    .where('deleted_at', 'is', null)
    .execute()
  for (const row of rows) {
    if (parseEmail(row.settings_json) === args.email) {
      return row.id
    }
  }

  const inserted = await db
    .insertInto('accounts')
    .values({
      user_id: args.userId,
      name: args.email,
      provider_type: 'gmail',
      active_pipeline_id: null,
      settings_json: JSON.stringify({ email: args.email }),
      created_at: args.now,
      deleted_at: null,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return inserted.id
}

/** Read `email` out of an Account's `settings_json`, tolerating malformed JSON. */
function parseEmail(settingsJson: string): string | null {
  try {
    const parsed = JSON.parse(settingsJson) as { email?: unknown }
    return typeof parsed.email === 'string' ? parsed.email : null
  } catch {
    return null
  }
}

/** Build a pending-auth store with the documented in-memory defaults. */
export { createPendingAuthStore }
