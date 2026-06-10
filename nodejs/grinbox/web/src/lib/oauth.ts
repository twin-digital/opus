import { apiBase } from './api.js'

/**
 * Client side of the Gmail OAuth pop-up flow (oauth-flow.md "The flow").
 *
 * The SPA calls `POST /oauth/start` (same base origin as the API, but the route
 * lives on the app root, not under `/api`, so it's outside the typed `hc` client
 * and is fetched directly). The daemon returns a Google `consent_url`; the SPA
 * `window.open`s it in a pop-up and waits for the callback page to
 * `postMessage` `{ source: 'grinbox-oauth', ok, account_id?, error? }` back to
 * the opener.
 *
 * Security: the opener is the internal SPA origin; the pop-up that posts is the
 * *public* callback origin (`https://grinbox.pegasuspad.com`). The SPA verifies
 * `event.origin` matches that public callback origin before trusting any
 * message — it never trusts a post from an arbitrary origin. The callback origin
 * is derived from the `redirect_uri` Google echoes in the consent URL, and can
 * be pinned explicitly via `VITE_OAUTH_CALLBACK_ORIGIN`.
 */

/** The `postMessage` payload the callback page posts to the opener. */
interface OAuthMessage {
  source: 'grinbox-oauth'
  ok: boolean
  account_id?: number
  error?: string
}

/** Distinct outcomes the caller renders differently (toast copy / state). */
export type OAuthResult =
  | { kind: 'success'; accountId: number }
  | { kind: 'not_configured'; message: string }
  | { kind: 'cancelled' } // user closed the pop-up without finishing
  | { kind: 'popup_blocked' }
  | { kind: 'error'; message: string }

const POPUP_FEATURES = 'popup,width=520,height=680'

/** Explicit override; otherwise the origin is taken from the consent URL. */
const CALLBACK_ORIGIN_OVERRIDE = import.meta.env.VITE_OAUTH_CALLBACK_ORIGIN as string | undefined

/**
 * Pull the public callback origin out of a Google consent URL's `redirect_uri`
 * query param (e.g. `https://grinbox.pegasuspad.com/oauth/callback` →
 * `https://grinbox.pegasuspad.com`). Returns `null` if it can't be parsed so the
 * caller can fall back to the explicit override / a strict reject.
 */
export function callbackOriginFromConsentUrl(consentUrl: string): string | null {
  try {
    const redirect = new URL(consentUrl).searchParams.get('redirect_uri')
    if (!redirect) {
      return null
    }
    return new URL(redirect).origin
  } catch {
    return null
  }
}

interface StartResponse {
  consent_url: string
}

interface NotConfiguredResponse {
  error: string
  message?: string
}

/**
 * Run one OAuth flow. When `accountId` is provided the flow re-authorizes that
 * existing Account (oauth-flow.md "Re-auth"); otherwise it adds a new one.
 *
 * Resolves with a discriminated {@link OAuthResult}; never rejects on the
 * expected branches (503-not-configured, pop-up blocked, user cancelled), so
 * callers map the outcome to a toast without try/catch. A thrown error only
 * surfaces a genuinely unexpected failure (network down mid-start).
 */
export async function runOAuthFlow(options?: { accountId?: number }): Promise<OAuthResult> {
  let res: Response
  try {
    res = await fetch(`${apiBase}/oauth/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(options?.accountId !== undefined ? { account_id: options.accountId } : {}),
    })
  } catch {
    return {
      kind: 'error',
      message: "Couldn't reach the Grinbox daemon to start authorization.",
    }
  }

  if (res.status === 503) {
    const body = (await res.json().catch(() => ({}))) as NotConfiguredResponse
    return {
      kind: 'not_configured',
      message:
        body.message ??
        "Gmail OAuth isn't configured on this deployment. Set the OAuth client id/secret on the daemon to enable Add Account.",
    }
  }

  if (!res.ok) {
    return {
      kind: 'error',
      message: `Couldn't start authorization (HTTP ${res.status}).`,
    }
  }

  const { consent_url } = (await res.json()) as StartResponse
  const expectedOrigin = CALLBACK_ORIGIN_OVERRIDE ?? callbackOriginFromConsentUrl(consent_url)

  const popup = window.open(consent_url, 'grinbox-oauth', POPUP_FEATURES)
  if (!popup) {
    return { kind: 'popup_blocked' }
  }

  return await waitForCallback(popup, expectedOrigin)
}

/**
 * Wait for the pop-up to post its result, or for the user to close it. Resolves
 * (never rejects) with the mapped {@link OAuthResult}. Listeners + the
 * close-poll are always torn down before resolving so no work leaks past the
 * flow (a hang is the failure mode this guards against).
 */
function waitForCallback(popup: Window, expectedOrigin: string | null): Promise<OAuthResult> {
  return new Promise<OAuthResult>((resolve) => {
    let settled = false

    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      window.clearInterval(closeTimer)
    }
    const finish = (result: OAuthResult) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve(result)
    }

    const onMessage = (event: MessageEvent) => {
      // Trust only the public callback origin. With no expected origin known we
      // can't verify, so we reject rather than trust a cross-origin post.
      if (expectedOrigin === null || event.origin !== expectedOrigin) {
        return
      }
      const data = event.data as OAuthMessage | undefined
      if (data?.source !== 'grinbox-oauth') {
        return
      }

      if (data.ok && typeof data.account_id === 'number') {
        finish({ kind: 'success', accountId: data.account_id })
      } else {
        finish({
          kind: 'error',
          message: data.error ?? 'Authorization failed.',
        })
      }
      // The callback page closes itself; nothing else to do.
    }

    window.addEventListener('message', onMessage)

    // Detect the user closing the pop-up without completing consent. The
    // callback page closes the pop-up too, but the message arrives first and
    // settles the promise, so this only fires on a genuine cancel.
    const closeTimer = window.setInterval(() => {
      if (popup.closed) {
        finish({ kind: 'cancelled' })
      }
    }, 500)
  })
}
