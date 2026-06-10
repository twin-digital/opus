/**
 * Gmail OAuth token storage + lifecycle (oauth-flow.md "Token storage and
 * lifecycle"; data-model.md `credentials`).
 *
 * A `gmail_oauth` Credential's decrypted payload is
 * `{ refresh_token, access_token, access_token_expires_at, scopes }`, encrypted
 * into `credentials.data_enc` via the {@link Encryptor} seam. This module owns:
 *  - the payload shape + (de)serialization,
 *  - the credential write performed by a successful flow / re-auth, respecting
 *    `idx_credentials_active_account` (soft-delete prior, insert fresh),
 *  - {@link resolveGmailAccessToken}: refresh-before-expiry + `invalid_grant`
 *    → needs-reauth, the building block the live ProviderFactory consumes.
 *
 * Every `change_log` row written here carries **non-secret metadata only** —
 * `kind`, `account_id`, `created_at`, `updated_at`, action — never `data_enc`
 * (data-model.md `credentials`). Tokens are never logged.
 */

import type { Kysely } from 'kysely'
import { z } from 'zod'
import type { Encryptor } from '../crypto/encryption.js'
import type { Database } from '../db/schema.js'
import { type GoogleOAuthClient, InvalidGrantError } from './google-client.js'

/** The `kind` discriminator for Gmail OAuth credentials. */
export const GMAIL_OAUTH_KIND = 'gmail_oauth'

/** The decrypted `gmail_oauth` credential payload (data-model.md `credentials`). */
export const gmailTokenPayloadSchema = z.object({
  refresh_token: z.string().min(1),
  access_token: z.string(),
  /** Unix seconds at which `access_token` expires. */
  access_token_expires_at: z.number().int(),
  /** Granted scopes, space-delimited as Google returns them. */
  scopes: z.string(),
})

export type GmailTokenPayload = z.infer<typeof gmailTokenPayloadSchema>

/** Encrypt a token payload into the `data_enc` blob. */
export function encryptTokenPayload(encryptor: Encryptor, payload: GmailTokenPayload): Buffer {
  return encryptor.encrypt(Buffer.from(JSON.stringify(payload), 'utf8'))
}

/** Decrypt + parse a `data_enc` blob back into a token payload. */
export function decryptTokenPayload(encryptor: Encryptor, dataEnc: Buffer): GmailTokenPayload {
  const plaintext = encryptor.decrypt(dataEnc).toString('utf8')
  return gmailTokenPayloadSchema.parse(JSON.parse(plaintext))
}

/**
 * The non-secret credential metadata recorded in `change_log` before/after.
 * Deliberately excludes `data_enc` (data-model.md `credentials`).
 */
function credentialMetadata(meta: {
  kind: string
  account_id: number | null
  created_at: number
  updated_at: number | null
}): string {
  return JSON.stringify(meta)
}

/**
 * Store a fresh `gmail_oauth` Credential for an Account inside a single
 * transaction, respecting `idx_credentials_active_account` (at most one live
 * `gmail_oauth` per `(user_id, kind, account_id)`):
 *
 *  1. Soft-delete any existing live `gmail_oauth` Credential for the Account
 *     (the re-auth path; a no-op on first authorization). This keeps each grant
 *     boundary auditable rather than mutating in place (oauth-flow.md "Re-auth").
 *  2. INSERT the new Credential with the encrypted payload.
 *  3. Write a `change_log` row (`action='created'`, non-secret metadata).
 *
 * Returns the new credential id.
 */
export async function storeGmailCredential(
  db: Kysely<Database>,
  encryptor: Encryptor,
  args: {
    userId: number
    accountId: number
    actorUserId: number | null
    payload: GmailTokenPayload
    now: number
  },
): Promise<number> {
  const dataEnc = encryptTokenPayload(encryptor, args.payload)

  return db.transaction().execute(async (tx) => {
    // 1. Soft-delete a prior live credential (re-auth). The partial unique index
    //    only counts `deleted_at IS NULL`, so soft-deleting first frees the slot
    //    for the fresh INSERT below.
    const prior = await tx
      .selectFrom('credentials')
      .select(['id', 'created_at', 'updated_at'])
      .where('user_id', '=', args.userId)
      .where('account_id', '=', args.accountId)
      .where('kind', '=', GMAIL_OAUTH_KIND)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    if (prior) {
      await tx
        .updateTable('credentials')
        .set({ deleted_at: args.now, updated_at: args.now })
        .where('id', '=', prior.id)
        .execute()
      await tx
        .insertInto('change_log')
        .values({
          user_id: args.userId,
          actor_user_id: args.actorUserId,
          entity_type: 'credential',
          entity_id: prior.id,
          action: 'deleted',
          before_json: credentialMetadata({
            kind: GMAIL_OAUTH_KIND,
            account_id: args.accountId,
            created_at: prior.created_at,
            updated_at: prior.updated_at,
          }),
          after_json: null,
          recorded_at: args.now,
        })
        .execute()
    }

    // 2. INSERT the fresh credential.
    const inserted = await tx
      .insertInto('credentials')
      .values({
        user_id: args.userId,
        account_id: args.accountId,
        kind: GMAIL_OAUTH_KIND,
        data_enc: dataEnc,
        created_at: args.now,
        updated_at: args.now,
        deleted_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    // 3. change_log: non-secret metadata only.
    await tx
      .insertInto('change_log')
      .values({
        user_id: args.userId,
        actor_user_id: args.actorUserId,
        entity_type: 'credential',
        entity_id: inserted.id,
        action: 'created',
        before_json: null,
        after_json: credentialMetadata({
          kind: GMAIL_OAUTH_KIND,
          account_id: args.accountId,
          created_at: args.now,
          updated_at: args.now,
        }),
        recorded_at: args.now,
      })
      .execute()

    return inserted.id
  })
}

/**
 * Refresh-before-expiry skew: refresh when the access token expires within this
 * many seconds (oauth-flow.md "Refresh" — "a small skew (e.g. 5 minutes)").
 */
export const ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 5 * 60

/** Raised when an Account has no live `gmail_oauth` Credential to resolve. */
export class NoGmailCredentialError extends Error {
  override readonly name = 'NoGmailCredentialError'
  constructor(accountId: number) {
    super(`account ${accountId} has no live gmail_oauth credential`)
  }
}

/**
 * Raised by {@link resolveGmailAccessToken} after an `invalid_grant` refresh: the
 * grant is gone and the Account has been marked needs-reauth (its credential
 * soft-deleted). The caller (the live ProviderFactory / poll loop) treats this as
 * "skip this Account" rather than a hard failure.
 */
export class NeedsReauthError extends Error {
  override readonly name = 'NeedsReauthError'
  constructor(accountId: number) {
    super(`account ${accountId} needs re-authorization (invalid_grant)`)
  }
}

/**
 * Resolve a usable Gmail access token for an Account: the building block the
 * live `GmailProviderClient` factory calls before each Gmail operation.
 *
 *  1. Load + decrypt the Account's live `gmail_oauth` Credential
 *     (→ {@link NoGmailCredentialError} if absent — the needs-reauth state).
 *  2. If `access_token_expires_at` is within the refresh skew, refresh via the
 *     refresh token, persist the new `access_token` + `access_token_expires_at`,
 *     bump `updated_at`, and write a `change_log` row (`actor_user_id=NULL`,
 *     `action='updated'`, reflecting only `updated_at` moving — data-model.md).
 *  3. On `invalid_grant`: soft-delete the Credential, write a `change_log`
 *     `deleted` row, and throw {@link NeedsReauthError}. With no live credential
 *     remaining, the production ProviderFactory resolves `null` and the poll loop
 *     skips the Account — the column-free needs-reauth representation.
 *
 * `now` (Unix seconds) is injected for deterministic tests; defaults to the
 * wall clock.
 */
export async function resolveGmailAccessToken(
  db: Kysely<Database>,
  encryptor: Encryptor,
  accountId: number,
  googleClient: GoogleOAuthClient,
  now: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const row = await db
    .selectFrom('credentials')
    .select(['id', 'user_id', 'data_enc', 'created_at'])
    .where('account_id', '=', accountId)
    .where('kind', '=', GMAIL_OAUTH_KIND)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()
  if (!row) {
    throw new NoGmailCredentialError(accountId)
  }

  const payload = decryptTokenPayload(encryptor, row.data_enc)

  // Fresh enough: return the cached token without touching Google.
  if (payload.access_token_expires_at - now > ACCESS_TOKEN_REFRESH_SKEW_SECONDS) {
    return payload.access_token
  }

  // Near (or past) expiry: refresh.
  let refreshed: { accessToken: string; expiresInSeconds: number }
  try {
    refreshed = await googleClient.refreshAccessToken(payload.refresh_token)
  } catch (err) {
    if (err instanceof InvalidGrantError) {
      await markNeedsReauth(db, {
        credentialId: row.id,
        userId: row.user_id,
        accountId,
        createdAt: row.created_at,
        now,
      })
      throw new NeedsReauthError(accountId)
    }
    throw err
  }

  const updated: GmailTokenPayload = {
    ...payload,
    access_token: refreshed.accessToken,
    access_token_expires_at: now + refreshed.expiresInSeconds,
  }
  const dataEnc = encryptTokenPayload(encryptor, updated)

  await db.transaction().execute(async (tx) => {
    await tx.updateTable('credentials').set({ data_enc: dataEnc, updated_at: now }).where('id', '=', row.id).execute()
    // Audit the refresh with non-secret metadata only: before/after reflect
    // `updated_at` moving and nothing else (data-model.md `credentials`).
    await tx
      .insertInto('change_log')
      .values({
        user_id: row.user_id,
        actor_user_id: null,
        entity_type: 'credential',
        entity_id: row.id,
        action: 'updated',
        before_json: credentialMetadata({
          kind: GMAIL_OAUTH_KIND,
          account_id: accountId,
          created_at: row.created_at,
          updated_at: null,
        }),
        after_json: credentialMetadata({
          kind: GMAIL_OAUTH_KIND,
          account_id: accountId,
          created_at: row.created_at,
          updated_at: now,
        }),
        recorded_at: now,
      })
      .execute()
  })

  return refreshed.accessToken
}

/**
 * Mark an Account needs-reauth by soft-deleting its `gmail_oauth` Credential and
 * auditing it. Column-free: the absence of a live credential is the needs-reauth
 * signal the production ProviderFactory keys on (it resolves `null` and the poll
 * loop skips the Account). Re-auth re-populates a fresh credential.
 */
async function markNeedsReauth(
  db: Kysely<Database>,
  args: {
    credentialId: number
    userId: number
    accountId: number
    createdAt: number
    now: number
  },
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    await tx
      .updateTable('credentials')
      .set({ deleted_at: args.now, updated_at: args.now })
      .where('id', '=', args.credentialId)
      .execute()
    await tx
      .insertInto('change_log')
      .values({
        user_id: args.userId,
        actor_user_id: null,
        entity_type: 'credential',
        entity_id: args.credentialId,
        action: 'deleted',
        before_json: credentialMetadata({
          kind: GMAIL_OAUTH_KIND,
          account_id: args.accountId,
          created_at: args.createdAt,
          updated_at: null,
        }),
        after_json: null,
        recorded_at: args.now,
      })
      .execute()
  })
}
