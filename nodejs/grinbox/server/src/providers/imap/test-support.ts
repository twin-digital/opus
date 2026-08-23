/**
 * A fake {@link ImapSession} the IMAP tests drive. There is no IMAP fixture in
 * this repository — the dovecot container the planning repository keeps under
 * `evidence/imap/` is evidence tooling, not a suite — so the backend is tested
 * against its own session seam, with the protocol's behaviour written into this
 * fake from the facts: UIDs ascend within a folder (f-xbec6o46), a moved message
 * is identified afresh by its destination (f-1hjkefq3), and one fetch enumerates
 * a folder with every message's flags (f-q9yoqzit).
 */

import type {
  ImapFetchedMessage,
  ImapFolderEntry,
  ImapFolderListing,
  ImapFolderState,
  ImapMoveResult,
  ImapSession,
} from './imap-client.js'

/** One message the fake server holds. */
export interface FakeMessage {
  uid: number
  flags: string[]
  headers: Record<string, string>
  bodyText?: string
  bodyHtml?: string
}

/** One folder the fake server holds. */
export interface FakeFolder {
  uidValidity: number
  roles?: string[]
  permanentFlags?: string[]
  messages: FakeMessage[]
}

export interface FakeServer {
  capabilities: string[]
  folders: Record<string, FakeFolder>
}

/** A stock dovecot with MOVE, UIDPLUS, and an INBOX that admits keywords. */
export function fakeServer(overrides: Partial<FakeServer> = {}): FakeServer {
  return {
    capabilities: ['IMAP4rev1', 'MOVE', 'UIDPLUS', 'SPECIAL-USE'],
    folders: {
      INBOX: { uidValidity: 100, permanentFlags: ['\\Seen', '\\*'], messages: [] },
      Archive: { uidValidity: 200, roles: ['\\Archive'], permanentFlags: ['\\Seen', '\\*'], messages: [] },
      Trash: { uidValidity: 300, roles: ['\\Trash'], permanentFlags: ['\\Seen'], messages: [] },
      Junk: { uidValidity: 400, roles: ['\\Junk'], permanentFlags: ['\\Seen'], messages: [] },
    },
    ...overrides,
  }
}

/** A message with the headers a metadata fetch reads. */
export function fakeMessage(uid: number, headers: Record<string, string> = {}): FakeMessage {
  return { uid, flags: [], headers: { subject: `subject ${uid}`, from: 'a@x.com', ...headers } }
}

/** A session over `server`, recording what it was asked to do. */
export class FakeSession implements ImapSession {
  closed = false
  readonly moves: { from: string; uid: number; to: string }[] = []
  readonly keywords: { folder: string; uid: number; keyword: string }[] = []

  constructor(private readonly server: FakeServer) {}

  private folder(name: string): FakeFolder {
    const found = (this.server.folders as Partial<Record<string, FakeFolder>>)[name]
    if (!found) {
      throw new Error(`the fake server has no folder '${name}'`)
    }
    return found
  }

  capabilities(): Promise<readonly string[]> {
    return Promise.resolve(this.server.capabilities)
  }

  listFolders(): Promise<readonly ImapFolderListing[]> {
    return Promise.resolve(
      Object.entries(this.server.folders).map(([name, folder]) => ({ name, roles: folder.roles ?? [] })),
    )
  }

  selectFolder(folder: string): Promise<ImapFolderState> {
    const found = this.folder(folder)
    const uids = found.messages.map((m) => m.uid)
    return Promise.resolve({
      uidValidity: found.uidValidity,
      uidNext: (uids.length > 0 ? Math.max(...uids) : 0) + 1,
      permanentFlags: found.permanentFlags ?? [],
    })
  }

  uidsAbove(folder: string, afterUid: number): Promise<readonly number[]> {
    return Promise.resolve(
      this.folder(folder)
        .messages.map((m) => m.uid)
        .filter((uid) => uid > afterUid),
    )
  }

  fetchHeaders(folder: string, uids: readonly number[]): Promise<readonly ImapFetchedMessage[]> {
    return Promise.resolve(
      this.folder(folder)
        .messages.filter((m) => uids.includes(m.uid))
        .map((m) => ({ uid: m.uid, flags: m.flags, headers: m.headers })),
    )
  }

  fetchBody(folder: string, uid: number): Promise<{ bodyText: string | null; bodyHtml: string | null }> {
    const message = this.folder(folder).messages.find((m) => m.uid === uid)
    return Promise.resolve({ bodyText: message?.bodyText ?? null, bodyHtml: message?.bodyHtml ?? null })
  }

  enumerate(folder: string): Promise<readonly ImapFolderEntry[]> {
    return Promise.resolve(
      this.folder(folder).messages.map((m) => ({
        uid: m.uid,
        flags: m.flags,
        messageId: m.headers['message-id'] ?? null,
      })),
    )
  }

  findByMessageId(folder: string, messageId: string): Promise<readonly number[]> {
    return Promise.resolve(
      this.folder(folder)
        .messages.filter((m) => m.headers['message-id'] === messageId)
        .map((m) => m.uid),
    )
  }

  storeKeyword(folder: string, uid: number, keyword: string): Promise<void> {
    const message = this.folder(folder).messages.find((m) => m.uid === uid)
    if (!message) {
      throw new Error(`no message ${uid} in '${folder}'`)
    }
    message.flags.push(keyword)
    this.keywords.push({ folder, uid, keyword })
    return Promise.resolve()
  }

  move(folder: string, uid: number, destination: string): Promise<ImapMoveResult> {
    const source = this.folder(folder)
    const target = this.folder(destination)
    const index = source.messages.findIndex((m) => m.uid === uid)
    if (index < 0) {
      throw new Error(`no message ${uid} in '${folder}'`)
    }
    const moved = source.messages.splice(index, 1).at(0)
    if (!moved) {
      throw new Error('unreachable')
    }
    // A moved message is given a UID by its destination, under that folder's
    // own UIDVALIDITY (f-1hjkefq3).
    const landedUid = Math.max(0, ...target.messages.map((m) => m.uid)) + 1
    target.messages.push({ ...moved, uid: landedUid })
    this.moves.push({ from: folder, uid, to: destination })
    return Promise.resolve({ uidValidity: target.uidValidity, uid: landedUid })
  }

  close(): Promise<void> {
    this.closed = true
    return Promise.resolve()
  }
}
