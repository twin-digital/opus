/**
 * What an IMAP Account is configured with (d-ioso3voc, d-zxvkt95o), stored in
 * `accounts.settings_json`. The password is not here — it is a credential the
 * user obtained through grinbox and is stored as one, encrypted, under the
 * `imap_password` credential kind.
 *
 * The four folder names are the Account's roles: where mail arrives, and the
 * folders standing for archived, trashed, and spam mail. Grinbox proposes them
 * from the roles the server advertises and from the Account's folder names, and
 * what the user accepted is what is stored (d-zxvkt95o). It creates none of them
 * (r-g1iwlbzs) and matches each against the server's listing character for
 * character (d-k8va629q).
 */

import { z } from 'zod'

/** The IMAP `provider_type` an Account carries for its whole life (d-oevikmal). */
export const IMAP_PROVIDER_TYPE = 'imap'

/** The credential kind an IMAP Account's password is stored under. */
export const IMAP_PASSWORD_KIND = 'imap_password'

/**
 * Whether the connection is encrypted from the start (`implicit`, the classic
 * 993 form) or upgraded after connecting (`starttls`). Grinbox verifies the
 * server's certificate either way and nothing waives it (d-lru4i8rp), so there
 * is no third value.
 */
export const imapSecuritySchema = z.enum(['implicit', 'starttls'])
export type ImapSecurity = z.infer<typeof imapSecuritySchema>

/** The four folder roles every IMAP Account names. */
export const imapFoldersSchema = z
  .object({
    arrival: z.string().min(1),
    archived: z.string().min(1),
    trashed: z.string().min(1),
    spam: z.string().min(1),
  })
  .refine((f) => new Set([f.arrival, f.archived, f.trashed, f.spam]).size === 4, {
    message: 'no two folder roles may name one folder',
  })
export type ImapFolders = z.infer<typeof imapFoldersSchema>

/** The connection an IMAP Account is reached on. */
export const imapConnectionSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  security: imapSecuritySchema,
  username: z.string().min(1),
})
export type ImapConnection = z.infer<typeof imapConnectionSchema>

/** The stored shape of an IMAP Account's `settings_json`. */
export const imapSettingsSchema = imapConnectionSchema.extend({
  /** The Account's own mail address, which digests would be sent to. */
  address: z.string().min(1),
  folders: imapFoldersSchema,
})
export type ImapSettings = z.infer<typeof imapSettingsSchema>

/** The roles, in the order the interface offers them. */
export const IMAP_FOLDER_ROLES = ['arrival', 'archived', 'trashed', 'spam'] as const
export type ImapFolderRole = (typeof IMAP_FOLDER_ROLES)[number]

/** Parse an Account's `settings_json` as IMAP settings; throws when it is not. */
export function parseImapSettings(settingsJson: string): ImapSettings {
  return imapSettingsSchema.parse(JSON.parse(settingsJson))
}
