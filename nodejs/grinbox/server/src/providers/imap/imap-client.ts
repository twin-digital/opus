/**
 * The injected IMAP client seam — the thin async interface the IMAP Provider and
 * the IMAP resource backend depend on, so both are unit-testable against a fake
 * and drop onto a real transport without code change. The same shape the Gmail
 * Provider takes for `GmailProviderClient`.
 *
 * A session is one connection: grinbox opens it when a poll comes due and closes
 * it when the poll finishes (d-p82gksff), and holds at most one open per Account
 * at a time (d-v55lpt3t). The server's certificate is verified and nothing
 * waives it (d-lru4i8rp).
 */

import type { ImapAccountSettings } from './imap-settings.js'

/** One folder the server listed, with the roles it advertises for it. */
export interface ImapFolderListing {
  /** The folder's name, as the server spelled it (d-k8va629q). */
  readonly name: string
  /**
   * The special-use roles the server advertises for the folder — `\Archive`,
   * `\Junk`, `\Trash`, `\Sent`, `\Drafts` (f-ymu94ntb). Empty where it
   * advertises none, which a stock dovecot does for archive (f-yj818owe).
   */
  readonly roles: readonly string[]
}

/** What selecting a folder reports. */
export interface ImapFolderState {
  readonly uidValidity: number
  readonly uidNext: number
  /** The folder's PERMANENTFLAGS, `\*` included where it admits new keywords. */
  readonly permanentFlags: readonly string[]
}

/** One message a fetch returned. */
export interface ImapFetchedMessage {
  readonly uid: number
  readonly flags: readonly string[]
  /** Lowercased header name → value. */
  readonly headers: Record<string, string>
}

/** One message a whole-folder flag fetch returned (f-q9yoqzit). */
export interface ImapFolderEntry {
  readonly uid: number
  readonly flags: readonly string[]
  /** The message's Message-ID header — what identifies it across folders. */
  readonly messageId: string | null
}

/** Where a moved message landed, when the server reported it (f-np5bnzew). */
export interface ImapMoveResult {
  readonly uidValidity: number | null
  readonly uid: number | null
}

/**
 * The error a session throws when the server refused the login and said the
 * credential is what it refused — an `AUTHENTICATIONFAILED` response code
 * (f-x53bztdj). It is the one refusal that pauses the Account (d-v4mejzw5);
 * every other failure leaves the Account as it is, retried at its next poll.
 */
export class ImapCredentialRejectedError extends Error {
  override readonly name = 'ImapCredentialRejectedError'
}

/** One connection to an Account's server, logged in. */
export interface ImapSession {
  /** The capabilities the server advertised — `MOVE`, `UIDPLUS` among them. */
  capabilities(): Promise<readonly string[]>
  /** Every folder the account holds, with its advertised roles. */
  listFolders(): Promise<readonly ImapFolderListing[]>
  /** Select a folder and report its UIDVALIDITY, UIDNEXT, and permanent flags. */
  selectFolder(folder: string): Promise<ImapFolderState>
  /** UIDs in `folder` strictly above `afterUid` (f-xbec6o46). */
  uidsAbove(folder: string, afterUid: number): Promise<readonly number[]>
  /** Headers for the named UIDs, without marking anything seen (d-mtgha4ra). */
  fetchHeaders(folder: string, uids: readonly number[]): Promise<readonly ImapFetchedMessage[]>
  /** The text and HTML parts of one message, again without marking it seen. */
  fetchBody(folder: string, uid: number): Promise<{ bodyText: string | null; bodyHtml: string | null }>
  /** Every message in `folder` with its flags and Message-ID, in one fetch. */
  enumerate(folder: string): Promise<readonly ImapFolderEntry[]>
  /** The UIDs in `folder` whose Message-ID header is `messageId`. */
  findByMessageId(folder: string, messageId: string): Promise<readonly number[]>
  /** Store a client-defined keyword on a message. */
  storeKeyword(folder: string, uid: number, keyword: string): Promise<void>
  /**
   * Move a message to `destination` — by the server's own MOVE where it
   * advertises one, otherwise by a copy followed by an expunge naming that
   * message's UID alone (d-8am29x25, f-yawjn42g, f-np5bnzew).
   */
  move(folder: string, uid: number, destination: string): Promise<ImapMoveResult>
  close(): Promise<void>
}

/**
 * Opens a session against an Account's server. The live implementation verifies
 * the certificate; a test passes a fake.
 */
export type ImapConnect = (connection: ImapAccountSettings, password: string) => Promise<ImapSession>
