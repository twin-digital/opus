import { type AccountFolders, FOLDER_ROLES, type FolderRole } from '@grinbox/shared'
import { useId } from 'react'

import { FolderNameField } from '@/components/folder-picker'
import type { AccountFolder } from '@/lib/folders'

/**
 * The four folders an Account names (d-zxvkt95o): where mail arrives, and the
 * folders standing for archived, trashed, and spam mail. Grinbox proposes them
 * from the roles the server advertises and from the Account's folder names, and
 * what the user accepted is what is stored — the Account exists once they have
 * accepted them (d-8jc4taom).
 *
 * No two of them name one folder: with two roles on one folder a Message's
 * standing would not be readable from where it is (d-qstpa7y0). The check runs
 * here so the refusal is met on the field rather than after a round trip, and
 * the daemon refuses it too.
 *
 * Grinbox creates none of these folders (r-g1iwlbzs) — every one is named from
 * what the Account already has, and a name is taken as typed (d-axa16o94).
 */

export const ROLE_LABELS: Record<FolderRole, string> = {
  arrival: 'Arrival folder',
  archived: 'Archived mail',
  trashed: 'Trashed mail',
  spam: 'Spam',
}

const ROLE_DESCRIPTIONS: Record<FolderRole, string> = {
  arrival: 'Where new mail is delivered. Grinbox polls this folder and triages what it finds.',
  archived: 'Where a Message goes when grinbox archives it, and what standing a Message found there has.',
  trashed: 'The folder standing for trashed mail. Grinbox never puts anything here; it reads standing from it.',
  spam: 'The folder standing for spam. Grinbox never puts anything here; it reads standing from it.',
}

/** A draft of the four roles — each may be empty while the user is filling them. */
export type FolderRoleDraft = Record<FolderRole, string>

/** An empty draft, seeded from whatever grinbox proposed. */
export function draftFromProposal(proposed: Partial<Record<FolderRole, string>>): FolderRoleDraft {
  return {
    arrival: proposed.arrival ?? '',
    archived: proposed.archived ?? '',
    trashed: proposed.trashed ?? '',
    spam: proposed.spam ?? '',
  }
}

/** The roles naming a folder another role already named. */
export function duplicateRoles(draft: FolderRoleDraft): FolderRole[] {
  const claimed = new Map<string, FolderRole>()
  const duplicates: FolderRole[] = []
  for (const role of FOLDER_ROLES) {
    const name = draft[role]
    if (name === '') {
      continue
    }
    if (claimed.has(name)) {
      duplicates.push(role)
      continue
    }
    claimed.set(name, role)
  }
  return duplicates
}

/** The accepted four, or null while the draft is short a role or names one twice. */
export function acceptedFolders(draft: FolderRoleDraft): AccountFolders | null {
  if (FOLDER_ROLES.some((role) => draft[role] === '') || duplicateRoles(draft).length > 0) {
    return null
  }
  return { arrival: draft.arrival, archived: draft.archived, trashed: draft.trashed, spam: draft.spam }
}

export function FolderRoleFields({
  value,
  onChange,
  folders,
}: {
  value: FolderRoleDraft
  onChange: (next: FolderRoleDraft) => void
  folders: readonly AccountFolder[]
}) {
  const idPrefix = useId()
  const duplicates = duplicateRoles(value)

  return (
    <div className='space-y-5'>
      {FOLDER_ROLES.map((role) => (
        <FolderNameField
          key={role}
          id={`${idPrefix}-${role}`}
          label={ROLE_LABELS[role]}
          description={ROLE_DESCRIPTIONS[role]}
          value={value[role]}
          onChange={(name) => {
            onChange({ ...value, [role]: name })
          }}
          folders={folders}
          emptyHint='This server listed no folders. Type each name exactly as the server spells it.'
          invalid={
            duplicates.includes(role) ?
              'Another role already names this folder. Each role needs a folder of its own.'
            : null
          }
        />
      ))}
    </div>
  )
}
