import type { Health } from '@twin-digital/grinbox-shared'
import { Hono } from 'hono'
import type { Config } from '../config.js'
import type { Encryptor } from '../crypto/encryption.js'
import type { DB } from '../db/index.js'
import type { GoogleOAuthClient } from '../oauth/google-client.js'
import { type PendingAuthStore, createPendingAuthStore } from '../oauth/pending-auth.js'
import { createOAuthRoutes } from '../oauth/routes.js'
import { type NowSeconds, type SyncNow, createApiRoutes, systemNowSeconds } from './api/index.js'
import { mountStatic, resolveWebDistPath } from './static.js'

/**
 * Dependencies the HTTP app composes over. Dependency-injected so every route
 * group (`/healthz`, `/oauth`, `/api`) shares one wiring and so tests can build
 * the app against a temp DB without booting the process.
 */
export interface AppDeps {
  db: DB
  config: Config
  encryptor: Encryptor
  /** Build version surfaced by `/healthz`. */
  version: string
  /**
   * The pending-auth store backing the `/oauth/*` flow. The daemon constructs
   * one in-memory store for the process; omitted only by callers that don't
   * exercise OAuth (a default store is created so `/healthz`-only tests need not
   * supply one).
   */
  pendingAuthStore?: PendingAuthStore
  /**
   * The Google-client seam, or `null`/omitted when the OAuth client isn't
   * configured (no `GRINBOX_OAUTH_CLIENT_ID`/`_SECRET`). The `/oauth/*` routes
   * mount either way; without a client they report "OAuth not configured" rather
   * than crashing boot.
   */
  googleClient?: GoogleOAuthClient | null
  /**
   * The "now" seam (UNIX seconds) the `/api` time-window endpoints (dashboard
   * 24h/today, limits window state) compute against. Defaults to the system
   * clock; tests inject a frozen clock so the window math is deterministic.
   */
  now?: NowSeconds
  /**
   * On-demand poll trigger for `POST /api/sync` (the Inbox refresh button). The
   * daemon supplies the poll scheduler's `pollAllNow`; omitted in tests / OAuth-
   * unconfigured boots, where the route reports `sync_unavailable`.
   */
  syncNow?: SyncNow
}

/**
 * Create the Daemon's Hono app.
 *
 * Mounts `GET /healthz`, the `/oauth/*` callback routes, and the `/api/*` read
 * router onto one instance so the typed-RPC surface composes from a single app.
 */
export function createApp(deps: AppDeps): Hono {
  const app = new Hono()

  app.get('/healthz', (c) => {
    const body: Health = { status: 'ok', version: deps.version }
    return c.json(body)
  })

  // `/oauth/*` routes: `POST /oauth/start` (internal) + `GET /oauth/callback`
  // (the one public, TLS-proxied path). Mounted with the daemon's pending-auth
  // store and Google client; a `null` client makes them report "not configured".
  app.route(
    '/',
    createOAuthRoutes({
      db: deps.db,
      encryptor: deps.encryptor,
      store: deps.pendingAuthStore ?? createPendingAuthStore(),
      googleClient: deps.googleClient ?? null,
      openerOrigin: deps.config.oauthOpenerOrigin,
    }),
  )

  // `/api/*` read routes (accounts, pipelines, messages, limits, activity,
  // dashboard). The router carries its own `/api/...` paths; mounting at the
  // root composes them onto this app. The typed surface the web client consumes
  // is exported as `ApiRoutes` from the package root.
  app.route(
    '/',
    createApiRoutes({
      db: deps.db,
      now: deps.now ?? systemNowSeconds,
      encryptor: deps.encryptor,
      syncNow: deps.syncNow,
    }),
  )

  // Static SPA + client-routing fallback, mounted LAST so the matched
  // `/healthz`, `/oauth/*`, and `/api/*` routes above win and an unknown
  // `/api/*` keeps the API's JSON 404. Gracefully skipped (with a warning) when
  // the web build is absent, so dev/test runs still serve the API.
  mountStatic(app, resolveWebDistPath(deps.config.webDistPath))

  return app
}
