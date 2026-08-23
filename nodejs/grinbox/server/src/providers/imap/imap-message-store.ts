/**
 * What the IMAP Provider reads back out of grinbox's own state: where a Message
 * was last seen, which Messages are held without an identity that survives a
 * move, and the thread a Message sits in.
 *
 * The Provider is otherwise pure with respect to the State DB — the poll loop
 * owns the writes. These reads exist because IMAP identity is grinbox's to keep:
 * the protocol gives no identifier that follows a message from one mailbox to
 * another (f-ubjw3f0i), so the location grinbox recorded is the only way back to
 * a message it already knows.
 */

import type { SourceState } from '@grinbox/shared'
import type { DB } from '../../db/schema.js'

/**
 * Read one header. The header map is typed `Record<string, string>` throughout
 * the Provider seam, which says every name is present; only the names the
 * message actually carries are. The view makes the lookup say so.
 */
export function headerValue(headers: Record<string, string>, name: string): string | undefined {
  return (headers as Partial<Record<string, string>>)[name]
}

/** Where a Message was last seen on the server (d-k4nt8zbu). */
export interface ImapLocation {
  readonly folder: string
  readonly uidValidity: number
  readonly uid: number
}

/** A Message grinbox holds whose identity does not survive a move. */
export interface UnidentifiedMessage {
  readonly backendMessageId: string
  readonly location: ImapLocation | null
  readonly state: SourceState
}

/**
 * A Message's place in its thread, derived from its own headers read against
 * the Messages grinbox already holds (d-q96iw28w).
 */
export interface ThreadPlacement {
  readonly backendThreadId: string | null
  readonly isReply: boolean
  readonly messageCount: number
}

/** The reads the IMAP Provider makes against grinbox's own record. */
export interface ImapMessageStore {
  locationOf(accountId: number, backendMessageId: string): Promise<ImapLocation | null>
  unidentified(accountId: number): Promise<readonly UnidentifiedMessage[]>
  placeInThread(accountId: number, headers: Record<string, string>): Promise<ThreadPlacement>
}

/**
 * The synthesized `backend_message_id` of a message carrying no Message-ID
 * header. It is taken in and triaged like any other (d-00smatg0); it is simply
 * not matched again once it moves, because the key names where it was rather
 * than what it is.
 */
export function locationKey(location: ImapLocation): string {
  return `imap-loc:${location.uidValidity}:${location.uid}:${location.folder}`
}

/** Whether `backendMessageId` is a synthesized location key rather than a Message-ID. */
export function isLocationKey(backendMessageId: string): boolean {
  return backendMessageId.startsWith('imap-loc:')
}

/**
 * The Message-IDs a message's `In-Reply-To` and `References` headers name, in
 * the order a thread root is looked for: References is ordered oldest first, so
 * its first entry is the closest thing to the root the message itself knows.
 */
export function referencedMessageIds(headers: Record<string, string>): string[] {
  const raw = `${headerValue(headers, 'references') ?? ''} ${headerValue(headers, 'in-reply-to') ?? ''}`
  const found = raw.match(/<[^<>]+>/g) ?? []
  const seen = new Set<string>()
  return found.filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
}

/** The State-DB-backed store the daemon wires in. */
export function makeImapMessageStore(db: DB): ImapMessageStore {
  return {
    async locationOf(accountId, backendMessageId) {
      const row = await db
        .selectFrom('messages')
        .select(['imap_folder', 'imap_uidvalidity', 'imap_uid'])
        .where('account_id', '=', accountId)
        .where('backend_message_id', '=', backendMessageId)
        .executeTakeFirst()
      if (!row?.imap_folder || row.imap_uidvalidity === null || row.imap_uid === null) {
        return null
      }
      return { folder: row.imap_folder, uidValidity: row.imap_uidvalidity, uid: row.imap_uid }
    },

    async unidentified(accountId) {
      const rows = await db
        .selectFrom('messages')
        .select(['backend_message_id', 'imap_folder', 'imap_uidvalidity', 'imap_uid', 'source_state'])
        .where('account_id', '=', accountId)
        .where('backend_message_id', 'like', 'imap-loc:%')
        .execute()
      return rows.map((row) => ({
        backendMessageId: row.backend_message_id,
        location:
          row.imap_folder && row.imap_uidvalidity !== null && row.imap_uid !== null ?
            { folder: row.imap_folder, uidValidity: row.imap_uidvalidity, uid: row.imap_uid }
          : null,
        state: row.source_state,
      }))
    },

    async placeInThread(accountId, headers) {
      const referenced = referencedMessageIds(headers)
      if (referenced.length === 0) {
        // Not a reply: the message is its own thread until something answers it.
        const own = headerValue(headers, 'message-id')?.trim()
        const threadId = own && own.length > 0 ? own : null
        return {
          backendThreadId: threadId,
          isReply: false,
          messageCount: threadId === null ? 1 : await countInThread(db, accountId, threadId),
        }
      }

      // The thread is the one a referenced message already sits in; failing
      // that, the oldest ancestor the headers name.
      const held = await db
        .selectFrom('messages')
        .select(['backend_message_id', 'backend_thread_id'])
        .where('account_id', '=', accountId)
        .where('backend_message_id', 'in', referenced)
        .execute()
      const byId = new Map(held.map((row) => [row.backend_message_id, row.backend_thread_id]))
      const threadId = referenced.map((id) => byId.get(id)).find((t) => t != null) ?? referenced.at(0) ?? null

      return {
        backendThreadId: threadId,
        isReply: true,
        messageCount: threadId === null ? 1 : (await countInThread(db, accountId, threadId)) + 1,
      }
    },
  }
}

/**
 * How many Messages grinbox holds in this thread for this Account (d-y3uh9ofx).
 * It counts what grinbox has, not what the server does.
 */
async function countInThread(db: DB, accountId: number, threadId: string): Promise<number> {
  const rows = await db
    .selectFrom('messages')
    .select('id')
    .where('account_id', '=', accountId)
    .where('backend_thread_id', '=', threadId)
    .execute()
  return rows.length
}
