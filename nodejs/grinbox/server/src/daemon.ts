import { type ServerType, serve } from '@hono/node-server'
import { type Config, loadConfig } from './config.js'
import { makeEncryptor } from './crypto/encryption.js'
import { type DB, closeDatabase, ensureBootstrapUser, openDatabase, runMigrations } from './db/index.js'
import { type ExecutionLoop, createExecutionLoop, recoverInterruptedRuns } from './execution/index.js'
import { createApp } from './http/app.js'
import { type GoogleOAuthClient, createPendingAuthStore, makeGoogleOAuthClient } from './oauth/index.js'
import {
  type PollScheduler,
  type ProviderFactory,
  createLiveProviderFactory,
  createPollScheduler,
  productionProviderFactory,
} from './poll/index.js'
import { buildMakeUnderlyingClients } from './resources/index.js'
import { version } from './version.js'

/**
 * A running Daemon: the live HTTP server and State DB connection, plus a
 * `shutdown` that performs the documented graceful-shutdown sequence
 * (pipeline-runtime.md "Shutdown"). Returned by {@link startDaemon} so a caller
 * (the entrypoint, or a test) can stop it deterministically.
 */
export interface Daemon {
  server: ServerType
  db: DB
  config: Config
  /** The running execution loop (exposed so tests can drive it deterministically). */
  executionLoop: ExecutionLoop
  /** The running poll scheduler (exposed so tests can drive it deterministically). */
  pollScheduler: PollScheduler
  /** Graceful shutdown: stop the HTTP server, stop the poll loop, drain workers,
   * close the DB, then resolve. Idempotent. */
  shutdown(): Promise<void>
}

/**
 * Bring up the Daemon. Startup sequence (pipeline-runtime.md "Startup
 * sequence"), minus the loops that are later tasks:
 *
 *   1. load + validate config
 *   2. open the State DB
 *   3. run pending migrations
 *   4. bootstrap the single MVP User + default Limits if none exists
 *   5. build the encryption seam from the configured key
 *   6. recovery sweep — mark interrupted `running` runs `failed`
 *   7. create the HTTP app and start listening on host:port
 *   8. start the execution loop
 *   9. start the poll loop
 *
 * The poll loop (per-Account fetch + Triage enqueue) only enqueues Triages; the
 * execution loop discovers their `pending` runs on its own ticks, so there is no
 * explicit hand-off. The poll ProviderFactory is credential-backed when OAuth is
 * configured and the null factory otherwise (so an unconfigured daemon ticks but
 * finds nothing pollable).
 *
 * Throws on any startup failure (bad config, migration error). The entrypoint
 * turns a throw into a non-zero exit; systemd restarts on its own schedule.
 */
export async function startDaemon(env: NodeJS.ProcessEnv = process.env): Promise<Daemon> {
  const config = loadConfig(env)

  const db = openDatabase(config.dbPath)
  try {
    await runMigrations(db)
  } catch (err) {
    // Migrations failed: don't leak the open connection on the way out.
    await closeDatabase(db)
    throw err
  }

  // First-run bootstrap: a freshly-migrated DB has no User, so every
  // User-scoped write would 4xx (resolveActingUserId → null). Provision the
  // single MVP User + its default Limits when none exists, idempotently.
  const bootstrap = await ensureBootstrapUser(db, env)
  if (bootstrap.created) {
    console.log('[grinbox] provisioned initial user')
  }

  const encryptor = makeEncryptor(config.tokenEncKey)

  // Recovery sweep: mark `triage_operator_runs` rows stuck in 'running' (a
  // previous process was interrupted before they finished) as 'failed', settling
  // their Triages. Done before the loop starts so it never sees a stale row.
  await recoverInterruptedRuns(db)

  // OAuth wiring: one in-memory pending-auth store for the process, and the live
  // Google client only when the OAuth client id+secret are configured. Without
  // them the `/oauth/*` routes report "not configured" rather than crashing boot
  // (oauth-flow.md "Client credentials are deployment config"). The same Google
  // client backs both the live poll ProviderFactory and the per-run Gmail Action
  // client below, so it is built before either.
  const pendingAuthStore = createPendingAuthStore()
  let googleClient: GoogleOAuthClient | null = null
  if (config.oauthClientId && config.oauthClientSecret) {
    googleClient = makeGoogleOAuthClient({
      clientId: config.oauthClientId,
      clientSecret: config.oauthClientSecret,
      redirectUri: config.oauthRedirectUri,
    })
  } else {
    console.warn(
      '[grinbox] OAuth client not configured (GRINBOX_OAUTH_CLIENT_ID/_SECRET unset); /oauth routes will report not-configured',
    )
  }

  // The execution loop's per-run underlying Resource transports. `llm_bedrock` is
  // live when `bedrockRegion` is configured (so an LLM-Tagger pipeline runs
  // against Bedrock). The Action clients resolve per-run credentials when the
  // worker builds them: `gmail_api.apply_label` authenticates as the Message's
  // Account (needs `googleClient`); `pushover_api.send_notification` resolves the
  // Notify Operator's referenced credential. Any of these being unconfigured
  // (no Bedrock region, no OAuth client, no/needs-reauth Account credential, no
  // Pushover credential) throws only if an Operator actually invokes it — a
  // per-Operator failure that settles its Triage `partial`, not a daemon crash.
  // Rule-based pipelines declare no Resources and never touch any of them.
  const executionLoop = createExecutionLoop({
    db,
    config,
    makeClients: buildMakeUnderlyingClients({
      db,
      encryptor,
      config,
      googleClient,
    }),
  })

  // Poll loop: per-Account fetch + Triage enqueue, on a croner cadence. When
  // OAuth is configured the live ProviderFactory resolves each Gmail Account's
  // stored credential and returns a credential-backed `GmailProvider`; an Account
  // with no usable credential (needs-reauth) is skipped on its first call (see
  // createLiveProviderFactory). When OAuth is unconfigured there is no Google
  // client to resolve tokens, so the factory stays the null factory — the loop
  // ticks and finds nothing pollable (unchanged). The loop enqueues Triages; the
  // execution loop picks up their pending runs.
  const providerFactory: ProviderFactory =
    googleClient !== null ? createLiveProviderFactory({ db, encryptor, googleClient }) : productionProviderFactory()
  const pollScheduler = createPollScheduler({
    db,
    config,
    providerFactory,
  })

  const app = createApp({
    db,
    config,
    encryptor,
    version,
    pendingAuthStore,
    googleClient,
    // The Inbox "sync" button: full resync of every eligible Account (re-fetch
    // all in-inbox mail, backfilling missing + refreshing existing), summarised
    // to a count of accounts synced + new Messages found.
    syncNow: async () => {
      const summaries = await pollScheduler.resyncAllNow()
      return {
        accounts: summaries.length,
        newMessages: summaries.reduce((n, s) => n + s.newMessages, 0),
      }
    },
  })

  const server = serve({
    fetch: app.fetch,
    hostname: config.httpHost,
    port: config.httpPort,
  })

  // Execution loop: pull ready triage_operator_runs and dispatch to workers.
  executionLoop.start()

  // Poll loop: start after the execution loop so any Triage it enqueues has a
  // running loop to discover it.
  pollScheduler.start()

  console.log(`[grinbox] daemon listening on http://${config.httpHost}:${config.httpPort} (db=${config.dbPath})`)

  let stopped = false
  const shutdown = async (): Promise<void> => {
    if (stopped) {
      return
    }
    stopped = true

    // 1. Stop accepting new HTTP requests.
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })

    // 2. Stop the poll loop so no new Triages are enqueued during drain.
    pollScheduler.stop()

    // 3. Stop the execution loop and drain in-flight workers. Workers still in
    //    flight resolve before this returns; any left `running` on a crash are
    //    swept on next startup by recoverInterruptedRuns.
    await executionLoop.stop()

    // Final step: close the DB connection cleanly.
    await closeDatabase(db)

    console.log('[grinbox] shutdown complete')
  }

  return { server, db, config, executionLoop, pollScheduler, shutdown }
}
