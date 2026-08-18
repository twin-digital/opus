import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeEncryptor } from '../crypto/encryption.js'
import { closeDatabase } from '../db/connection.js'
import type { Database } from '../db/schema.js'
import { freshDb } from '../pipeline/test-helpers.js'
import { IMAP_PASSWORD_KIND, IMAP_PROVIDER_TYPE, parseImapSettings } from '../providers/imap/imap-settings.js'
import {
  ImapAccountNotFoundError,
  PAUSED_CREDENTIAL_REJECTED,
  createImapAccount,
  pauseForRejectedCredential,
  repairImapAccount,
  repointImapFolders,
  resolveImapCredentials,
} from './imap-account.js'

const encryptor = makeEncryptor(Buffer.alloc(32, 7))

const CONNECTION = { host: 'mail.example.com', port: 993, security: 'tls' as const, username: 'u' }
const FOLDERS = { arrival: 'INBOX', archived: 'Archive', trashed: 'Trash', spam: 'Junk' }

describe('the IMAP account store', () => {
  let db: Kysely<Database>

  beforeEach(async () => {
    db = await freshDb()
    await db.insertInto('users').values({ name: 'u', email: null, created_at: 0 }).execute()
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  function create() {
    return createImapAccount(
      db,
      encryptor,
      {
        userId: 1,
        actorUserId: 1,
        name: 'work',
        settings: { ...CONNECTION, address: 'u@example.com', folders: FOLDERS },
        password: 'the-password',
      },
      100,
    )
  }

  it('creates the account with its backend, settings, and credential (d-8jc4taom, d-ioso3voc)', async () => {
    const id = await create()

    const account = await db.selectFrom('accounts').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    expect(account.provider_type).toBe(IMAP_PROVIDER_TYPE)
    expect(account.paused_reason).toBeNull()
    expect(parseImapSettings(account.settings_json)).toMatchObject({ ...CONNECTION, folders: FOLDERS })

    const resolved = await resolveImapCredentials(db, encryptor, id)
    expect(resolved.password).toBe('the-password')
  })

  it('stores no password in the clear, and none in the audit trail (r-p2djwgjn, d-8yht1ei9)', async () => {
    const id = await create()

    const credential = await db
      .selectFrom('credentials')
      .select(['data_enc', 'kind'])
      .where('account_id', '=', id)
      .executeTakeFirstOrThrow()
    expect(credential.kind).toBe(IMAP_PASSWORD_KIND)
    expect(credential.data_enc.toString('utf8')).not.toContain('the-password')

    const audit = await db.selectFrom('change_log').select(['after_json', 'before_json']).execute()
    for (const row of audit) {
      expect(`${row.after_json ?? ''}${row.before_json ?? ''}`).not.toContain('the-password')
    }
  })

  it('restates the whole connection on repair and resumes polling (d-r3ogwkv7, d-v4mejzw5)', async () => {
    const id = await create()
    await pauseForRejectedCredential(db, id)
    expect(
      (await db.selectFrom('accounts').select('paused_reason').where('id', '=', id).executeTakeFirstOrThrow())
        .paused_reason,
    ).toBe(PAUSED_CREDENTIAL_REJECTED)

    await repairImapAccount(
      db,
      encryptor,
      {
        accountId: id,
        actorUserId: 1,
        connection: { host: 'mail2.example.com', port: 143, security: 'starttls', username: 'u2' },
        password: 'the-new-password',
      },
      200,
    )

    const account = await db.selectFrom('accounts').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    expect(account.paused_reason).toBeNull()
    expect(account.provider_type).toBe(IMAP_PROVIDER_TYPE)
    const settings = parseImapSettings(account.settings_json)
    expect(settings).toMatchObject({ host: 'mail2.example.com', port: 143, security: 'starttls', username: 'u2' })
    // Repair fixes how grinbox reaches the mailbox, not which mailbox it is.
    expect(settings.folders).toEqual(FOLDERS)

    const resolved = await resolveImapCredentials(db, encryptor, id)
    expect(resolved.password).toBe('the-new-password')
  })

  it('leaves exactly one live credential after a repair', async () => {
    const id = await create()
    await repairImapAccount(
      db,
      encryptor,
      { accountId: id, actorUserId: 1, connection: CONNECTION, password: 'second' },
      200,
    )

    const live = await db
      .selectFrom('credentials')
      .select('id')
      .where('account_id', '=', id)
      .where('deleted_at', 'is', null)
      .execute()
    expect(live).toHaveLength(1)
  })

  it('re-points folders and keeps what was recorded (d-8pdx8qsd)', async () => {
    const id = await create()
    await db.updateTable('accounts').set({ last_history_cursor: '100:5' }).where('id', '=', id).execute()

    await repointImapFolders(
      db,
      { accountId: id, actorUserId: 1, folders: { ...FOLDERS, archived: 'Archived Mail' } },
      200,
    )

    const account = await db.selectFrom('accounts').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    expect(parseImapSettings(account.settings_json).folders.archived).toBe('Archived Mail')
    // The arrival folder is unchanged, so the cursor still names something.
    expect(account.last_history_cursor).toBe('100:5')
  })

  it('starts the cursor over when the arrival folder is re-pointed (d-cepkyeoa)', async () => {
    const id = await create()
    await db.updateTable('accounts').set({ last_history_cursor: '100:5' }).where('id', '=', id).execute()

    await repointImapFolders(db, { accountId: id, actorUserId: 1, folders: { ...FOLDERS, arrival: 'INBOX.New' } }, 200)

    const account = await db.selectFrom('accounts').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
    expect(account.last_history_cursor).toBeNull()
  })

  it('refuses to touch an account of another backend (d-oevikmal)', async () => {
    const gmail = await db
      .insertInto('accounts')
      .values({
        user_id: 1,
        name: 'g',
        icon: null,
        color: null,
        provider_type: 'gmail',
        active_pipeline_id: null,
        settings_json: '{}',
        last_polled_at: null,
        last_history_cursor: null,
        last_reconciled_at: null,
        capabilities_json: null,
        paused_reason: null,
        created_at: 0,
        deleted_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    await expect(
      repairImapAccount(db, encryptor, {
        accountId: gmail.id,
        actorUserId: 1,
        connection: CONNECTION,
        password: 'p',
      }),
    ).rejects.toBeInstanceOf(ImapAccountNotFoundError)
  })
})
