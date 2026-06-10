/**
 * The Hono `/oauth/*` routes (oauth-flow.md "The flow"). Two endpoints:
 *
 *  - `POST /oauth/start` — **internal**. The SPA calls it to begin a flow;
 *    returns the consent URL for `window.open`. Optionally binds an existing
 *    `account_id` for re-auth.
 *  - `GET /oauth/callback` — **the one public path** (proxied over TLS). Google
 *    redirects the popup here with `code` + `state`; it completes the flow and
 *    returns a tiny HTML page that `postMessage`s `{ ok, account_id }` to the
 *    opener (internal origin) and closes.
 *
 * Both routes degrade gracefully when the OAuth client isn't configured: the
 * daemon mounts them with a `null` Google client when `GRINBOX_OAUTH_CLIENT_ID`/
 * `_SECRET` are absent, and they return a clear "OAuth not configured" error
 * rather than crashing boot.
 */

import { type Context, Hono } from 'hono'
import type { Encryptor } from '../crypto/encryption.js'
import type { DB } from '../db/schema.js'
import { AccountNotFoundError, InvalidStateError, completeAuthorization, startAuthorization } from './flow.js'
import { type GoogleOAuthClient, MissingRefreshTokenError } from './google-client.js'
import type { PendingAuthStore } from './pending-auth.js'

/** Dependencies the `/oauth` routes close over. */
export interface OAuthRouteDeps {
  readonly db: DB
  readonly encryptor: Encryptor
  readonly store: PendingAuthStore
  /**
   * The Google-client seam, or `null` when the OAuth client isn't configured.
   * `null` makes every route return a 503 "OAuth not configured" instead of
   * crashing — the daemon boots fine without the client id/secret.
   */
  readonly googleClient: GoogleOAuthClient | null
  /**
   * Explicit `postMessage` target origin (the SPA's internal origin). When
   * `undefined`, the page posts with `'*'` and relies on the SPA-side
   * `event.origin` check (oauth-flow.md "Cross-origin postMessage").
   */
  readonly openerOrigin?: string
}

/** HTML-escape a string for safe embedding in the callback page. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Render the callback's tiny HTML page. It `postMessage`s the result to the
 * opener with an explicit `targetOrigin` (or `'*'` when none is configured),
 * then closes the popup. The payload is `{ source: 'grinbox-oauth', ok,
 * account_id?, error? }`; the SPA verifies `event.origin` before trusting it.
 */
function callbackPage(
  result: { ok: true; accountId: number } | { ok: false; error: string },
  targetOrigin: string | undefined,
): string {
  const payload =
    result.ok ?
      { source: 'grinbox-oauth', ok: true, account_id: result.accountId }
    : { source: 'grinbox-oauth', ok: false, error: result.error }
  // JSON.stringify is safe to inline; close `</script` defensively.
  const json = JSON.stringify(payload).replace(/</g, '\\u003c')
  const target = JSON.stringify(targetOrigin ?? '*')
  const heading =
    result.ok ?
      'Authorization complete. You can close this window.'
    : `Authorization failed: ${escapeHtml(result.error)}`
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Grinbox authorization</title></head>
<body>
<p>${heading}</p>
<script>
  (function () {
    var payload = ${json};
    try {
      if (window.opener) window.opener.postMessage(payload, ${target});
    } catch (e) {}
    window.close();
  })();
</script>
</body>
</html>`
}

/** The body shape `POST /oauth/start` accepts. */
interface StartBody {
  account_id?: number
}

/**
 * Build the `/oauth` sub-app to mount under the main Hono app. Returns a fresh
 * Hono instance; `createApp` mounts it at the root (the routes carry their own
 * `/oauth/...` paths).
 */
export function createOAuthRoutes(deps: OAuthRouteDeps): Hono {
  const app = new Hono()

  function notConfigured(c: Context) {
    return c.json(
      {
        error: 'oauth_not_configured',
        message:
          'OAuth is not configured: set GRINBOX_OAUTH_CLIENT_ID and GRINBOX_OAUTH_CLIENT_SECRET to enable Gmail authorization',
      },
      503,
    )
  }

  // POST /oauth/start — internal. Returns the consent URL to window.open.
  app.post('/oauth/start', async (c) => {
    if (deps.googleClient === null) {
      return notConfigured(c)
    }

    let body: StartBody = {}
    try {
      // Tolerate an empty body (new-account flow sends nothing).
      const text = await c.req.text()
      if (text.length > 0) {
        body = JSON.parse(text) as StartBody
      }
    } catch {
      return c.json({ error: 'invalid_body' }, 400)
    }

    const accountId = typeof body.account_id === 'number' ? body.account_id : undefined
    const { consentUrl } = startAuthorization(deps.store, deps.googleClient, {
      accountId,
    })
    return c.json({ consent_url: consentUrl })
  })

  // GET /oauth/callback — the one public path. Completes the flow; returns the
  // popup HTML page. Errors render an error page (still HTML, still posts back)
  // so the popup always closes cleanly rather than showing a raw JSON 500.
  app.get('/oauth/callback', async (c) => {
    if (deps.googleClient === null) {
      c.header('content-type', 'text/html; charset=utf-8')
      return c.body(callbackPage({ ok: false, error: 'OAuth is not configured' }, deps.openerOrigin), 503)
    }

    const code = c.req.query('code')
    const state = c.req.query('state')
    if (!code || !state) {
      c.header('content-type', 'text/html; charset=utf-8')
      return c.body(callbackPage({ ok: false, error: 'missing code or state' }, deps.openerOrigin), 400)
    }

    try {
      const result = await completeAuthorization(deps.db, deps.encryptor, deps.store, deps.googleClient, {
        state,
        code,
      })
      c.header('content-type', 'text/html; charset=utf-8')
      return c.body(callbackPage({ ok: true, accountId: result.accountId }, deps.openerOrigin), 200)
    } catch (err) {
      const { status, message } = classifyCallbackError(err)
      c.header('content-type', 'text/html; charset=utf-8')
      return c.body(callbackPage({ ok: false, error: message }, deps.openerOrigin), status)
    }
  })

  return app
}

/** Map a callback error onto a user-facing status + message (no secrets). */
function classifyCallbackError(err: unknown): {
  status: 400 | 500
  message: string
} {
  if (err instanceof InvalidStateError) {
    return { status: 400, message: 'invalid or expired authorization state' }
  }
  if (err instanceof MissingRefreshTokenError) {
    // The actionable retry instruction — the consent screen must be shown.
    return { status: 400, message: err.message }
  }
  if (err instanceof AccountNotFoundError) {
    return { status: 400, message: 'account to re-authorize was not found' }
  }
  return { status: 500, message: 'authorization failed' }
}
