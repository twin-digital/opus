/**
 * The provider dispatch seam for the mail Resources. The `mailbox` and
 * `mail_sender` Resources are backend-neutral: each operation is routed to the
 * implementation for the Account's `provider_type`. A provider implements a
 * Resource by supplying a backend object here; not every provider implements
 * both (Gmail does; an IMAP provider would implement only `mailbox`, an SMTP
 * sender only `mail_sender`).
 *
 * Adding a provider is additive: write its backend module (see
 * `gmail-backend.ts`) and register it in {@link buildMailProviderRegistry}. No
 * call site changes — dispatch resolves the Account's `provider_type` per
 * operation and looks the backend up in the registry.
 *
 * Whether a given Account can carry an operation is a second question, answered
 * by the declaration that Account's backend made at its last poll (d-bzw8qoiy):
 * two IMAP accounts of one server differ. A configuration is never refused for
 * naming an operation some account cannot carry (d-qzxvoph1) — the gap is met
 * here, as a failed run naming what the account cannot do and why.
 *
 * A backend implements only the operations an execution path invokes as the
 * Account (`apply_category`, `archive`, `file`, `fetch_body`, `send_message`).
 * The remaining declared `mailbox` operations (`fetch_metadata`,
 * `list_messages`) have no Operator that invokes them through this seam — the
 * poll path talks to its Provider directly — so they stay "not configured" stubs
 * in `underlying-clients.ts` and are not part of the backend interface.
 */

import type { DB } from '../db/schema.js'
import type {
  MailSendArgs,
  MailboxApplyCategoryArgs,
  MailboxArchiveArgs,
  MailboxBodyResult,
  MailboxFetchArgs,
  MailboxFileArgs,
} from '../operators/types.js'
import type { AccountCapabilities, AccountCapability } from '../providers/account-capabilities.js'
import { parseCapabilities, unsupportedReason } from '../providers/account-capabilities.js'
import type { OpenImapSession } from '../providers/imap/imap-provider.js'
import { IMAP_PROVIDER_TYPE } from '../providers/imap/imap-settings.js'
import { gmailMailSenderBackend, gmailMailboxBackend } from './gmail-backend.js'
import { imapMailboxBackend } from './imap-backend.js'
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
  /**
   * Move the Message into the named folder of the Account (d-jj2mymbi). The
   * folder is matched against the names the backend lists, character for
   * character (d-k8va629q); where the Account has no folder of that name the
   * operation fails, and grinbox creates none (r-g1iwlbzs).
   */
  file(accountId: number, args: MailboxFileArgs, signal: AbortSignal): Promise<{ filed: boolean }>
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

/** Deps the provider backends close over (superset of every backend's needs). */
export interface MailProviderRegistryDeps extends GmailBackendDeps {
  /**
   * Opens a logged-in IMAP session for an Account. Absent until the IMAP
   * transport is wired, which leaves an IMAP Account's `mailbox` operations
   * unimplemented — the graceful per-op failure, never a crash.
   */
  readonly openImapSession?: OpenImapSession
}

/**
 * Build the registry of live mail-Resource backends. An IMAP Account implements
 * `mailbox` alone: it does not send (d-5h66e3zl).
 */
export function buildMailProviderRegistry(deps: MailProviderRegistryDeps): MailProviderRegistry {
  const mailbox: Record<string, MailboxBackend> = { gmail: gmailMailboxBackend(deps) }
  if (deps.openImapSession) {
    mailbox[IMAP_PROVIDER_TYPE] = imapMailboxBackend({ db: deps.db, openSession: deps.openImapSession })
  }
  return {
    mailbox,
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

/**
 * Thrown when the Account's stored declaration says it cannot carry the
 * operation (d-bzw8qoiy). The configuration was never refused for naming it
 * (d-qzxvoph1), so the gap is met here: the Operator's run fails on this
 * Account, naming what the Account cannot do and why.
 */
export class UnsupportedAccountOperationError extends Error {
  override readonly name = 'UnsupportedAccountOperationError'

  constructor(
    readonly capability: AccountCapability,
    reason: string,
  ) {
    super(`this account cannot ${capability}: ${reason}`)
  }
}

/** The Account row fields the mail-Resource dispatch reads. */
async function accountFor(
  db: DB,
  accountId: number,
): Promise<{ providerType: string; capabilities: AccountCapabilities | null }> {
  const row = await db
    .selectFrom('accounts')
    .select(['provider_type', 'capabilities_json'])
    .where('id', '=', accountId)
    .executeTakeFirst()
  if (!row) {
    throw new Error(`account ${accountId} not found for mail-Resource dispatch`)
  }
  return { providerType: row.provider_type, capabilities: parseCapabilities(row.capabilities_json) }
}

/**
 * Fail the run where the Account's stored declaration does not admit
 * `capability`. An Account never polled has no declaration; the operation is
 * attempted and the backend's own refusal is what fails it, so a first poll is
 * not a prerequisite for acting.
 */
function requireCapability(capabilities: AccountCapabilities | null, capability: AccountCapability): void {
  if (capabilities === null) {
    return
  }
  const reason = unsupportedReason(capabilities, capability)
  if (reason !== null) {
    throw new UnsupportedAccountOperationError(capability, reason)
  }
}

/**
 * Look up the Account's `mailbox` backend, checking the Account's own
 * declaration for the operation about to be dispatched.
 */
export async function mailboxBackendFor(
  db: DB,
  registry: MailProviderRegistry,
  accountId: number,
  capability?: AccountCapability,
): Promise<MailboxBackend> {
  const { providerType, capabilities } = await accountFor(db, accountId)
  const backend = registry.mailbox[providerType]
  if (!backend) {
    throw new UnsupportedMailProviderError('mailbox', providerType)
  }
  if (capability) {
    requireCapability(capabilities, capability)
  }
  return backend
}

/** Look up the Account's `mail_sender` backend, checking its declaration. */
export async function mailSenderBackendFor(
  db: DB,
  registry: MailProviderRegistry,
  accountId: number,
): Promise<MailSenderBackend> {
  const { providerType, capabilities } = await accountFor(db, accountId)
  const backend = registry.mail_sender[providerType]
  if (!backend) {
    throw new UnsupportedMailProviderError('mail_sender', providerType)
  }
  requireCapability(capabilities, 'send_message')
  return backend
}
