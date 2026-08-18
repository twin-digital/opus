import type { Kysely } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDatabase } from '../db/connection.js'
import type { Database } from '../db/schema.js'
import { freshDb } from '../pipeline/test-helpers.js'
import { allCapabilities, capabilitiesFrom, serializeCapabilities } from '../providers/account-capabilities.js'
import { IMAP_PROVIDER_TYPE } from '../providers/imap/imap-settings.js'
import type { MailProviderRegistry, MailboxBackend, MailSenderBackend } from './provider-backends.js'
import {
  UnsupportedAccountOperationError,
  UnsupportedMailProviderError,
  mailSenderBackendFor,
  mailboxBackendFor,
} from './provider-backends.js'

const mailbox = {} as MailboxBackend
const mailSender = {} as MailSenderBackend
const registry: MailProviderRegistry = {
  mailbox: { gmail: mailbox, [IMAP_PROVIDER_TYPE]: mailbox },
  mail_sender: { gmail: mailSender },
}

describe("the mail-Resource dispatch reads the account's own declaration (d-bzw8qoiy)", () => {
  let db: Kysely<Database>

  beforeEach(async () => {
    db = await freshDb()
    await db.insertInto('users').values({ name: 'u', email: null, created_at: 0 }).execute()
  })
  afterEach(async () => {
    await closeDatabase(db)
  })

  async function seed(providerType: string, capabilitiesJson: string | null): Promise<number> {
    const row = await db
      .insertInto('accounts')
      .values({
        user_id: 1,
        name: 'a',
        icon: null,
        color: null,
        provider_type: providerType,
        active_pipeline_id: null,
        settings_json: '{}',
        last_polled_at: null,
        last_history_cursor: null,
        last_reconciled_at: null,
        capabilities_json: capabilitiesJson,
        paused_reason: null,
        created_at: 0,
        deleted_at: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    return row.id
  }

  it('dispatches an operation the account declared', async () => {
    const id = await seed('gmail', serializeCapabilities(allCapabilities(0)))
    await expect(mailboxBackendFor(db, registry, id, 'file')).resolves.toBe(mailbox)
  })

  it('fails the operation the account declared it cannot carry, naming why (d-qzxvoph1)', async () => {
    const declared = capabilitiesFrom(['apply_category'], { file: 'the server offers no safe move' }, 0)
    const id = await seed(IMAP_PROVIDER_TYPE, serializeCapabilities(declared))

    await expect(mailboxBackendFor(db, registry, id, 'apply_category')).resolves.toBe(mailbox)
    const failure = await mailboxBackendFor(db, registry, id, 'file').catch((e: unknown) => e)
    expect(failure).toBeInstanceOf(UnsupportedAccountOperationError)
    expect((failure as Error).message).toContain('the server offers no safe move')
  })

  it('refuses to send on an account that declared it cannot (d-5h66e3zl)', async () => {
    const declared = capabilitiesFrom(['apply_category'], { send_message: 'an IMAP account does not send' }, 0)
    const id = await seed('gmail', serializeCapabilities(declared))
    await expect(mailSenderBackendFor(db, registry, id)).rejects.toBeInstanceOf(UnsupportedAccountOperationError)
  })

  it('reports a backend that implements the Resource for no account at all', async () => {
    const id = await seed(IMAP_PROVIDER_TYPE, null)
    await expect(mailSenderBackendFor(db, registry, id)).rejects.toBeInstanceOf(UnsupportedMailProviderError)
  })

  it('attempts the operation on an account never polled, letting the backend refuse it', async () => {
    const id = await seed(IMAP_PROVIDER_TYPE, null)
    await expect(mailboxBackendFor(db, registry, id, 'archive')).resolves.toBe(mailbox)
  })
})
