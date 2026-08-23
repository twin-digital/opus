/**
 * Gmail's implementation of the `mailbox` and `mail_sender` Resources (the
 * `provider_type: 'gmail'` entries in the provider registry — see
 * `provider-backends.ts`). Each operation authenticates as the given Account:
 * it resolves that Account's `gmail_oauth` credential (refresh-before-expiry)
 * and runs the corresponding live Gmail op from `gmail.ts`.
 *
 * The mapping from the backend-neutral operations to Gmail is:
 *  - `mailbox.apply_category` — applies the Category as a Gmail label of the
 *    same name (`applyLabel`, which resolves label name → id, ensure-exists).
 *  - `mailbox.archive` — removes the `INBOX` label (`archiveMessage`).
 *  - `mailbox.fetch_body` — full-format message get + MIME walk (`fetchBody`).
 *  - `mail_sender.send_message` — `users.messages.send` (`sendMessage`).
 *
 * With no `googleClient` (OAuth unwired) every operation is "not configured":
 * the call throws, the Operator's run fails, and its Triage settles `partial`
 * — the graceful per-op failure, never a daemon crash. A missing /
 * needs-reauth Account credential propagates the resolver's error the same
 * way.
 */

import { google } from 'googleapis'

/**
 * The OAuth2 client `google.gmail` accepts. Derived from the constructor rather
 * than from the `Auth` namespace `googleapis` re-exports: googleapis-common pins
 * an older google-auth-library than googleapis itself resolves, so the two
 * namespaces name structurally distinct classes.
 */
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>
import type { Encryptor } from '../crypto/encryption.js'
import type { DB } from '../db/schema.js'
import type { GoogleOAuthClient } from '../oauth/google-client.js'
import { resolveGmailAccessToken } from '../oauth/token-store.js'
import type {
  MailSendArgs,
  MailboxApplyCategoryArgs,
  MailboxArchiveArgs,
  MailboxBodyResult,
  MailboxFetchArgs,
  MailboxFileArgs,
} from '../operators/types.js'
import { type GmailOAuth2Client, applyLabel, archiveMessage, fetchBody, fileMessage, sendMessage } from './gmail.js'
import type { MailSenderBackend, MailboxBackend } from './provider-backends.js'

/** Daemon-level deps the Gmail backends close over. */
export interface GmailBackendDeps {
  readonly db: DB
  readonly encryptor: Encryptor
  /**
   * The live Google OAuth client, present only when OAuth is configured. When
   * `null`, every Gmail-backed operation is "not configured" (no way to
   * resolve / refresh the Account's access token).
   */
  readonly googleClient: GoogleOAuthClient | null
}

/** Throw the "not configured" per-op failure for an OAuth-unwired op. */
function notConfigured(op: string): never {
  throw new Error(
    `Resource operation '${op}' invoked but no Resource client is configured (credentials/transport wiring is not yet in place)`,
  )
}

/**
 * The per-call auth seam: resolve the Account's access token
 * (refresh-before-expiry) and hand back an OAuth2 client carrying it. A
 * missing / needs-reauth credential propagates the resolver's error, failing
 * the run gracefully.
 */
function accountAuth(
  deps: GmailBackendDeps,
  googleClient: GoogleOAuthClient,
  accountId: number,
): () => Promise<GmailOAuth2Client> {
  return async () => {
    const accessToken = await resolveGmailAccessToken(deps.db, deps.encryptor, accountId, googleClient)
    const client: OAuth2Client = new google.auth.OAuth2()
    client.setCredentials({ access_token: accessToken })
    return client
  }
}

/** Gmail's `mailbox` backend. */
export function gmailMailboxBackend(deps: GmailBackendDeps): MailboxBackend {
  return {
    async apply_category(
      accountId: number,
      args: MailboxApplyCategoryArgs,
      signal: AbortSignal,
    ): Promise<{ applied: boolean }> {
      const { googleClient } = deps
      if (!googleClient) {
        return notConfigured('mailbox.apply_category')
      }
      const auth = accountAuth(deps, googleClient, accountId)
      return applyLabel({ auth, signal }, { backendMessageId: args.backendMessageId, label: args.category })
    },
    async archive(accountId: number, args: MailboxArchiveArgs, signal: AbortSignal): Promise<{ archived: boolean }> {
      const { googleClient } = deps
      if (!googleClient) {
        return notConfigured('mailbox.archive')
      }
      const auth = accountAuth(deps, googleClient, accountId)
      return archiveMessage({ auth, signal }, args)
    },
    async file(accountId: number, args: MailboxFileArgs, signal: AbortSignal): Promise<{ filed: boolean }> {
      const { googleClient } = deps
      if (!googleClient) {
        return notConfigured('mailbox.file')
      }
      const auth = accountAuth(deps, googleClient, accountId)
      return fileMessage({ auth, signal }, args)
    },
    async fetch_body(accountId: number, args: MailboxFetchArgs, signal: AbortSignal): Promise<MailboxBodyResult> {
      const { googleClient } = deps
      if (!googleClient) {
        return notConfigured('mailbox.fetch_body')
      }
      const auth = accountAuth(deps, googleClient, accountId)
      return fetchBody({ auth, signal }, args)
    },
  }
}

/** Gmail's `mail_sender` backend. */
export function gmailMailSenderBackend(deps: GmailBackendDeps): MailSenderBackend {
  return {
    async send_message(accountId: number, args: MailSendArgs, signal: AbortSignal): Promise<{ message_id: string }> {
      const { googleClient } = deps
      if (!googleClient) {
        return notConfigured('mail_sender.send_message')
      }
      const auth = accountAuth(deps, googleClient, accountId)
      return sendMessage({ auth, signal }, args)
    },
  }
}
