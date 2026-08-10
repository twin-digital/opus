/**
 * The underlying Pushover send for `pushover_api.send_notification`, beneath the
 * metering/Limit layer. Posts to the Pushover messages API.
 *
 * Both the transport (a `fetch`-like function) and the credentials are injected:
 * S6/M2 supplies the real `globalThis.fetch` and decrypts the `pushover`
 * Credential (`{ app_token, user_key }`) to fill {@link PushoverCredentials}; S4
 * never reads the `credentials` table. Tests pass a fake fetch + dummy creds.
 */

/** The Pushover API endpoint; overridable for tests. */
export const PUSHOVER_MESSAGES_URL = 'https://api.pushover.net/1/messages.json'

/** Decrypted Pushover credential payload (data-model.md `credentials` kind). */
export interface PushoverCredentials {
  readonly appToken: string
  readonly userKey: string
}

/** Minimal `fetch`-shaped transport (a subset of the DOM `fetch` signature). */
export type FetchLike = (
  url: string,
  init: {
    method: string
    headers: Record<string, string>
    body: string
    signal: AbortSignal
  },
) => Promise<{
  ok: boolean
  status: number
  text(): Promise<string>
}>

export interface PushoverDeps {
  readonly fetch: FetchLike
  readonly credentials: PushoverCredentials
  readonly signal: AbortSignal
  /** Override the endpoint (tests). Defaults to {@link PUSHOVER_MESSAGES_URL}. */
  readonly url?: string
}

/** Thrown when the Pushover API returns a non-2xx response. */
export class PushoverApiError extends Error {
  override readonly name = 'PushoverApiError'
}

/**
 * Send a Pushover notification. Returns the Pushover `request` id as
 * `message_id`. A non-2xx response throws {@link PushoverApiError} — the retry
 * policy is no-retry (send is non-idempotent), so this error surfaces directly.
 */
export async function sendNotification(
  deps: PushoverDeps,
  args: { title?: string; message: string; url?: string; url_title?: string },
): Promise<{ message_id: string }> {
  const params = new URLSearchParams({
    token: deps.credentials.appToken,
    user: deps.credentials.userKey,
    message: args.message,
  })
  if (args.title !== undefined) {
    params.set('title', args.title)
  }
  if (args.url !== undefined) {
    params.set('url', args.url)
  }
  if (args.url_title !== undefined) {
    params.set('url_title', args.url_title)
  }

  const res = await deps.fetch(deps.url ?? PUSHOVER_MESSAGES_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: deps.signal,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new PushoverApiError(`Pushover send failed with status ${res.status}: ${text}`)
  }
  let requestId = ''
  try {
    const parsed = JSON.parse(text) as { request?: unknown }
    if (typeof parsed.request === 'string') {
      requestId = parsed.request
    }
  } catch {
    // A 2xx with an unparseable body is unexpected but not fatal; the send
    // succeeded. Leave message_id empty rather than failing the operation.
  }
  return { message_id: requestId }
}
