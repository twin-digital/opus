/**
 * Adding, repairing, and re-pointing an IMAP Account, and resolving the session
 * every IMAP path opens.
 *
 * An Account exists once the user has accepted its four folders (d-8jc4taom):
 * the probe that logs in leaves nothing behind, and grinbox holds the password
 * no longer than the adding takes. Creation writes the Account, its
 * `imap_password` Credential, and the `change_log` rows in one transaction, so a
 * half-added Account is not a state the daemon can be left in.
 *
 * Repair restates everything an IMAP Account is configured with rather than the
 * password alone (d-r3ogwkv7), and clears the pause the refusal set (d-v4mejzw5).
 * The backend still cannot change (d-oevikmal): every write here keeps
 * `provider_type` as it was.
 *
 * `change_log` rows carry non-secret metadata only — never the blob (d-8yht1ei9).
 */

import type { AccountFolders, ImapAccountSettings } from '@grinbox/shared'
import type { Kysely } from 'kysely'
import { z } from 'zod'
import type { Encryptor } from '../crypto/encryption.js'
import type { Database } from '../db/schema.js'
import type { ImapSession } from '../providers/imap/imap-client.js'
import { openImapSession } from '../providers/imap/imap-session.js'
import {
  IMAP_PASSWORD_KIND,
  IMAP_PROVIDER_TYPE,
  type ImapSettings,
  parseImapSettings,
  serializeImapSettings,
} from '../providers/imap/imap-settings.js'

/** The decrypted `imap_password` credential payload. */
export const imapPasswordPayloadSchema = z.object({ password: z.string().min(1) })
export type ImapPasswordPayload = z.infer<typeof imapPasswordPayloadSchema>

/** Why polling stopped: the server refused the password as the credential. */
export const PAUSED_CREDENTIAL_REJECTED = 'credential_rejected'

/** Thrown when an Account id names no live Account, or the wrong backend. */
export class ImapAccountNotFoundError extends Error {
  override readonly name = 'ImapAccountNotFoundError'
}

function credentialMetadata(meta: { kind: string; account_id: number | null; created_at: number }): string {
  return JSON.stringify(meta)
}

export interface CreateImapAccountInput {
  readonly userId: number
  readonly actorUserId: number | null
  readonly name: string
  readonly settings: ImapSettings
  readonly password: string
}

/**
 * Create the Account, store its password, and record both. One transaction: an
 * Account without its credential could never poll, and a credential without its
 * Account belongs to nothing.
 */
export async function createImapAccount(
  db: Kysely<Database>,
  encryptor: Encryptor,
  input: CreateImapAccountInput,
  now: number = Math.floor(Date.now() / 1000),
): Promise<number> {
  const dataEnc = encryptor.encrypt(Buffer.from(JSON.stringify({ password: input.password }), 'utf8'))

  return db.transaction().execute(async (tx) => {
    const account = await tx
      .insertInto('accounts')
      .values({
        user_id: input.userId,
        name: input.name,
        icon: null,
        color: null,
        provider_type: IMAP_PROVIDER_TYPE,
        active_pipeline_id: null,
        settings_json: serializeImapSettings(input.settings),
        last_polled_at: null,
        last_history_cursor: null,
        last_reconciled_at: null,
        capabilities_json: null,
        paused_reason: null,
        created_at: now,
        deleted_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    const credential = await tx
      .insertInto('credentials')
      .values({
        user_id: input.userId,
        account_id: account.id,
        kind: IMAP_PASSWORD_KIND,
        data_enc: dataEnc,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await tx
      .insertInto('change_log')
      .values([
        {
          user_id: input.userId,
          actor_user_id: input.actorUserId,
          entity_type: 'account',
          entity_id: account.id,
          action: 'created',
          before_json: null,
          after_json: JSON.stringify({ name: input.name, provider_type: IMAP_PROVIDER_TYPE }),
          recorded_at: now,
        },
        {
          user_id: input.userId,
          actor_user_id: input.actorUserId,
          entity_type: 'credential',
          entity_id: credential.id,
          action: 'created',
          before_json: null,
          after_json: credentialMetadata({
            kind: IMAP_PASSWORD_KIND,
            account_id: account.id,
            created_at: now,
          }),
          recorded_at: now,
        },
      ])
      .execute()

    return account.id
  })
}

export interface RepairImapAccountInput {
  readonly accountId: number
  readonly actorUserId: number | null
  readonly connection: ImapAccountSettings
  readonly password: string
}

/**
 * Restate an Account's connection and password, and resume polling. The stored
 * folders and the Account's backend are untouched: repair fixes how grinbox
 * reaches the mailbox, not which mailbox it is (d-r3ogwkv7, d-oevikmal).
 */
export async function repairImapAccount(
  db: Kysely<Database>,
  encryptor: Encryptor,
  input: RepairImapAccountInput,
  now: number = Math.floor(Date.now() / 1000),
): Promise<void> {
  const dataEnc = encryptor.encrypt(Buffer.from(JSON.stringify({ password: input.password }), 'utf8'))

  await db.transaction().execute(async (tx) => {
    const account = await loadImapAccountRow(tx, input.accountId)
    const settings = parseImapSettings(account.settings_json)

    await tx
      .updateTable('accounts')
      .set({
        settings_json: serializeImapSettings({ ...settings, ...input.connection }),
        paused_reason: null,
      })
      .where('id', '=', input.accountId)
      .execute()

    await tx
      .updateTable('credentials')
      .set({ deleted_at: now, updated_at: now })
      .where('account_id', '=', input.accountId)
      .where('kind', '=', IMAP_PASSWORD_KIND)
      .where('deleted_at', 'is', null)
      .execute()

    const credential = await tx
      .insertInto('credentials')
      .values({
        user_id: account.user_id,
        account_id: input.accountId,
        kind: IMAP_PASSWORD_KIND,
        data_enc: dataEnc,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await tx
      .insertInto('change_log')
      .values([
        {
          user_id: account.user_id,
          actor_user_id: input.actorUserId,
          entity_type: 'account',
          entity_id: input.accountId,
          action: 'updated',
          before_json: JSON.stringify({ host: settings.host, port: settings.port, username: settings.username }),
          after_json: JSON.stringify({
            host: input.connection.host,
            port: input.connection.port,
            username: input.connection.username,
          }),
          recorded_at: now,
        },
        {
          user_id: account.user_id,
          actor_user_id: input.actorUserId,
          entity_type: 'credential',
          entity_id: credential.id,
          action: 'created',
          before_json: null,
          after_json: credentialMetadata({
            kind: IMAP_PASSWORD_KIND,
            account_id: input.accountId,
            created_at: now,
          }),
          recorded_at: now,
        },
      ])
      .execute()
  })
}

/**
 * Point the Account's four roles at other folders (d-8pdx8qsd). What grinbox
 * already recorded about a Message keeps the standing it had; the new folders
 * are what the next poll and the next reconcile read.
 */
export async function repointImapFolders(
  db: Kysely<Database>,
  input: { accountId: number; actorUserId: number | null; folders: AccountFolders },
  now: number = Math.floor(Date.now() / 1000),
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    const account = await loadImapAccountRow(tx, input.accountId)
    const settings = parseImapSettings(account.settings_json)

    await tx
      .updateTable('accounts')
      .set({
        settings_json: serializeImapSettings({ ...settings, folders: input.folders }),
        // The arrival folder may have changed, so the stored cursor's
        // UIDVALIDITY no longer names anything (d-cepkyeoa).
        last_history_cursor: settings.folders.arrival === input.folders.arrival ? account.last_history_cursor : null,
      })
      .where('id', '=', input.accountId)
      .execute()

    await tx
      .insertInto('change_log')
      .values({
        user_id: account.user_id,
        actor_user_id: input.actorUserId,
        entity_type: 'account',
        entity_id: input.accountId,
        action: 'updated',
        before_json: JSON.stringify({ folders: settings.folders }),
        after_json: JSON.stringify({ folders: input.folders }),
        recorded_at: now,
      })
      .execute()
  })
}

/** Pause polling because the server refused the password (d-v4mejzw5). */
export async function pauseForRejectedCredential(db: Kysely<Database>, accountId: number): Promise<void> {
  await db
    .updateTable('accounts')
    .set({ paused_reason: PAUSED_CREDENTIAL_REJECTED })
    .where('id', '=', accountId)
    .where('deleted_at', 'is', null)
    .execute()
}

/** The live IMAP Account row, or a refusal naming why there is none. */
async function loadImapAccountRow(
  db: Kysely<Database>,
  accountId: number,
): Promise<{ user_id: number; settings_json: string; last_history_cursor: string | null }> {
  const row = await db
    .selectFrom('accounts')
    .select(['user_id', 'provider_type', 'settings_json', 'last_history_cursor'])
    .where('id', '=', accountId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()
  if (!row) {
    throw new ImapAccountNotFoundError(`account ${accountId} does not exist`)
  }
  if (row.provider_type !== IMAP_PROVIDER_TYPE) {
    throw new ImapAccountNotFoundError(`account ${accountId} is not an IMAP account`)
  }
  return row
}

/** An Account's stored settings and its decrypted password. */
export async function resolveImapCredentials(
  db: Kysely<Database>,
  encryptor: Encryptor,
  accountId: number,
): Promise<{ settings: ImapSettings; password: string }> {
  const account = await loadImapAccountRow(db, accountId)
  const credential = await db
    .selectFrom('credentials')
    .select(['data_enc'])
    .where('account_id', '=', accountId)
    .where('kind', '=', IMAP_PASSWORD_KIND)
    .where('deleted_at', 'is', null)
    .orderBy('id', 'desc')
    .executeTakeFirst()
  if (!credential) {
    throw new ImapAccountNotFoundError(`account ${accountId} holds no password`)
  }
  const payload = imapPasswordPayloadSchema.parse(JSON.parse(encryptor.decrypt(credential.data_enc).toString('utf8')))
  return { settings: parseImapSettings(account.settings_json), password: payload.password }
}

/**
 * Open a session for an Account from its stored credentials. Sessions are
 * serialized per Account by the daemon's connect wrapper (d-v55lpt3t); this is
 * the resolution half.
 */
export async function openSessionForAccount(
  db: Kysely<Database>,
  encryptor: Encryptor,
  accountId: number,
  connect: typeof openImapSession = openImapSession,
): Promise<ImapSession> {
  const { settings, password } = await resolveImapCredentials(db, encryptor, accountId)
  return connect(settings, password)
}
