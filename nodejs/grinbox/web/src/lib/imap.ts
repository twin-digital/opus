import type { AccountSummary } from '@grinbox/server'
import type { AccountCapabilities, AccountFolders, Folder, ImapAccountSettings } from '@grinbox/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { accountKey, accountsKey } from './accounts'
import { api } from './api'
import { ApiError, toApiError } from './api-error'

/**
 * Adding, repairing, and re-pointing an IMAP Account.
 *
 * A credential the user holds is authorized by logging in, on grinbox's own
 * internal interface, and reaches no public path (d-fuln110d). Adding is a
 * probe the user answers and then a create: the Account exists once its four
 * folders are accepted (d-8jc4taom), so an abandoned probe leaves nothing
 * behind. Repair restates everything an IMAP Account is configured with, not
 * the password alone (d-r3ogwkv7, d-mcdtvppm), and the backend cannot change
 * (d-oevikmal).
 *
 * No response here carries the password back (r-0kn0oida).
 */

/** What the connection form collects — the settings plus the password. */
export interface ImapLogin extends ImapAccountSettings {
  password: string
}

/** What a successful probe reported: the folders, and what the Account can carry. */
export interface ImapProbe {
  /** Every folder the Account holds, each with the role grinbox proposes for it. */
  readonly folders: readonly Folder[]
  /** What the Account can carry, and why it cannot carry the rest (d-jl5giafw). */
  readonly capabilities: AccountCapabilities
}

/** The connection, as the API takes it. */
function connectionBody(login: ImapLogin) {
  return {
    host: login.host,
    port: login.port,
    security: login.security,
    username: login.username,
    password: login.password,
  }
}

/**
 * Log in and read back what the server offers. A refusal naming the credential
 * is the user's to fix and reads as such; a certificate grinbox cannot verify
 * is its own refusal, because nothing waives that check (d-lru4i8rp).
 */
export function useImapProbe() {
  return useMutation({
    mutationFn: async (login: ImapLogin): Promise<ImapProbe> => {
      const res = await api.api.imap.probe.$post({ json: connectionBody(login) })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
  })
}

/** What creating an IMAP Account takes: the login, a display name, the folders. */
export interface ImapAccountDraft {
  login: ImapLogin
  name: string
  folders: AccountFolders
}

/** Create the Account. Nothing was stored before this call (d-8jc4taom). */
export function useCreateImapAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (draft: ImapAccountDraft) => {
      const res = await api.api.imap.accounts.$post({
        json: {
          ...connectionBody(draft.login),
          name: draft.name,
          folders: draft.folders,
        },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accountsKey })
    },
  })
}

/**
 * Repair a paused Account: the whole connection restated, then the folders
 * (d-r3ogwkv7, d-mcdtvppm). Polling resumes and nothing about the Account is
 * deleted (d-v4mejzw5).
 */
export function useRepairImapConnection(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (login: ImapLogin) => {
      const res = await api.api.imap.accounts[':id'].connection.$put({
        param: { id: String(id) },
        json: connectionBody(login),
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accountKey(id) })
      void qc.invalidateQueries({ queryKey: accountsKey })
    },
  })
}

/**
 * Name a different folder for any role, at any time (d-8pdx8qsd). What grinbox
 * already recorded keeps the standing it had; the new folders are what the next
 * poll reads.
 */
export function useRepointFolders(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (folders: AccountFolders) => {
      const res = await api.api.imap.accounts[':id'].folders.$patch({
        param: { id: String(id) },
        json: { folders },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accountKey(id) })
      void qc.invalidateQueries({ queryKey: accountsKey })
    },
  })
}

/**
 * The connection to open a repair with: everything the Account is configured
 * with, and an empty password (d-mcdtvppm). The stored configuration never
 * carries the password, in any encoding (r-0kn0oida).
 */
export function loginFromSettings(settings: NonNullable<AccountSummary['imap']>): ImapLogin {
  return {
    host: settings.host,
    port: settings.port,
    security: settings.security === 'starttls' ? 'starttls' : 'tls',
    username: settings.username,
    password: '',
  }
}

/**
 * What a refused IMAP write means, in the user's terms. The codes are the
 * daemon's (d-oaaz2fwk); a certificate grinbox cannot verify is deliberately
 * distinct from a server it could not reach, because that is the refusal the
 * user would otherwise read as a network blip and retry forever (d-lru4i8rp).
 */
export function imapRefusalMessage(err: unknown): string {
  if (!(err instanceof ApiError)) {
    return err instanceof Error ? err.message : 'Something went wrong.'
  }
  switch (err.code) {
    case 'account_login_failed':
      return 'The server refused this username and password. Check them with your provider and try again.'
    case 'certificate_unverified':
      return 'Grinbox could not verify this server’s certificate, and it will not talk to a server it cannot verify. There is no way to turn that check off — fix the certificate, or use a hostname it is issued for.'
    case 'duplicate_folder_role':
      return 'Two roles name the same folder. Each of the four roles needs a folder of its own.'
    case 'not_found':
      return `${err.message} Grinbox creates no folder — name one the account already has.`
    case 'encryption_unavailable':
      return 'This deployment has no encryption key configured, so grinbox cannot store a password.'
    case 'imap_unavailable':
      return 'This deployment has no IMAP transport configured.'
    default:
      return err.message
  }
}
