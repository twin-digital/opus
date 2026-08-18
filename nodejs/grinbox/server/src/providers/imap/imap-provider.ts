/**
 * The IMAP {@link Provider} — the poll seam for an account reachable by nothing
 * but IMAP and a password of the user's own (r-5wpns28x). Every IMAP-specific
 * quirk lives here; the seam stays backend-neutral.
 *
 * **Injected session seam.** This module never opens a socket. It depends on
 * {@link OpenImapSession}, which resolves the Account's stored connection and
 * password and hands back a logged-in {@link ImapSession}. Grinbox opens one
 * when a poll comes due and closes it when the poll finishes (d-p82gksff), and
 * holds at most one per Account at a time (d-v55lpt3t).
 *
 * **Identity.** A message's `backend_message_id` is its Message-ID header, which
 * follows it across folders; where it currently is — folder, that folder's
 * UIDVALIDITY, and its UID there — is stored beside it and rewritten on every
 * move (d-k4nt8zbu). Where the stored location resolves to nothing, the message
 * is looked for by Message-ID across the Account's four folders and is found
 * only where exactly one message carries it.
 *
 * **Cursor.** The Account's cursor is its arrival folder's UIDVALIDITY together
 * with the highest UID taken in, and a poll asks for everything above that UID
 * (d-cepkyeoa, f-xbec6o46). Where the folder reports another UIDVALIDITY the
 * cursor names nothing and the next poll takes the bounded recent window a first
 * poll takes (f-4i4xtwwj).
 */

import type { AccountCapabilities } from '../account-capabilities.js'
import type {
  CandidateListing,
  Category,
  FetchedMessage,
  MailboxSnapshot,
  Provider,
  ProviderAccount,
  SnapshotEntry,
  ThreadMembership,
} from '../provider.js'
import type { ImapSession } from './imap-client.js'
import { imapCapabilities } from './imap-capabilities.js'
import { standingOfFolder } from './imap-folders.js'
import { type ImapFolders, parseImapSettings } from './imap-settings.js'

/** Opens a logged-in session for an Account, resolving its stored credential. */
export type OpenImapSession = (account: ProviderAccount) => Promise<ImapSession>

/** Deps the IMAP Provider closes over. */
export interface ImapProviderDeps {
  readonly openSession: OpenImapSession
  /** Unix seconds; injected so the capability read's `readAt` is deterministic. */
  readonly now: () => number
}

/**
 * The IMAP cursor: the arrival folder's UIDVALIDITY and the highest UID taken in
 * (d-cepkyeoa). Serialized into `accounts.last_history_cursor` as
 * `"<uidvalidity>:<uid>"`.
 */
export interface ImapCursor {
  readonly uidValidity: number
  readonly highestUid: number
}

/** Serialize a cursor for `accounts.last_history_cursor`. */
export function serializeImapCursor(cursor: ImapCursor): string {
  return `${cursor.uidValidity}:${cursor.highestUid}`
}

/** Parse a stored cursor; a malformed or absent one names nothing. */
export function parseImapCursor(raw: string | null): ImapCursor | null {
  if (!raw) {
    return null
  }
  const [validity, uid] = raw.split(':')
  const uidValidity = Number(validity)
  const highestUid = Number(uid)
  if (!Number.isInteger(uidValidity) || !Number.isInteger(highestUid)) {
    return null
  }
  return { uidValidity, highestUid }
}

/**
 * A stored cursor is usable only against the UIDVALIDITY it was taken under
 * (f-4i4xtwwj). Where the folder reports another, the cursor names nothing.
 */
export function cursorAppliesTo(cursor: ImapCursor | null, uidValidity: number): boolean {
  return cursor !== null && cursor.uidValidity === uidValidity
}

class NotImplementedYet extends Error {
  constructor(what: string) {
    super(`the IMAP backend's ${what} is not implemented yet`)
    this.name = 'NotImplementedYet'
  }
}

export class ImapProvider implements Provider {
  constructor(private readonly deps: ImapProviderDeps) {}

  /**
   * Read what this Account supports from the server's capabilities and its
   * arrival folder's permanent flags (d-bzw8qoiy). The poll loop stores the
   * result; everything else reads what was stored.
   */
  async declareCapabilities(account: ProviderAccount): Promise<AccountCapabilities> {
    const folders = foldersOf(account)
    const session = await this.deps.openSession(account)
    try {
      const capabilities = await session.capabilities()
      const arrival = await session.selectFolder(folders.arrival)
      return imapCapabilities(capabilities, arrival.permanentFlags, this.deps.now())
    } finally {
      await session.close()
    }
  }

  /**
   * The whole-mailbox snapshot the reconcile reads (d-cd0jnrdj): every message
   * in each of the Account's four folders, each reported with the standing that
   * folder gives it (d-qstpa7y0). One fetch enumerates a folder (f-q9yoqzit).
   * A message carrying no Message-ID cannot be matched to a stored row and is
   * left out — the snapshot names what it found.
   */
  async snapshot(account: ProviderAccount): Promise<MailboxSnapshot> {
    const folders = foldersOf(account)
    const session = await this.deps.openSession(account)
    try {
      const entries: SnapshotEntry[] = []
      for (const folder of [folders.arrival, folders.archived, folders.trashed, folders.spam]) {
        for (const message of await session.enumerate(folder)) {
          if (message.messageId !== null) {
            entries.push({ backendMessageId: message.messageId, state: standingOfFolder(folders, folder) })
          }
        }
      }
      return { entries }
    } finally {
      await session.close()
    }
  }

  listCandidates(_account: ProviderAccount, _cursor: string | null): Promise<CandidateListing> {
    throw new NotImplementedYet('candidate discovery')
  }

  fetchMetadata(_account: ProviderAccount, _backendMessageId: string): Promise<FetchedMessage> {
    throw new NotImplementedYet('metadata fetch')
  }

  applyCategory(_account: ProviderAccount, _backendMessageId: string, _category: Category): Promise<void> {
    throw new NotImplementedYet('category application')
  }

  threadMembership(_account: ProviderAccount, _backendMessageId: string): Promise<ThreadMembership> {
    throw new NotImplementedYet('thread placement')
  }
}

/** The Account's four folders, read from its stored settings. */
function foldersOf(account: ProviderAccount): ImapFolders {
  return parseImapSettings(account.settingsJson).folders
}
