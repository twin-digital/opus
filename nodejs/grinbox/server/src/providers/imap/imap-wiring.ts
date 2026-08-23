/**
 * The daemon's IMAP wiring: one place that turns the State DB and the encryption
 * seam into the pieces every IMAP path needs — a session opener, the Provider,
 * the resource backend's deps, the probe the add flow calls, and the folder
 * listing the interface offers.
 *
 * Sessions are serialized per Account here (d-v55lpt3t): every path — the poll,
 * a resource operation, a probe of an existing Account — goes through the same
 * opener, so an Account is worked one connection at a time whichever path asked.
 */

import type { AccountCapabilities } from '../account-capabilities.js'
import type { Folder, ImapAccountSettings } from '@grinbox/shared'
import { resolveImapCredentials } from '../../config/imap-account.js'
import type { Encryptor } from '../../crypto/encryption.js'
import type { DB } from '../../db/schema.js'
import type { ImapSession } from './imap-client.js'
import { imapCapabilities } from './imap-capabilities.js'
import { proposeFolders } from './imap-folders.js'
import { type ImapMessageStore, makeImapMessageStore } from './imap-message-store.js'
import { ImapProvider } from './imap-provider.js'
import { makeSerializedConnect, openImapSession } from './imap-session.js'

/** What a probe of a server reports back (no password, in any encoding). */
export interface ImapProbeReport {
  readonly folders: readonly Folder[]
  readonly capabilities: AccountCapabilities
}

/** The IMAP pieces the daemon hands to the poll loop, the resources, and the API. */
export interface ImapWiring {
  readonly provider: ImapProvider
  readonly store: ImapMessageStore
  readonly openSession: (accountId: number) => Promise<ImapSession>
  readonly probe: (connection: ImapAccountSettings, password: string) => Promise<ImapProbeReport>
  readonly accountFolders: (accountId: number) => Promise<readonly Folder[]>
}

/** Read a session's folders and capabilities into what the add flow shows. */
async function report(session: ImapSession, now: number): Promise<ImapProbeReport> {
  const listed = await session.listFolders()
  const proposal = proposeFolders(listed)
  const folders: Folder[] = listed.map((folder) => ({
    name: folder.name,
    proposed_role:
      (Object.entries(proposal).find(([, name]) => name === folder.name)?.[0] as Folder['proposed_role']) ?? null,
  }))
  // The arrival folder's permanent flags are what say whether a Category would
  // last (d-bzw8qoiy); INBOX is what a proposal names, and a server without one
  // is an account grinbox cannot arrange around.
  const arrival = proposal.arrival
  const permanentFlags = arrival === undefined ? [] : (await session.selectFolder(arrival)).permanentFlags
  return { folders, capabilities: imapCapabilities(await session.capabilities(), permanentFlags, now) }
}

/** Build the daemon's IMAP wiring. */
export function createImapWiring(deps: {
  db: DB
  encryptor: Encryptor
  now?: () => number
  connect?: typeof openImapSession
}): ImapWiring {
  const now = deps.now ?? (() => Math.floor(Date.now() / 1000))
  const connect = deps.connect ?? openImapSession
  const store = makeImapMessageStore(deps.db)

  // Keyed by Account id: work for an Account that arrives while its connection
  // is busy waits for it rather than opening a second (d-v55lpt3t).
  const openSession = makeSerializedConnect(async (accountId: number) => {
    const { settings, password } = await resolveImapCredentials(deps.db, deps.encryptor, accountId)
    return connect(settings, password)
  })

  const provider = new ImapProvider({
    openSession: (account) => openSession(account.id),
    store,
    now,
  })

  return {
    provider,
    store,
    openSession,
    // A probe of a server the user is still describing has no Account to
    // serialize against, so it opens its own connection and closes it.
    probe: async (connection, password) => {
      const session = await connect(connection, password)
      try {
        return await report(session, now())
      } finally {
        await session.close()
      }
    },
    accountFolders: async (accountId) => {
      const session = await openSession(accountId)
      try {
        return (await report(session, now())).folders
      } finally {
        await session.close()
      }
    },
  }
}
