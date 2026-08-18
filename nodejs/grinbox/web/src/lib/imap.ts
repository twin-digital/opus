import type { AccountSummary } from '@grinbox/server'
import type { AccountFolders, ImapAccountSettings, ImapConnectionSecurity } from '@grinbox/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { InferRequestType, InferResponseType } from 'hono/client'

import { accountKey, accountsKey } from './accounts'
import { api } from './api'
import { ApiError, toApiError } from './api-error'
import type { AccountFolder } from './folders'

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
  security: ImapConnectionSecurity
  password: string
}

/** What a successful probe reported: the folders, a proposal, what it can carry. */
export interface ImapProbe {
  readonly folders: readonly AccountFolder[]
  /** Grinbox's proposal per role, from the advertised roles and the names. */
  readonly proposed: Partial<Record<keyof AccountFolders, string>>
  /** What the Account can carry, and why it cannot carry the rest (d-jl5giafw). */
  readonly capabilities: AccountSummary['capabilities']
}

type ProbeBody = InferRequestType<typeof api.api.imap.probe.$post>['json']

/**
 * How the wire spells the connection's protection. d-eyi05i6b names the values
 * `tls` and `starttls`, which is what the interface and `@grinbox/shared` use;
 * the daemon still spells the first one `implicit`. The translation lives here
 * alone, and the day the daemon takes the ruled name this map stops
 * type-checking — which is where the rename should be noticed.
 */
const WIRE_SECURITY: Record<ImapConnectionSecurity, ProbeBody['security']> = {
  tls: 'implicit',
  starttls: 'starttls',
}

/** The connection, as the API takes it. */
function connectionBody(login: ImapLogin) {
  return {
    host: login.host,
    port: login.port,
    security: WIRE_SECURITY[login.security],
    username: login.username,
    password: login.password,
  }
}

type ProbeResponse = InferResponseType<typeof api.api.imap.probe.$post, 200>

function toProbe(body: ProbeResponse): ImapProbe {
  return {
    folders: body.folders.map((folder) => ({ name: folder.name, roles: folder.roles })),
    proposed: body.proposed,
    capabilities: body.capabilities,
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
      return toProbe(await res.json())
    },
  })
}

/** What creating an IMAP Account takes: the login, a display name and address, the folders. */
export interface ImapAccountDraft {
  login: ImapLogin
  name: string
  address: string
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
          address: draft.address,
          folders: draft.folders,
        },
      })
      // The daemon declares only a refusal on this route so far, which types
      // `ok` as literally `false`; the check is there for the answer it will
      // give once the handler is implemented.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
      // The daemon declares only a refusal on this route so far, which types
      // `ok` as literally `false`; the check is there for the answer it will
      // give once the handler is implemented.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
      // The daemon declares only a refusal on this route so far, which types
      // `ok` as literally `false`; the check is there for the answer it will
      // give once the handler is implemented.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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

/** An Account's stored IMAP configuration, without the password. */
export interface StoredImapSettings extends ImapAccountSettings {
  security: ImapConnectionSecurity
  address: string
  folders: AccountFolders
}

/**
 * An Account's stored IMAP settings — what a repair opens pre-filled, every
 * field but the password (d-mcdtvppm), and where its four folders currently
 * point (d-8pdx8qsd).
 *
 * The daemon carries them on the Account read surfaces under `settings`. Until
 * it does this reads as null, and the repair form opens empty rather than
 * showing settings it does not have.
 */
export function imapSettingsOf(account: AccountSummary): StoredImapSettings | null {
  const settings = (account as { settings?: unknown }).settings
  if (!settings || typeof settings !== 'object') {
    return null
  }
  const raw = settings as Record<string, unknown>
  const folders = raw.folders
  if (
    typeof raw.host !== 'string' ||
    typeof raw.port !== 'number' ||
    typeof raw.username !== 'string' ||
    !folders ||
    typeof folders !== 'object'
  ) {
    return null
  }
  const named = folders as Record<string, unknown>
  const accepted: Partial<AccountFolders> = {}
  for (const role of ['arrival', 'archived', 'trashed', 'spam'] as const) {
    const name = named[role]
    if (typeof name !== 'string') {
      return null
    }
    accepted[role] = name
  }
  return {
    host: raw.host,
    port: raw.port,
    username: raw.username,
    security: raw.security === 'starttls' ? 'starttls' : 'tls',
    address: typeof raw.address === 'string' ? raw.address : '',
    folders: accepted as AccountFolders,
  }
}

/** The connection to open a repair with: what is stored, and an empty password. */
export function loginFromSettings(settings: StoredImapSettings): ImapLogin {
  return {
    host: settings.host,
    port: settings.port,
    security: settings.security,
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
    case 'imap_credential_rejected':
      return 'The server refused this username and password. Check them with your provider and try again.'
    case 'certificate_unverified':
      return 'Grinbox could not verify this server’s certificate, and it will not talk to a server it cannot verify. There is no way to turn that check off — fix the certificate, or use a hostname it is issued for.'
    case 'duplicate_folder_role':
      return 'Two roles name the same folder. Each of the four roles needs a folder of its own.'
    case 'imap_unavailable':
      return 'This deployment has no IMAP transport configured.'
    default:
      return err.message
  }
}
