/**
 * The IMAP resource backend — the `mailbox` operations an Operator's declared
 * operations reach (d-x3aqw6up). An IMAP Account implements `mailbox` and never
 * `mail_sender`: it does not send (d-5h66e3zl).
 *
 * Archiving and filing both move the message out of the arrival folder, by the
 * server's own move where it advertises one and otherwise by a copy followed by
 * an expunge naming that message's UID alone (d-8am29x25). An archive moves the
 * message only where it is still in the arrival folder; found anywhere else it is
 * left where it is and recorded as having already departed (d-661z414c). Reads
 * never mark a message seen and no flag of the user's is set or cleared — the
 * keywords categories name are the only flags written (d-mtgha4ra).
 */

import type { DB } from '../db/schema.js'
import type {
  MailboxApplyCategoryArgs,
  MailboxArchiveArgs,
  MailboxBodyResult,
  MailboxFetchArgs,
  MailboxFileArgs,
} from '../operators/types.js'
import type { OpenImapSession } from '../providers/imap/imap-provider.js'
import type { MailboxBackend } from './provider-backends.js'

/** Deps the IMAP resource backend closes over. */
export interface ImapBackendDeps {
  readonly db: DB
  readonly openSession: OpenImapSession
}

class NotImplementedYet extends Error {
  constructor(op: string) {
    super(`the IMAP backend's '${op}' is not implemented yet`)
    this.name = 'NotImplementedYet'
  }
}

/** IMAP's `mailbox` backend. */
export function imapMailboxBackend(_deps: ImapBackendDeps): MailboxBackend {
  return {
    apply_category(_accountId: number, _args: MailboxApplyCategoryArgs, _signal: AbortSignal) {
      throw new NotImplementedYet('mailbox.apply_category')
    },
    archive(_accountId: number, _args: MailboxArchiveArgs, _signal: AbortSignal) {
      throw new NotImplementedYet('mailbox.archive')
    },
    file(_accountId: number, _args: MailboxFileArgs, _signal: AbortSignal) {
      throw new NotImplementedYet('mailbox.file')
    },
    fetch_body(_accountId: number, _args: MailboxFetchArgs, _signal: AbortSignal): Promise<MailboxBodyResult> {
      throw new NotImplementedYet('mailbox.fetch_body')
    },
  }
}
