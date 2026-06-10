/**
 * `@twin-digital/grinbox-server` library surface. Importing this barrel has NO side effects —
 * it does not start a server. The "run the process" side effect lives in
 * `main.ts` (the systemd entrypoint); tests and other packages import the
 * factories and types from here.
 */

export { version } from './version.js'

/**
 * State DB surface. S2/S3 write patterns and the daemon import the connection,
 * migrator, schema types, and seed helper from the package root, e.g.
 * `import { openDatabase, runMigrations } from '@twin-digital/grinbox-server'`.
 */
export * from './db/index.js'

// Config / env loader.
export { type Config, loadConfig, TOKEN_ENC_KEY_ENV, TOKEN_ENC_KEY_BYTES } from './config.js'

// Encryption seam (consumed by S6 OAuth token storage).
export { type Encryptor, makeEncryptor } from './crypto/encryption.js'

// HTTP app factory (the `/healthz`, `/oauth`, and `/api` route groups compose
// onto it).
export { type AppDeps, createApp } from './http/app.js'

// The `/api` read router + its typed surface. The web tier imports
// `type { ApiRoutes }` from `@twin-digital/grinbox-server` and builds a typed Hono RPC
// client with `hc<ApiRoutes>(baseUrl)`; `ApiRoutes` carries every read route's
// path + response shape so the client is end-to-end typed with no hand-written
// DTOs. Response DTO types live inline with each route group (re-exported here
// for callers that want the named shapes directly).
export {
  type ApiRoutes,
  type ApiDeps,
  type NowSeconds,
  createApiRoutes,
  makeApiDeps,
  systemNowSeconds,
} from './http/api/index.js'
export type { AccountStatus, AccountSummary } from './http/api/accounts.js'
export type { CredentialSummary } from './http/api/credentials.js'
export type { PipelineSummary, PipelineDetail, OperatorDetail, TagKeyRegistryEntry } from './http/api/pipelines.js'
export type {
  CurrentTag,
  MessageRow,
  MessageListResponse,
  OperatorRunDetail,
  TriageEventDetail,
  TriageTagDetail,
} from './http/api/messages.js'
export type { LimitEntry, WindowUsage, MessageUsage } from './http/api/limits.js'
export type { ActivityEntry, ActivityResponse, ActivitySeverity } from './http/api/activity.js'
export type { DashboardResponse, TopTag, RecentOperatorEdit } from './http/api/dashboard.js'

// Daemon bootstrap (the entrypoint in main.ts drives this).
export { type Daemon, startDaemon } from './daemon.js'

// Operator framework (S1): behavioral registry, runOperator, built-in O1.
export * from './operators/index.js'

// Pipeline write patterns + validation (S2/S3): edit-lock, Pipeline validation,
// Operator save/enable/disable/soft-delete, Credential/Pipeline soft-delete,
// Triage enqueue, optimistic claim, run completion + settlement.
export * from './pipeline/index.js'

// Metered Resource clients + Limit enforcement (S4): the Limit engine, the
// per-operation retry policy, the injectable bedrock/gmail/pushover transports,
// and the metering factory that produces the `MakeResourceClient` the worker
// wires into `runOperator`.
export * from './resources/index.js'

// Execution loop + worker pool: input classification, the worker that runs one
// claimed Operator run, the tick-based loop that dispatches ready runs, and the
// startup recovery sweep for interrupted `running` runs.
export * from './execution/index.js'

// Provider read path (M1): the backend-agnostic Provider seam, the Gmail
// Provider (History-API discovery + normalization), the injected Gmail-client
// interface OAuth fills, and the `messages` UPSERT the poll loop calls.
export * from './providers/index.js'

// Poll loop: per-Account poll cycle (fetch + upsert + enqueue), the
// ProviderFactory seam OAuth fills, and the croner-driven scheduler that polls
// due Accounts on a cadence.
export * from './poll/index.js'

// Gmail OAuth: the Google-client seam, pending-auth store, start/callback flow,
// encrypted token storage + refresh lifecycle, and the `/oauth/*` routes. The
// live ProviderFactory follow-up consumes `resolveGmailAccessToken`.
export * from './oauth/index.js'
