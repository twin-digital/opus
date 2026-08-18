/**
 * What an IMAP Account is stored as. The shapes are `@grinbox/shared`'s
 * (d-ioso3voc, d-zxvkt95o); this module names the state the daemon keys on and
 * reads an Account row's `settings_json` back into them.
 *
 * The password is not here — it is a Credential the user obtained through
 * grinbox, stored encrypted under {@link IMAP_PASSWORD_KIND} and never returned
 * by the API (r-0kn0oida).
 */

import {
  type AccountFolders,
  type ImapAccountSettings,
  accountFoldersSchema,
  imapAccountSettingsSchema,
} from '@grinbox/shared'
import { z } from 'zod'

/** The IMAP `provider_type` an Account carries for its whole life (d-oevikmal). */
export const IMAP_PROVIDER_TYPE = 'imap'

/** The credential kind an IMAP Account's password is stored under. */
export const IMAP_PASSWORD_KIND = 'imap_password'

/**
 * An IMAP Account's `settings_json`: its connection, its own mail address, and
 * the four folders the user accepted.
 */
export const imapSettingsSchema = imapAccountSettingsSchema.extend({
  /** The Account's own mail address, which the interface shows it by. */
  address: z.string().min(1),
  folders: accountFoldersSchema,
})
export type ImapSettings = z.infer<typeof imapSettingsSchema>

export type { AccountFolders, ImapAccountSettings }

/** Parse an Account's `settings_json` as IMAP settings; throws when it is not. */
export function parseImapSettings(settingsJson: string): ImapSettings {
  return imapSettingsSchema.parse(JSON.parse(settingsJson))
}

/** Serialize IMAP settings for `accounts.settings_json`. */
export function serializeImapSettings(settings: ImapSettings): string {
  return JSON.stringify(settings)
}
