/**
 * The underlying Gmail operations for `gmail_api.{fetch_metadata, list_messages,
 * apply_label, send_message}`, beneath the metering/Limit layer.
 *
 * Auth is an injected seam: the caller supplies a {@link GmailAuthProvider} that
 * yields a usable OAuth2 client (or, for tests, a mock). S6/M2 wire the real
 * token source (decrypting the `gmail_oauth` Credential and refreshing as
 * needed); S4 never reads the `credentials` table. This keeps the metering layer
 * decoupled from credential resolution.
 *
 * `googleapis` (`google.gmail`) is the transport. `google` is a value import
 * (used to construct the gmail service); the request/response shapes are typed
 * loosely against the parts we use to avoid coupling to googleapis' generated
 * surface.
 */

import { type Auth, google } from 'googleapis'

/** The authenticated OAuth2 client `google.gmail` accepts. */
export type GmailOAuth2Client = Auth.OAuth2Client

/**
 * Supplies the authenticated OAuth2 client for a given Gmail call. Async because
 * the real implementation (S6/M2) may refresh an expired access token before
 * returning. Injected so tests pass a stub and S4 stays free of credential
 * logic.
 */
export type GmailAuthProvider = () => Promise<GmailOAuth2Client>

export interface GmailDeps {
  readonly auth: GmailAuthProvider
  readonly signal: AbortSignal
}

/**
 * Fetch a Message's headers (the metadata-format `users.messages.get`). Returns
 * a lowercased-header-name → value map.
 */
export async function fetchMetadata(
  deps: GmailDeps,
  args: { backendMessageId: string },
): Promise<{ headers: Record<string, string> }> {
  const gmail = google.gmail({ version: 'v1', auth: await deps.auth() })
  const res = await gmail.users.messages.get(
    {
      userId: 'me',
      id: args.backendMessageId,
      format: 'metadata',
    },
    { signal: deps.signal },
  )
  const headers: Record<string, string> = {}
  for (const h of res.data.payload?.headers ?? []) {
    if (h.name && typeof h.value === 'string') {
      headers[h.name.toLowerCase()] = h.value
    }
  }
  return { headers }
}

/** List Message ids matching a Gmail search query (`users.messages.list`). */
export async function listMessages(deps: GmailDeps, args: { query: string }): Promise<{ ids: string[] }> {
  const gmail = google.gmail({ version: 'v1', auth: await deps.auth() })
  const res = await gmail.users.messages.list({ userId: 'me', q: args.query }, { signal: deps.signal })
  const ids = (res.data.messages ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string')
  return { ids }
}

/**
 * Apply a label to a Message (`users.messages.modify` with `addLabelIds`).
 *
 * `args.label` is a label **name**, not an id — Operators and the Provider
 * categorize by human-readable Category name. Gmail's `messages.modify` needs
 * label **ids**, so this first resolves the name to an id, creating the label
 * when it does not yet exist (`users.labels.list` → match by name →
 * `users.labels.create` on miss). The resolved id is then added to the Message.
 *
 * Idempotent — re-applying a present label is a no-op on Gmail's side, and an
 * already-existing label is reused rather than re-created, which is why the
 * retry policy permits retries.
 */
export async function applyLabel(
  deps: GmailDeps,
  args: { backendMessageId: string; label: string },
): Promise<{ applied: boolean }> {
  const gmail = google.gmail({ version: 'v1', auth: await deps.auth() })
  const labelId = await resolveLabelId(gmail, args.label, deps.signal)
  await gmail.users.messages.modify(
    {
      userId: 'me',
      id: args.backendMessageId,
      requestBody: { addLabelIds: [labelId] },
    },
    { signal: deps.signal },
  )
  return { applied: true }
}

/** The minimal `google.gmail` surface `resolveLabelId` reads. */
type GmailService = ReturnType<typeof google.gmail>

/**
 * Resolve a label **name** to its Gmail label **id**, creating the label when it
 * is absent. Returns the id of the existing or newly-created label. A label
 * name compares case-sensitively as Gmail stores it.
 */
async function resolveLabelId(gmail: GmailService, name: string, signal: AbortSignal): Promise<string> {
  const list = await gmail.users.labels.list({ userId: 'me' }, { signal })
  for (const label of list.data.labels ?? []) {
    if (label.name === name && typeof label.id === 'string') {
      return label.id
    }
  }
  const created = await gmail.users.labels.create(
    {
      userId: 'me',
      requestBody: {
        name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    },
    { signal },
  )
  const id = created.data.id
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`Gmail label create for '${name}' returned no id`)
  }
  return id
}

/**
 * Send an email (`users.messages.send` with a base64url RFC822 raw body).
 * Non-idempotent — the retry policy is no-retry, so a transient failure is
 * surfaced rather than risking a double-send.
 */
export async function sendMessage(
  deps: GmailDeps,
  args: { to: string; subject: string; body: string },
): Promise<{ message_id: string }> {
  const gmail = google.gmail({ version: 'v1', auth: await deps.auth() })
  const raw = Buffer.from(
    [`To: ${args.to}`, `Subject: ${args.subject}`, 'Content-Type: text/plain; charset="UTF-8"', '', args.body].join(
      '\r\n',
    ),
  )
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } }, { signal: deps.signal })
  return { message_id: res.data.id ?? '' }
}
