/**
 * The provider dispatch seam for the mail Resources. The `mailbox` and
 * `mail_sender` Resources are backend-neutral: each operation is routed to the
 * implementation for the Account's `provider_type`. A provider implements a
 * Resource by supplying a backend object here; not every provider implements
 * both (Gmail does; an IMAP provider would implement only `mailbox`, an SMTP
 * sender only `mail_sender`).
 *
 * Adding a provider is additive: write its backend module (see
 * `gmail-backend.ts`) and register it in {@link buildMailProviderRegistry} +
 * {@link MAIL_PROVIDER_CAPABILITIES}. No call site changes — dispatch resolves
 * the Account's `provider_type` per operation and looks the backend up in the
 * registry.
 *
 * A backend implements only the operations an execution path invokes as the
 * Account (`apply_category`, `archive`, `fetch_body`, `send_message`). The
 * remaining declared `mailbox` operations (`fetch_metadata`, `list_messages`)
 * have no Operator that invokes them through this seam — the poll path talks to
 * its Provider directly — so they stay "not configured" stubs in
 * `underlying-clients.ts` and are not part of the backend interface.
 */

import type { DB } from '../db/schema.js'
import type {
  MailSendArgs,
  MailboxApplyCategoryArgs,
  MailboxArchiveArgs,
  MailboxBodyResult,
  MailboxFetchArgs,
} from '../operators/types.js'
import { gmailMailSenderBackend, gmailMailboxBackend } from './gmail-backend.js'
import type { GmailBackendDeps } from './gmail-backend.js'

/**
 * One provider's implementation of the `mailbox` Resource operations invoked
 * through the execution seam. Each method authenticates as the given Account
 * and performs one underlying call (no Limit check, retry, or metering — the
 * metering layer owns those).
 */
export interface MailboxBackend {
  apply_category(accountId: number, args: MailboxApplyCategoryArgs, signal: AbortSignal): Promise<{ applied: boolean }>
  archive(accountId: number, args: MailboxArchiveArgs, signal: AbortSignal): Promise<{ archived: boolean }>
  fetch_body(accountId: number, args: MailboxFetchArgs, signal: AbortSignal): Promise<MailboxBodyResult>
}

/** One provider's implementation of the `mail_sender` Resource. */
export interface MailSenderBackend {
  send_message(accountId: number, args: MailSendArgs, signal: AbortSignal): Promise<{ message_id: string }>
}

/**
 * The mail-Resource backends available per `provider_type`. Absence means the
 * provider does not implement that Resource — an operation dispatched to it
 * fails that run gracefully ({@link UnsupportedMailProviderError}).
 */
export interface MailProviderRegistry {
  readonly mailbox: Readonly<Partial<Record<string, MailboxBackend>>>
  readonly mail_sender: Readonly<Partial<Record<string, MailSenderBackend>>>
}

/**
 * Which mail Resources each known `provider_type` implements. The declarative
 * companion to {@link buildMailProviderRegistry} — the seam for validating a
 * configuration up front (e.g. rejecting an Operator whose Resource no Account
 * provider implements) rather than failing at dispatch time.
 */
export const MAIL_PROVIDER_CAPABILITIES: Readonly<Record<string, readonly ('mailbox' | 'mail_sender')[]>> = {
  gmail: ['mailbox', 'mail_sender'],
}

/** Deps the provider backends close over (superset of every backend's needs). */
export type MailProviderRegistryDeps = GmailBackendDeps

/** Build the registry of live mail-Resource backends. */
export function buildMailProviderRegistry(deps: MailProviderRegistryDeps): MailProviderRegistry {
  return {
    mailbox: { gmail: gmailMailboxBackend(deps) },
    mail_sender: { gmail: gmailMailSenderBackend(deps) },
  }
}

/**
 * Thrown when an operation is dispatched to a provider that does not implement
 * the Resource. Fails the Operator run gracefully (the daemon never crashes),
 * like every other per-op failure.
 */
export class UnsupportedMailProviderError extends Error {
  override readonly name = 'UnsupportedMailProviderError'

  constructor(resource: 'mailbox' | 'mail_sender', providerType: string) {
    super(`provider '${providerType}' does not implement the '${resource}' Resource`)
  }
}

/** Resolve the Account's `provider_type`; unknown Account ids throw. */
async function providerTypeOf(db: DB, accountId: number): Promise<string> {
  const row = await db.selectFrom('accounts').select(['provider_type']).where('id', '=', accountId).executeTakeFirst()
  if (!row) {
    throw new Error(`account ${accountId} not found for mail-Resource dispatch`)
  }
  return row.provider_type
}

/** Look up the Account's `mailbox` backend by its `provider_type`. */
export async function mailboxBackendFor(
  db: DB,
  registry: MailProviderRegistry,
  accountId: number,
): Promise<MailboxBackend> {
  const providerType = await providerTypeOf(db, accountId)
  const backend = registry.mailbox[providerType]
  if (!backend) {
    throw new UnsupportedMailProviderError('mailbox', providerType)
  }
  return backend
}

/** Look up the Account's `mail_sender` backend by its `provider_type`. */
export async function mailSenderBackendFor(
  db: DB,
  registry: MailProviderRegistry,
  accountId: number,
): Promise<MailSenderBackend> {
  const providerType = await providerTypeOf(db, accountId)
  const backend = registry.mail_sender[providerType]
  if (!backend) {
    throw new UnsupportedMailProviderError('mail_sender', providerType)
  }
  return backend
}
