import { z } from 'zod'

/**
 * Folders: the named containers of messages within an Account, the four roles
 * an Account names, and how a folder name is written down.
 *
 * Grinbox creates, renames, and deletes no folder (r-g1iwlbzs). Where what it
 * does must put a Message somewhere other than where it found it, the user
 * names where — from the folders the Account actually has (r-e40s6olu).
 */

/**
 * A folder name as the user gave it (d-k8va629q): matched against the names
 * the server lists character for character. Grinbox reads no hierarchy into it
 * and translates no separator, so the name is neither trimmed nor
 * case-folded — `Archive/2026` is one name, not a path.
 *
 * A line break is refused: it cannot survive the wire to the server, so a name
 * carrying one could never match a folder that exists.
 */
export const folderNameSchema = z
  .string()
  .min(1)
  .refine((name) => !/[\r\n]/.test(name), {
    message: 'a folder name is a single line of text',
  })
export type FolderName = z.infer<typeof folderNameSchema>

/**
 * The four roles an Account names a folder for (d-zxvkt95o): where new mail
 * arrives, and the folders standing for archived, trashed, and spam mail. A
 * Message's standing is the folder it is in (d-qstpa7y0).
 */
export const FOLDER_ROLES = ['arrival', 'archived', 'trashed', 'spam'] as const
export const folderRoleSchema = z.enum(FOLDER_ROLES)
export type FolderRole = z.infer<typeof folderRoleSchema>

/**
 * The four folders an Account names. No two of them name one folder
 * (d-zxvkt95o) — with two roles on one folder, a Message's standing would not
 * be readable from where it is.
 *
 * The user may re-point any role at any time (d-8pdx8qsd); what grinbox
 * already recorded keeps the standing it had, and the new folders are what the
 * next poll and the next reconcile read.
 */
export const accountFoldersSchema = z
  .object({
    arrival: folderNameSchema,
    archived: folderNameSchema,
    trashed: folderNameSchema,
    spam: folderNameSchema,
  })
  .superRefine((folders, ctx) => {
    const byName = new Map<string, FolderRole>()
    for (const role of FOLDER_ROLES) {
      const name = folders[role]
      const claimed = byName.get(name)
      if (claimed !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: `folder '${name}' is already the account's ${claimed} folder; no two roles name one folder`,
          path: [role],
        })
        continue
      }
      byName.set(name, role)
    }
  })
export type AccountFolders = z.infer<typeof accountFoldersSchema>

/**
 * One folder an Account has, as the interface offers it (r-e40s6olu).
 * `proposed_role` is the role grinbox proposes for it — from the roles the
 * server advertises and from the Account's own folder names (d-zxvkt95o) — or
 * `null` where it proposes none. What the user accepted is what is stored.
 */
export const folderSchema = z.object({
  name: folderNameSchema,
  proposed_role: folderRoleSchema.nullable(),
})
export type Folder = z.infer<typeof folderSchema>
