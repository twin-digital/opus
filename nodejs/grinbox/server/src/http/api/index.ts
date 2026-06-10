/**
 * The `/api` read router (architecture.md "Web UI": Hono + Hono RPC, typed
 * end-to-end, unauthenticated lab-internal). Mounts one sub-router per UI
 * surface and chains them so the resulting app *type* carries every route — the
 * web tier builds a typed `hc<ApiRoutes>` client from it (see
 * `packages/server/src/index.ts`, which re-exports `type ApiRoutes`).
 *
 * The read groups are SELECT-only; the write group (Operator save, Pipeline /
 * Account mutation, replay, Limits, the notification Credential) is chained on
 * last so the inferred `ApiRoutes` type carries the mutating routes too.
 *
 * No auth middleware by design (MVP is lab-internal). The router closes over
 * {@link ApiDeps}: the State DB, the injected `now` clock the time-window
 * endpoints (dashboard, limits) compute against, and the optional `encryptor`
 * the credential-store write route needs.
 */

import { Hono } from 'hono'
import { createAccountsRoutes } from './accounts.js'
import { createActivityRoutes } from './activity.js'
import { createCredentialsRoutes } from './credentials.js'
import { createDashboardRoutes } from './dashboard.js'
import { type ApiDeps, type NowSeconds, systemNowSeconds } from './deps.js'
import { createLimitsRoutes } from './limits.js'
import { createMessagesRoutes } from './messages.js'
import { createOperatorsRoutes } from './operators.js'
import { createPipelinesRoutes } from './pipelines.js'
import { createSyncRoutes } from './sync.js'
import { createWriteRoutes } from './writes.js'

export type { ApiDeps, NowSeconds, SyncNow, SyncResult } from './deps.js'
export { systemNowSeconds, resolveActingUserId } from './deps.js'

/**
 * Build the `/api` router. Returns a Hono app whose route groups are chained
 * onto a single base path so Hono's RPC type-inference sees the full surface;
 * the inferred type is exported as `ApiRoutes` from the package root. The write
 * group carries its own `/api/...` paths and is mounted at the root, chained on
 * so the RPC type includes every mutating route.
 */
export function createApiRoutes(deps: ApiDeps) {
  return new Hono()
    .route('/api/accounts', createAccountsRoutes(deps))
    .route('/api/credentials', createCredentialsRoutes(deps))
    .route('/api/pipelines', createPipelinesRoutes(deps))
    .route('/api/messages', createMessagesRoutes(deps))
    .route('/api/operators', createOperatorsRoutes(deps))
    .route('/api/limits', createLimitsRoutes(deps))
    .route('/api/activity', createActivityRoutes(deps))
    .route('/api/dashboard', createDashboardRoutes(deps))
    .route('/api/sync', createSyncRoutes(deps))
    .route('/', createWriteRoutes(deps))
}

/** The Hono app type the web tier consumes via `hc<ApiRoutes>(baseUrl)`. */
export type ApiRoutes = ReturnType<typeof createApiRoutes>

/**
 * Convenience: build {@link ApiDeps} from a DB and an optional clock, defaulting
 * to the system clock. `createApp` uses this so callers only pass a DB.
 */
export function makeApiDeps(db: ApiDeps['db'], now: NowSeconds = systemNowSeconds): ApiDeps {
  return { db, now }
}
