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
import type { ImapLocation, ImapMessageStore } from './imap-message-store.js'
import { headerValue, isLocationKey, locationKey } from './imap-message-store.js'
import { type AccountFolders, parseImapSettings } from './imap-settings.js'

/** Opens a logged-in session for an Account, resolving its stored credential. */
export type OpenImapSession = (account: ProviderAccount) => Promise<ImapSession>

/** Deps the IMAP Provider closes over. */
export interface ImapProviderDeps {
  readonly openSession: OpenImapSession
  /** What grinbox already holds: locations, unidentified rows, thread placement. */
  readonly store: ImapMessageStore
  /** Unix seconds; injected so the capability read's `readAt` is deterministic. */
  readonly now: () => number
  /**
   * How many of the arrival folder's most recent messages a first poll takes,
   * and what a poll takes when the folder reports another UIDVALIDITY
   * (d-cepkyeoa). A bound rather than the whole folder, so adding an account
   * does not triage a decade of mail.
   */
  readonly firstPollWindow?: number
}

/** The default bound on a first poll's recent window. */
export const DEFAULT_FIRST_POLL_WINDOW = 200

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

/** Thrown when a Message grinbox holds cannot be found on the server. */
export class ImapMessageNotFoundError extends Error {
  override readonly name = 'ImapMessageNotFoundError'
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
      const found = new Set<string>()
      for (const folder of folderList(folders)) {
        const standing = standingOfFolder(folders, folder)
        for (const message of await session.enumerate(folder)) {
          const key =
            message.messageId ??
            locationKey({ folder, uidValidity: await uidValidityOf(session, folder), uid: message.uid })
          found.add(key)
          entries.push({ backendMessageId: key, state: standing })
        }
      }

      // A Message stored without a Message-ID is not matched again once it
      // moves (d-00smatg0). Reporting it with the standing grinbox last
      // recorded is what keeps that standing rather than reading the miss as a
      // departure.
      for (const held of await this.deps.store.unidentified(account.id)) {
        if (!found.has(held.backendMessageId)) {
          entries.push({ backendMessageId: held.backendMessageId, state: held.state })
        }
      }

      return { entries }
    } finally {
      await session.close()
    }
  }

  /**
   * Everything in the arrival folder above the cursor's UID (d-cepkyeoa,
   * f-xbec6o46). Where the folder reports another UIDVALIDITY the cursor names
   * nothing and the bounded recent window a first poll takes is used instead
   * (f-4i4xtwwj).
   *
   * The candidate ids are what the Messages will be stored under: a Message-ID
   * where the message carries one, and a synthesized location key where it does
   * not (d-00smatg0). IMAP has no incremental feed of standing changes — the
   * reconcile's snapshot is what heals them (d-gj8j4np0) — so a listing carries
   * no state deltas.
   */
  async listCandidates(account: ProviderAccount, cursor: string | null): Promise<CandidateListing> {
    const folders = foldersOf(account)
    const session = await this.deps.openSession(account)
    try {
      const arrival = await session.selectFolder(folders.arrival)
      const stored = parseImapCursor(cursor)
      const applies = cursorAppliesTo(stored, arrival.uidValidity)
      const window = this.deps.firstPollWindow ?? DEFAULT_FIRST_POLL_WINDOW
      const from = applies && stored ? stored.highestUid : Math.max(0, arrival.uidNext - 1 - window)

      const uids = [...(await session.uidsAbove(folders.arrival, from))].sort((a, b) => a - b)
      const fetched = await session.fetchHeaders(folders.arrival, uids)

      const backendMessageIds = fetched.map(
        (message) =>
          messageIdHeader(message.headers) ??
          locationKey({ folder: folders.arrival, uidValidity: arrival.uidValidity, uid: message.uid }),
      )
      const highest =
        uids.length > 0 ? Math.max(...uids)
        : applies && stored ? stored.highestUid
        : from
      return {
        backendMessageIds,
        newCursor: serializeImapCursor({ uidValidity: arrival.uidValidity, highestUid: highest }),
      }
    } finally {
      await session.close()
    }
  }

  /**
   * One Message normalized for ingestion. The stored location is tried first;
   * where it resolves to nothing the message is looked for by Message-ID across
   * the Account's four folders, and is found only where exactly one message
   * carries it (d-k4nt8zbu). A Message with no Message-ID is only ever where
   * grinbox recorded it.
   */
  async fetchMetadata(account: ProviderAccount, backendMessageId: string): Promise<FetchedMessage> {
    const folders = foldersOf(account)
    const session = await this.deps.openSession(account)
    try {
      const located = await this.locate(account, session, folders, backendMessageId)
      const message = (await session.fetchHeaders(located.folder, [located.uid])).at(0)
      if (!message) {
        throw new ImapMessageNotFoundError(`message '${backendMessageId}' was gone from '${located.folder}'`)
      }
      const thread = await this.deps.store.placeInThread(account.id, message.headers)
      return {
        backendMessageId,
        backendThreadId: thread.backendThreadId,
        from: headerValue(message.headers, 'from') ?? null,
        to: headerValue(message.headers, 'to') ?? null,
        subject: headerValue(message.headers, 'subject') ?? null,
        // IMAP supplies no preview of a message, so the snippet a
        // configuration reads is empty rather than derived (d-y3uh9ofx).
        snippet: null,
        receivedAt: parseHeaderDate(headerValue(message.headers, 'date')),
        headers: message.headers,
        bodyFetched: false,
        imapLocation: located,
      }
    } finally {
      await session.close()
    }
  }

  /** Store the Category as a keyword on the message (d-bl5oamiz). */
  async applyCategory(account: ProviderAccount, backendMessageId: string, category: Category): Promise<void> {
    const folders = foldersOf(account)
    const session = await this.deps.openSession(account)
    try {
      const located = await this.locate(account, session, folders, backendMessageId)
      await session.storeKeyword(located.folder, located.uid, category.name)
    } finally {
      await session.close()
    }
  }

  /**
   * Where the Message sits in its thread, from its own In-Reply-To and
   * References headers read against what grinbox holds (d-q96iw28w). The server
   * is asked for no threading of its own.
   */
  async threadMembership(account: ProviderAccount, backendMessageId: string): Promise<ThreadMembership> {
    const folders = foldersOf(account)
    const session = await this.deps.openSession(account)
    try {
      const located = await this.locate(account, session, folders, backendMessageId)
      const message = (await session.fetchHeaders(located.folder, [located.uid])).at(0)
      const placement = await this.deps.store.placeInThread(account.id, message?.headers ?? {})
      return {
        backendThreadId: placement.backendThreadId,
        isReply: placement.isReply,
        messageCount: placement.messageCount,
      }
    } finally {
      await session.close()
    }
  }

  /**
   * Resolve a Message to where it is now: the stored location where it still
   * holds, else a Message-ID search across the four folders that succeeds only
   * where exactly one message carries it (d-k4nt8zbu).
   */
  private async locate(
    account: ProviderAccount,
    session: ImapSession,
    folders: AccountFolders,
    backendMessageId: string,
  ): Promise<ImapLocation> {
    const stored = await this.deps.store.locationOf(account.id, backendMessageId)
    if (stored) {
      const state = await session.selectFolder(stored.folder)
      if (state.uidValidity === stored.uidValidity) {
        const present = await session.fetchHeaders(stored.folder, [stored.uid])
        if (present.length === 1) {
          return stored
        }
      }
    }

    if (isLocationKey(backendMessageId)) {
      throw new ImapMessageNotFoundError(
        `message '${backendMessageId}' carries no Message-ID, so it cannot be found once it moves`,
      )
    }

    const matches: ImapLocation[] = []
    for (const folder of folderList(folders)) {
      const state = await session.selectFolder(folder)
      for (const uid of await session.findByMessageId(folder, backendMessageId)) {
        matches.push({ folder, uidValidity: state.uidValidity, uid })
      }
    }
    const only = matches.length === 1 ? matches[0] : undefined
    if (!only) {
      throw new ImapMessageNotFoundError(
        matches.length === 0 ?
          `no message in the account carries Message-ID '${backendMessageId}'`
        : `${matches.length} messages carry Message-ID '${backendMessageId}', so none of them is it`,
      )
    }
    return only
  }
}

/** The four folders, in the order the snapshot and a search read them. */
export function folderList(folders: AccountFolders): string[] {
  return [folders.arrival, folders.archived, folders.trashed, folders.spam]
}

/** The message's own `Message-ID`, angle brackets and all, or null. */
function messageIdHeader(headers: Record<string, string>): string | null {
  const raw = headerValue(headers, 'message-id')?.trim()
  return raw !== undefined && raw.length > 0 ? raw : null
}

/** The folder's UIDVALIDITY, from the select the enumerate already did. */
async function uidValidityOf(session: ImapSession, folder: string): Promise<number> {
  return (await session.selectFolder(folder)).uidValidity
}

/** A `Date` header as Unix seconds, or null where it is absent or unreadable. */
export function parseHeaderDate(raw: string | undefined): number | null {
  if (raw === undefined) {
    return null
  }
  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000)
}

/** The Account's four folders, read from its stored settings. */
function foldersOf(account: ProviderAccount): AccountFolders {
  return parseImapSettings(account.settingsJson).folders
}
