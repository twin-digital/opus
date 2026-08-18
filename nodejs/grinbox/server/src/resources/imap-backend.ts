/**
 * The IMAP resource backend — the `mailbox` operations an Operator's declared
 * operations reach (d-x3aqw6up). An IMAP Account implements `mailbox` alone: it
 * does not send (d-5h66e3zl).
 *
 * Archiving and filing both move the message out of the arrival folder, by the
 * server's own move where it advertises one and otherwise by a copy followed by
 * an expunge naming that message's UID alone (d-8am29x25) — the session seam
 * chooses, and an Account whose server offers neither declares it can do
 * neither, so the unsafe path is never reached.
 *
 * An archive moves the message only where it is still in the arrival folder;
 * found anywhere else it is left where it is and reported as having already
 * departed (d-661z414c). Filing has no such guard: the user named a
 * destination, and a message already elsewhere is still moved there.
 *
 * Reads never mark a message seen and no flag of the user's is set or cleared;
 * the keywords a Category names are the only flags written (d-mtgha4ra).
 */

import type { DB } from '../db/schema.js'
import type {
  MailboxApplyCategoryArgs,
  MailboxArchiveArgs,
  MailboxBodyResult,
  MailboxFetchArgs,
  MailboxFileArgs,
} from '../operators/types.js'
import type { ImapSession } from '../providers/imap/imap-client.js'
import { matchFolder } from '../providers/imap/imap-folders.js'
import type { ImapLocation, ImapMessageStore } from '../providers/imap/imap-message-store.js'
import { isLocationKey } from '../providers/imap/imap-message-store.js'
import { folderList } from '../providers/imap/imap-provider.js'
import { type AccountFolders, parseImapSettings } from '../providers/imap/imap-settings.js'
import type { MailboxBackend } from './provider-backends.js'

/** Opens a logged-in session for an Account id. */
export type OpenAccountSession = (accountId: number) => Promise<ImapSession>

/** Deps the IMAP resource backend closes over. */
export interface ImapBackendDeps {
  readonly db: DB
  readonly openSession: OpenAccountSession
  readonly store: ImapMessageStore
}

/** Thrown when the folder the user named is not one the Account has. */
export class UnknownFolderError extends Error {
  override readonly name = 'UnknownFolderError'

  constructor(folder: string) {
    super(`the account has no folder named '${folder}'`)
  }
}

/** Thrown when a Message grinbox holds cannot be found on the server. */
export class MessageGoneError extends Error {
  override readonly name = 'MessageGoneError'
}

/** Run `work` against a session for `accountId`, closing it either way. */
async function withSession<T>(
  deps: ImapBackendDeps,
  accountId: number,
  work: (session: ImapSession, folders: AccountFolders) => Promise<T>,
): Promise<T> {
  const account = await deps.db
    .selectFrom('accounts')
    .select('settings_json')
    .where('id', '=', accountId)
    .executeTakeFirstOrThrow()
  const folders = parseImapSettings(account.settings_json).folders
  const session = await deps.openSession(accountId)
  try {
    return await work(session, folders)
  } finally {
    await session.close()
  }
}

/**
 * Where the Message is now: the stored location where it still holds, else a
 * Message-ID search across the four folders that succeeds only where exactly one
 * message carries it (d-k4nt8zbu). A Message stored without a Message-ID is only
 * ever where grinbox recorded it (d-00smatg0).
 */
async function locate(
  deps: ImapBackendDeps,
  accountId: number,
  session: ImapSession,
  folders: AccountFolders,
  backendMessageId: string,
): Promise<ImapLocation | null> {
  const stored = await deps.store.locationOf(accountId, backendMessageId)
  if (stored) {
    const state = await session.selectFolder(stored.folder)
    if (
      state.uidValidity === stored.uidValidity &&
      (await session.fetchHeaders(stored.folder, [stored.uid])).length === 1
    ) {
      return stored
    }
  }
  if (isLocationKey(backendMessageId)) {
    return null
  }

  const matches: ImapLocation[] = []
  for (const folder of folderList(folders)) {
    const state = await session.selectFolder(folder)
    for (const uid of await session.findByMessageId(folder, backendMessageId)) {
      matches.push({ folder, uidValidity: state.uidValidity, uid })
    }
  }
  return matches.length === 1 ? (matches[0] ?? null) : null
}

/** IMAP's `mailbox` backend. */
export function imapMailboxBackend(deps: ImapBackendDeps): MailboxBackend {
  return {
    async apply_category(accountId: number, args: MailboxApplyCategoryArgs): Promise<{ applied: boolean }> {
      return withSession(deps, accountId, async (session, folders) => {
        const located = await locate(deps, accountId, session, folders, args.backendMessageId)
        if (!located) {
          throw new MessageGoneError(`message '${args.backendMessageId}' is no longer findable on the account`)
        }
        await session.storeKeyword(located.folder, located.uid, args.category)
        return { applied: true }
      })
    },

    async archive(accountId: number, args: MailboxArchiveArgs): Promise<{ archived: boolean }> {
      return withSession(deps, accountId, async (session, folders) => {
        const located = await locate(deps, accountId, session, folders, args.backendMessageId)
        if (!located) {
          throw new MessageGoneError(`message '${args.backendMessageId}' is no longer findable on the account`)
        }
        // Only out of the arrival folder (d-661z414c): a message the user moved
        // themselves has already departed, and is left where they put it.
        if (located.folder !== folders.arrival) {
          return { archived: false }
        }
        await session.move(folders.arrival, located.uid, folders.archived)
        return { archived: true }
      })
    },

    async file(accountId: number, args: MailboxFileArgs): Promise<{ filed: boolean }> {
      return withSession(deps, accountId, async (session, folders) => {
        const listed = await session.listFolders()
        const destination = matchFolder(listed, args.folder)
        if (destination === null) {
          throw new UnknownFolderError(args.folder)
        }
        const located = await locate(deps, accountId, session, folders, args.backendMessageId)
        if (!located) {
          throw new MessageGoneError(`message '${args.backendMessageId}' is no longer findable on the account`)
        }
        if (located.folder === destination) {
          return { filed: true }
        }
        await session.move(located.folder, located.uid, destination)
        return { filed: true }
      })
    },

    async fetch_body(accountId: number, args: MailboxFetchArgs): Promise<MailboxBodyResult> {
      return withSession(deps, accountId, async (session, folders) => {
        const located = await locate(deps, accountId, session, folders, args.backendMessageId)
        if (!located) {
          throw new MessageGoneError(`message '${args.backendMessageId}' is no longer findable on the account`)
        }
        return session.fetchBody(located.folder, located.uid)
      })
    },
  }
}
