/**
 * Construction of the {@link UnderlyingClients} the execution-loop worker injects
 * — the credential/transport-backed clients beneath the metering layer.
 *
 * ## Per-run construction
 *
 * The mail and Action clients resolve **per-run** credentials, so they cannot
 * be built once at startup like the stateless `llm_bedrock` transport:
 *
 *  - The `mailbox` operations (`apply_category`, `archive`, `file`, `fetch_body`)
 *    authenticate as the **Message's Account**: each call resolves the
 *    Account's `provider_type` and dispatches to that provider's registered
 *    backend (see `provider-backends.ts`), which resolves the Account's
 *    credential and performs the live call.
 *  - `mail_sender.send_message` dispatches the same way: Digest delivery sends
 *    the digest email through the Account whose Messages it covers, addressed
 *    to that Account's own address.
 *  - `pushover_api.send_notification` authenticates with the **Notify Operator's
 *    `config.credentials_id`** Pushover credential ({@link decryptPushoverPayload}).
 *
 * The worker knows the run's `accountId` (Message → Account) and the Notify
 * Operator's `notifyCredentialsId` (parsed config), so it builds these clients
 * per run via {@link buildMakeUnderlyingClients}, which closes over the daemon's
 * `db` / `encryptor` / `googleClient` / `config`.
 *
 * ## "Not configured" remains a per-op failure, never a crash
 *
 *  - `llm_bedrock.invoke_model` is the live Bedrock transport when `bedrockRegion`
 *    is set, a "not configured" stub that throws if invoked otherwise.
 *  - A mail operation whose provider backend cannot run — OAuth unwired, a
 *    missing / needs-reauth Account credential, or a `provider_type` with no
 *    backend for the Resource — throws when invoked, the Operator's run fails,
 *    and its Triage settles `partial`. The daemon never crashes.
 *  - `pushover_api.send_notification` is "not configured" when the referenced
 *    credential is missing or soft-deleted — same graceful per-op failure.
 *
 * The remaining `mailbox` ops (`fetch_metadata`, `list_messages`) have no
 * Action Operator that invokes them through this seam; they stay "not
 * configured" stubs.
 */

import type { Config } from '../config.js'
import { PUSHOVER_KIND, decryptPushoverPayload } from '../config/credential-store.js'
import type { Encryptor } from '../crypto/encryption.js'
import type { DB } from '../db/schema.js'
import type { GoogleOAuthClient } from '../oauth/google-client.js'
import { type BedrockSend, invokeModel, makeBedrockSend } from './bedrock.js'
import type { UnderlyingClients } from './make-resource-client.js'
import type { MailProviderRegistryDeps } from './provider-backends.js'
import { buildMailProviderRegistry, mailSenderBackendFor, mailboxBackendFor } from './provider-backends.js'
import { sendNotification } from './pushover.js'

/** Build the "throws if invoked" client for an unconfigured Resource op. */
function notConfigured(op: string): never {
  throw new Error(
    `Resource operation '${op}' invoked but no Resource client is configured (credentials/transport wiring is not yet in place)`,
  )
}

/** The `mailbox` ops with no Action Operator invoking them — see module header. */
type DeferredMailboxOps = Pick<UnderlyingClients['mailbox'], 'fetch_metadata' | 'list_messages'>

function deferredMailboxOps(): DeferredMailboxOps {
  return {
    fetch_metadata: () => notConfigured('mailbox.fetch_metadata'),
    list_messages: () => notConfigured('mailbox.list_messages'),
  }
}

/** The `llm_bedrock` underlying client: live when `bedrockRegion` is set. */
function bedrockClient(config: Config): UnderlyingClients['llm_bedrock'] {
  if (!config.bedrockRegion) {
    return { invoke_model: () => notConfigured('llm_bedrock.invoke_model') }
  }
  const send: BedrockSend = makeBedrockSend(config.bedrockRegion)
  return { invoke_model: (args, signal) => invokeModel(send, args, signal) }
}

/**
 * Build the underlying clients for the execution loop from config alone — the
 * Bedrock-only baseline. `llm_bedrock` is live when `config.bedrockRegion` is
 * set; `mailbox` / `mail_sender` / `pushover_api` are "not configured" stubs
 * because resolving their credentials needs per-run context (the Message's
 * Account, the Notify Operator's `credentials_id`) this builder does not have.
 * The execution loop uses {@link buildMakeUnderlyingClients} for the
 * credential-backed variant.
 */
export function buildUnderlyingClients(config: Config): UnderlyingClients {
  return {
    llm_bedrock: bedrockClient(config),
    mailbox: {
      apply_category: () => notConfigured('mailbox.apply_category'),
      archive: () => notConfigured('mailbox.archive'),
      file: () => notConfigured('mailbox.file'),
      fetch_body: () => notConfigured('mailbox.fetch_body'),
      ...deferredMailboxOps(),
    },
    mail_sender: {
      send_message: () => notConfigured('mail_sender.send_message'),
    },
    pushover_api: {
      send_notification: () => notConfigured('pushover_api.send_notification'),
    },
  }
}

/**
 * Adapt a fixed {@link UnderlyingClients} into a {@link MakeUnderlyingClients}
 * that ignores the per-run context. Used where per-run credential resolution is
 * irrelevant — a Bedrock-only / Rule-based deployment, or a test that injects
 * fixed fakes.
 */
export function staticMakeUnderlyingClients(clients: UnderlyingClients): MakeUnderlyingClients {
  return () => clients
}

/** The per-run inputs the mail/Action clients need to resolve their credentials. */
export interface UnderlyingClientsRunContext {
  /** The Message's Account id — keys the provider dispatch and the Account
   * credential resolution. */
  readonly accountId: number
  /**
   * The Notify Operator's `config.credentials_id`, or `null` when the run is not
   * a Notify (no Pushover credential to resolve). When `null`,
   * `pushover_api.send_notification` is "not configured".
   */
  readonly notifyCredentialsId: number | null
}

/** Builds the {@link UnderlyingClients} for one run from its context. */
export type MakeUnderlyingClients = (ctx: UnderlyingClientsRunContext) => UnderlyingClients

/** Daemon-level deps the per-run builder closes over. */
export interface MakeUnderlyingClientsDeps {
  readonly db: DB
  readonly encryptor: Encryptor
  readonly config: Config
  /**
   * The live Google OAuth client, present only when OAuth is configured. When
   * `null`, the Gmail backend's operations are "not configured" (no way to
   * resolve / refresh an Account's access token).
   */
  readonly googleClient: GoogleOAuthClient | null
  /**
   * The IMAP session opener and message store, present when the IMAP backend is
   * wired. Absent leaves an IMAP Account's `mailbox` operations unimplemented —
   * the graceful per-op failure, never a crash.
   */
  readonly imap?: MailProviderRegistryDeps['imap']
}

/**
 * Build the per-run {@link MakeUnderlyingClients}. The daemon injects this into
 * the execution loop; the worker calls it once per run with the run's context.
 *
 * `llm_bedrock` is identical to {@link buildUnderlyingClients} (config-only). The
 * per-run clients resolve their credentials against `ctx` on each call:
 *  - `mailbox.*` / `mail_sender.send_message` → the `ctx.accountId` Account's
 *    provider backend, which resolves that Account's credential.
 *  - `pushover_api.send_notification` → the `ctx.notifyCredentialsId` Pushover
 *    credential.
 *
 * A missing credential / unwired OAuth / unimplemented provider Resource
 * surfaces as a thrown error when the op is invoked — the graceful per-op
 * failure path, never a daemon crash.
 */
export function buildMakeUnderlyingClients(deps: MakeUnderlyingClientsDeps): MakeUnderlyingClients {
  const llm = bedrockClient(deps.config)
  const registry = buildMailProviderRegistry({
    db: deps.db,
    encryptor: deps.encryptor,
    googleClient: deps.googleClient,
    imap: deps.imap,
  })

  return (ctx) => ({
    llm_bedrock: llm,
    mailbox: {
      apply_category: async (args, signal) => {
        const backend = await mailboxBackendFor(deps.db, registry, ctx.accountId, 'apply_category')
        return backend.apply_category(ctx.accountId, args, signal)
      },
      archive: async (args, signal) => {
        const backend = await mailboxBackendFor(deps.db, registry, ctx.accountId, 'archive')
        return backend.archive(ctx.accountId, args, signal)
      },
      file: async (args, signal) => {
        const backend = await mailboxBackendFor(deps.db, registry, ctx.accountId, 'file')
        return backend.file(ctx.accountId, args, signal)
      },
      fetch_body: async (args, signal) => {
        const backend = await mailboxBackendFor(deps.db, registry, ctx.accountId)
        return backend.fetch_body(ctx.accountId, args, signal)
      },
      ...deferredMailboxOps(),
    },
    mail_sender: {
      send_message: async (args, signal) => {
        const backend = await mailSenderBackendFor(deps.db, registry, ctx.accountId)
        return backend.send_message(ctx.accountId, args, signal)
      },
    },
    pushover_api: {
      send_notification: (args, signal) => pushoverSend(deps, ctx.notifyCredentialsId, args, signal),
    },
  })
}

/**
 * Send a Pushover notification using the Notify Operator's referenced
 * credential. Loads the live `pushover` credential for `credentialsId`, decrypts
 * `{ app_token, user_key }`, and posts via `globalThis.fetch`. A `null` ref or a
 * missing / soft-deleted credential is "not configured" — a graceful per-op
 * failure.
 */
async function pushoverSend(
  deps: MakeUnderlyingClientsDeps,
  credentialsId: number | null,
  args: { title?: string; message: string; url?: string; url_title?: string },
  signal: AbortSignal,
): Promise<{ message_id: string }> {
  if (credentialsId === null) {
    return notConfigured('pushover_api.send_notification')
  }

  const row = await deps.db
    .selectFrom('credentials')
    .select(['data_enc'])
    .where('id', '=', credentialsId)
    .where('kind', '=', PUSHOVER_KIND)
    .where('deleted_at', 'is', null)
    .executeTakeFirst()
  if (!row) {
    return notConfigured('pushover_api.send_notification')
  }

  const payload = decryptPushoverPayload(deps.encryptor, row.data_enc)

  return sendNotification(
    {
      fetch: globalThis.fetch,
      credentials: { appToken: payload.app_token, userKey: payload.user_key },
      signal,
    },
    args,
  )
}
