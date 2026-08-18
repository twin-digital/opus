/**
 * Choosing an IMAP Account's four folders, and reading a message's standing from
 * the folder it is in.
 *
 * Grinbox proposes the four from the roles the server advertises and from the
 * Account's folder names, and what the user accepted is what is stored
 * (d-zxvkt95o). A proposal is only ever a proposal: the folders offered are the
 * ones the Account actually has (r-e40s6olu), grinbox creates none (r-g1iwlbzs),
 * and a role it cannot propose is left for the user to name.
 */

import type { SourceState } from '@grinbox/shared'
import type { ImapFolderListing } from './imap-client.js'
import type { ImapFolderRole, ImapFolders } from './imap-settings.js'

/** The special-use role a server advertises for each of grinbox's roles. */
const ADVERTISED_ROLE: Readonly<Record<Exclude<ImapFolderRole, 'arrival'>, string>> = {
  archived: '\\Archive',
  trashed: '\\Trash',
  spam: '\\Junk',
}

/** Names commonly given to each role where the server advertises nothing. */
const CUSTOMARY_NAMES: Readonly<Record<Exclude<ImapFolderRole, 'arrival'>, readonly string[]>> = {
  archived: ['Archive', 'Archives', 'All Mail'],
  trashed: ['Trash', 'Deleted Items', 'Deleted Messages'],
  spam: ['Junk', 'Spam', 'Junk E-mail'],
}

/** A proposal for one role: the folder proposed, or null where none was found. */
export type FolderProposal = Partial<Record<ImapFolderRole, string>>

/**
 * Propose the four folders from what the server listed. Arrival is INBOX, which
 * every server has; each other role takes the folder advertising its role, else
 * a folder whose name is one the role customarily carries. A role with neither
 * is absent from the proposal and the user names it.
 */
export function proposeFolders(listings: readonly ImapFolderListing[]): FolderProposal {
  const proposal: FolderProposal = {}

  const inbox = listings.find((f) => f.name.toUpperCase() === 'INBOX')
  if (inbox) {
    proposal.arrival = inbox.name
  }

  for (const role of ['archived', 'trashed', 'spam'] as const) {
    const advertised = listings.find((f) =>
      f.roles.some((r) => r.toLowerCase() === ADVERTISED_ROLE[role].toLowerCase()),
    )
    if (advertised) {
      proposal[role] = advertised.name
      continue
    }
    for (const name of CUSTOMARY_NAMES[role]) {
      const byName = listings.find((f) => f.name.toLowerCase() === name.toLowerCase())
      if (byName) {
        proposal[role] = byName.name
        break
      }
    }
  }

  return proposal
}

/**
 * The standing a message has from the folder it is in (d-qstpa7y0): the arrival
 * folder is `present`, the other three stand for themselves, and a message in
 * none of the four is recorded `archived`. No message on an IMAP Account is
 * recorded `deleted` — grinbox never concludes a deletion it did not see.
 */
export function standingOfFolder(folders: ImapFolders, folder: string): SourceState {
  switch (folder) {
    case folders.arrival:
      return 'present'
    case folders.trashed:
      return 'trashed'
    case folders.spam:
      return 'spam'
    default:
      return 'archived'
  }
}

/**
 * Match a folder name the user gave grinbox against the names the server lists,
 * character for character (d-k8va629q). Returns the listed name, or null where
 * the Account has no folder of that name.
 */
export function matchFolder(listings: readonly ImapFolderListing[], name: string): string | null {
  return listings.find((f) => f.name === name)?.name ?? null
}
