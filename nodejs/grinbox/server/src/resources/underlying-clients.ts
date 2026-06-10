/**
 * Construction of the {@link UnderlyingClients} the execution-loop worker injects
 * — the credential/transport-backed clients beneath the metering layer.
 *
 * ## Per-run construction
 *
 * The Action clients (`gmail_api.apply_label`, `pushover_api.send_notification`)
 * resolve **per-run** credentials, so they cannot be built once at startup like
 * the stateless `llm_bedrock` transport:
 *
 *  - `gmail_api.apply_label` authenticates as the **Message's Account**: it
 *    resolves that Account's `gmail_oauth` credential ({@link resolveGmailAccessToken},
 *    refresh-before-expiry) and applies the (templated) Category to the Message,
 *    resolving the label name → id (ensure-exists) inside the live op.
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
 *  - `gmail_api.apply_label` is "not configured" when OAuth is unwired (no
 *    `googleClient`), or when the Message's Account has no live `gmail_oauth`
 *    credential / needs re-auth — the underlying call throws, the Operator's run
 *    fails, and its Triage settles `partial`. The daemon never crashes.
 *  - `pushover_api.send_notification` is "not configured" when the referenced
 *    credential is missing or soft-deleted — same graceful per-op failure.
 *
 * The other Gmail ops (`send_message`, `fetch_metadata`, `list_messages`) have no
 * Action Operator that invokes them through this seam; they stay "not configured"
 * stubs.
 */

import { type Auth, google } from 'googleapis'
import type { Config } from '../config.js'
import { PUSHOVER_KIND, decryptPushoverPayload } from '../config/credential-store.js'
import type { Encryptor } from '../crypto/encryption.js'
import type { DB } from '../db/schema.js'
import type { GoogleOAuthClient } from '../oauth/google-client.js'
import { resolveGmailAccessToken } from '../oauth/token-store.js'
import { type BedrockSend, invokeModel, makeBedrockSend } from './bedrock.js'
import { type GmailOAuth2Client, applyLabel as applyLabelOp } from './gmail.js'
import type { UnderlyingClients } from './make-resource-client.js'
import { sendNotification } from './pushover.js'

/** Build the "throws if invoked" client for an unconfigured Resource op. */
function notConfigured(op: string): never {
  throw new Error(
    `Resource operation '${op}' invoked but no Resource client is configured (credentials/transport wiring is not yet in place)`,
  )
}

/** The Gmail ops with no Action Operator invoking them — see module header. */
type DeferredGmailOps = Pick<UnderlyingClients['gmail_api'], 'send_message' | 'fetch_metadata' | 'list_messages'>

function deferredGmailOps(): DeferredGmailOps {
  return {
    send_message: () => notConfigured('gmail_api.send_message'),
    fetch_metadata: () => notConfigured('gmail_api.fetch_metadata'),
    list_messages: () => notConfigured('gmail_api.list_messages'),
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
 * set; `gmail_api` / `pushover_api` are "not configured" stubs because resolving
 * their credentials needs per-run context (the Message's Account, the Notify
 * Operator's `credentials_id`) this builder does not have. The execution loop
 * uses {@link buildMakeUnderlyingClients} for the credential-backed variant.
 */
export function buildUnderlyingClients(config: Config): UnderlyingClients {
  return {
    llm_bedrock: bedrockClient(config),
    gmail_api: {
      apply_label: () => notConfigured('gmail_api.apply_label'),
      ...deferredGmailOps(),
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

/** The per-run inputs the Action clients need to resolve their credentials. */
export interface UnderlyingClientsRunContext {
  /** The Message's Account id — keys the `gmail_oauth` credential resolution. */
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
   * `null`, `gmail_api.apply_label` is "not configured" (no way to resolve /
   * refresh the Account's access token).
   */
  readonly googleClient: GoogleOAuthClient | null
}

/**
 * Build the per-run {@link MakeUnderlyingClients}. The daemon injects this into
 * the execution loop; the worker calls it once per run with the run's context.
 *
 * `llm_bedrock` is identical to {@link buildUnderlyingClients} (config-only). The
 * Action clients resolve their credentials against `ctx` on each call:
 *  - `gmail_api.apply_label` → the `ctx.accountId` `gmail_oauth` credential.
 *  - `pushover_api.send_notification` → the `ctx.notifyCredentialsId` Pushover
 *    credential.
 *
 * A missing credential / unwired OAuth surfaces as a thrown "not configured" (or
 * the credential-resolver's own error) when the op is invoked — the graceful
 * per-op failure path, never a daemon crash.
 */
export function buildMakeUnderlyingClients(deps: MakeUnderlyingClientsDeps): MakeUnderlyingClients {
  const llm = bedrockClient(deps.config)

  return (ctx) => ({
    llm_bedrock: llm,
    gmail_api: {
      apply_label: (args, signal) => gmailApplyLabel(deps, ctx.accountId, args, signal),
      ...deferredGmailOps(),
    },
    pushover_api: {
      send_notification: (args, signal) => pushoverSend(deps, ctx.notifyCredentialsId, args, signal),
    },
  })
}

/**
 * Apply the (templated) Category to the Message as its Account. Resolves the
 * Account's access token (refresh-before-expiry) and runs the live `applyLabel`
 * op, which itself resolves the label name → id. With no `googleClient` (OAuth
 * unwired) this is "not configured"; a missing / needs-reauth Account credential
 * propagates the resolver's error — both fail the run gracefully.
 */
async function gmailApplyLabel(
  deps: MakeUnderlyingClientsDeps,
  accountId: number,
  args: { backendMessageId: string; label: string },
  signal: AbortSignal,
): Promise<{ applied: boolean }> {
  const { googleClient } = deps
  if (!googleClient) {
    return notConfigured('gmail_api.apply_label')
  }

  const auth = async (): Promise<GmailOAuth2Client> => {
    const accessToken = await resolveGmailAccessToken(deps.db, deps.encryptor, accountId, googleClient)
    const client: Auth.OAuth2Client = new google.auth.OAuth2()
    client.setCredentials({ access_token: accessToken })
    return client
  }

  return applyLabelOp({ auth, signal }, args)
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
