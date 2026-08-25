import { z } from 'zod'
import { accountFoldersSchema } from './folders.js'

/**
 * What an IMAP Account is configured with (d-ioso3voc): the server's host and
 * port, whether the connection is encrypted from the start or upgraded after
 * connecting, a username, and a password the user obtained from their
 * provider.
 *
 * The password is a Credential the user obtained through grinbox: it is stored
 * encrypted with the Account's other Credentials and never comes back out of
 * the API (r-0kn0oida, d-8yht1ei9), so it is not part of the stored settings
 * shape — only of what the user hands in.
 */

/**
 * How the connection is protected (d-ioso3voc):
 *  - `tls` — encrypted from the start (implicit TLS, conventionally port 993).
 *  - `starttls` — a cleartext connection upgraded after connecting.
 *
 * Grinbox verifies the certificate the server presents either way and refuses
 * an Account whose server it cannot verify; nothing the user configures waives
 * the check (d-lru4i8rp).
 */
export const IMAP_CONNECTION_SECURITIES = ['tls', 'starttls'] as const
export const imapConnectionSecuritySchema = z.enum(IMAP_CONNECTION_SECURITIES)
export type ImapConnectionSecurity = z.infer<typeof imapConnectionSecuritySchema>

/** A TCP port. */
export const imapPortSchema = z.number().int().min(1).max(65535)

/**
 * The stored settings of an IMAP Account — everything but the password and the
 * folders. An Account carries the backend it was added with and that never
 * changes (d-oevikmal); a mailbox to be read through another backend is added
 * as another Account.
 */
export const imapAccountSettingsSchema = z.object({
  host: z.string().trim().min(1),
  port: imapPortSchema,
  security: imapConnectionSecuritySchema,
  username: z.string().min(1),
})
export type ImapAccountSettings = z.infer<typeof imapAccountSettingsSchema>

/**
 * What the user hands grinbox to log in: the settings plus the password. A
 * successful login is the authorization (d-fuln110d) — it happens on the
 * internal interface and reaches no public path.
 *
 * This is also what repairs an Account the server has refused: the user
 * restates everything an IMAP Account is configured with, not the password
 * alone (d-r3ogwkv7).
 */
export const imapAccountCredentialsSchema = imapAccountSettingsSchema.extend({
  password: z.string().min(1),
})
export type ImapAccountCredentials = z.infer<typeof imapAccountCredentialsSchema>

/**
 * What creates an IMAP Account: the credentials the login uses, and the four
 * folders the user accepted. The Account exists once the folders are accepted
 * (d-8jc4taom) — a login that succeeded while the user was still adding it
 * leaves nothing behind, and grinbox holds the password no longer than the
 * adding takes.
 */
export const imapAccountSetupSchema = imapAccountCredentialsSchema.extend({
  folders: accountFoldersSchema,
})
export type ImapAccountSetup = z.infer<typeof imapAccountSetupSchema>
