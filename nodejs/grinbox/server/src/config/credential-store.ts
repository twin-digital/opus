/**
 * Pushover (notification) credential storage. The user-scoped sibling of the
 * Gmail OAuth `token-store.ts`: a `pushover` Credential's decrypted payload is
 * `{ app_token, user_key }` (oauth-flow.md credential storage; data-model.md
 * `credentials`), encrypted into `credentials.data_enc` via the {@link Encryptor}
 * seam. `account_id` is NULL (user-scoped); `idx_credentials_active_user`
 * permits at most one live `pushover` per User, so a re-store soft-deletes the
 * prior live row before inserting the fresh one.
 *
 * Every `change_log` row written here carries **non-secret metadata only** —
 * `kind`, `account_id`, `created_at`, `updated_at`, action — never `data_enc`
 * (data-model.md `credentials`). The blob is never logged or audited.
 */

import type { Kysely } from 'kysely'
import { z } from 'zod'
import type { Encryptor } from '../crypto/encryption.js'
import type { Database } from '../db/schema.js'

/** The `kind` discriminator for Pushover notification credentials. */
export const PUSHOVER_KIND = 'pushover'

/** The decrypted `pushover` credential payload (data-model.md `credentials`). */
export const pushoverPayloadSchema = z.object({
  app_token: z.string().min(1),
  user_key: z.string().min(1),
})

export type PushoverPayload = z.infer<typeof pushoverPayloadSchema>

/** The non-secret credential metadata recorded in `change_log`. */
function credentialMetadata(meta: {
  kind: string
  account_id: number | null
  created_at: number
  updated_at: number | null
}): string {
  return JSON.stringify(meta)
}

export interface StorePushoverInput {
  readonly userId: number
  readonly payload: PushoverPayload
  readonly actorUserId: number | null
}

/**
 * Store a fresh user-scoped `pushover` Credential inside a single transaction,
 * respecting `idx_credentials_active_user` (at most one live `pushover` per
 * `(user_id, kind)` with `account_id IS NULL`):
 *
 *  1. Soft-delete any existing live `pushover` Credential for the User (a re-store
 *     replaces the old key; a no-op on first store). Keeps each grant boundary
 *     auditable rather than mutating in place, mirroring the OAuth re-auth path.
 *  2. INSERT the new Credential with the encrypted payload.
 *  3. Write a `change_log` row (`action='created'`, non-secret metadata).
 *
 * Returns the new credential id.
 */
export async function storePushoverCredential(
  db: Kysely<Database>,
  encryptor: Encryptor,
  input: StorePushoverInput,
  now: number = Math.floor(Date.now() / 1000),
): Promise<number> {
  const dataEnc = encryptor.encrypt(Buffer.from(JSON.stringify(input.payload), 'utf8'))

  return db.transaction().execute(async (tx) => {
    const prior = await tx
      .selectFrom('credentials')
      .select(['id', 'created_at', 'updated_at'])
      .where('user_id', '=', input.userId)
      .where('account_id', 'is', null)
      .where('kind', '=', PUSHOVER_KIND)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()

    if (prior) {
      await tx.updateTable('credentials').set({ deleted_at: now, updated_at: now }).where('id', '=', prior.id).execute()
      await tx
        .insertInto('change_log')
        .values({
          user_id: input.userId,
          actor_user_id: input.actorUserId,
          entity_type: 'credential',
          entity_id: prior.id,
          action: 'deleted',
          before_json: credentialMetadata({
            kind: PUSHOVER_KIND,
            account_id: null,
            created_at: prior.created_at,
            updated_at: prior.updated_at,
          }),
          after_json: null,
          recorded_at: now,
        })
        .execute()
    }

    const inserted = await tx
      .insertInto('credentials')
      .values({
        user_id: input.userId,
        account_id: null,
        kind: PUSHOVER_KIND,
        data_enc: dataEnc,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await tx
      .insertInto('change_log')
      .values({
        user_id: input.userId,
        actor_user_id: input.actorUserId,
        entity_type: 'credential',
        entity_id: inserted.id,
        action: 'created',
        before_json: null,
        after_json: credentialMetadata({
          kind: PUSHOVER_KIND,
          account_id: null,
          created_at: now,
          updated_at: now,
        }),
        recorded_at: now,
      })
      .execute()

    return inserted.id
  })
}

/** Decrypt + parse a `pushover` `data_enc` blob (used in tests / consumers). */
export function decryptPushoverPayload(encryptor: Encryptor, dataEnc: Buffer): PushoverPayload {
  const plaintext = encryptor.decrypt(dataEnc).toString('utf8')
  return pushoverPayloadSchema.parse(JSON.parse(plaintext))
}
