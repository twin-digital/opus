import { type ServerType, serve } from '@hono/node-server'
import { type PendingArchiveScheduler, createPendingArchiveScheduler } from './archive/index.js'
import { type Config, loadConfig } from './config.js'
import { makeEncryptor } from './crypto/encryption.js'
import {
  type DB,
  closeDatabase,
  ensureBootstrapUser,
  openDatabase,
  reconcileDefaultLimits,
  runMigrations,
} from './db/index.js'
import { type DigestScheduler, createDigestScheduler, recoverInterruptedDigestRuns } from './digest/index.js'
import { type ExecutionLoop, createExecutionLoop, recoverInterruptedRuns } from './execution/index.js'
import { type Heartbeat, createHeartbeat } from './heartbeat.js'
import { createApp } from './http/app.js'
import { createImapWiring } from './providers/imap/imap-wiring.js'
import { type GoogleOAuthClient, createPendingAuthStore, makeGoogleOAuthClient } from './oauth/index.js'
import {
  type PollScheduler,
  type ProviderFactory,
  createLiveProviderFactory,
  createPollScheduler,
} from './poll/index.js'
import { buildMakeUnderlyingClients } from './resources/index.js'
import { version } from './version.js'

/**
 * A running Daemon: the live HTTP server and State DB connection, plus a
 * `shutdown` that performs the graceful-shutdown sequence. Returned by {@link startDaemon} so a caller
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
  /** The running digest scheduler (exposed so tests can drive it deterministically). */
  digestScheduler: DigestScheduler
  /** The running pending-Archive sweep (exposed so tests can drive it deterministically). */
  pendingArchiveScheduler: PendingArchiveScheduler
  /** The one heartbeat every scheduler wakes on (d-gzv0jty7). */
  heartbeat: Heartbeat
  /** Graceful shutdown: stop the HTTP server, stop the poll loop, drain workers,
   * close the DB, then resolve. Idempotent. */
  shutdown(): Promise<void>
}

/**
 * Bring up the Daemon. Startup sequence:
 *
 *   1. load + validate config
 *   2. open the State DB
 *   3. run pending migrations
 *   4. bootstrap the single MVP User if none exists, then reconcile default
 *      Limits (insert missing rows only; user-tuned rows are never touched)
 *   5. build the encryption seam from the configured key
 *   6. recovery sweep — mark interrupted `running` runs `failed`
 *   7. create the HTTP app and start listening on host:port
 *   8. start the execution loop
 *   9. start the heartbeat, which wakes the poll, digest, and pending-Archive
 *      schedulers on one beat (d-gzv0jty7)
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

  // Default-Limits reconcile: insert any default `(resource, operation, scope)`
  // missing from the `limits` table (a missing row would run unmetered — e.g. a
  // default added by an upgrade after this install was bootstrapped). Existing
  // rows are never touched, so user-tuned caps survive every restart.
  const seededLimits = await reconcileDefaultLimits(db, bootstrap.userId)
  if (seededLimits > 0) {
    console.log(`[grinbox] seeded ${seededLimits} missing default limit(s)`)
  }

  const encryptor = makeEncryptor(config.tokenEncKey)

  // Recovery sweep: mark `triage_operator_runs` rows stuck in 'running' (a
  // previous process was interrupted before they finished) as 'failed', settling
  // their Triages. Done before the loop starts so it never sees a stale row.
  await recoverInterruptedRuns(db)

  // Same sweep for interrupted digest runs: a failed run keeps the coverage
  // watermark, so the next scheduled occurrence covers the union.
  await recoverInterruptedDigestRuns(db)

  // OAuth wiring: one in-memory pending-auth store for the process, and the live
  // Google client only when the OAuth client id+secret are configured. Without
  // them the `/oauth/*` routes report "not configured" rather than crashing boot
  // (d-xe41okh9). The same Google
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
  // against Bedrock). The mail and Action clients resolve per-run credentials when
  // the worker builds them: the `mailbox` ops authenticate as the Message's
  // Account via its provider backend (Gmail needs `googleClient`); `pushover_api.send_notification` resolves the
  // Notify Operator's referenced credential. Any of these being unconfigured
  // (no Bedrock region, no OAuth client, no/needs-reauth Account credential, no
  // Pushover credential) throws only if an Operator actually invokes it — a
  // per-Operator failure that settles its Triage `partial`, not a daemon crash.
  // Rule-based pipelines declare no Resources and never touch any of them.
  // The IMAP backend: one wiring shared by the poll loop, the resource
  // backends, and the API's add/repair/folder routes, so an Account is worked
  // one connection at a time whichever path asked (d-v55lpt3t).
  const imap = createImapWiring({ db, encryptor })

  const makeClients = buildMakeUnderlyingClients({
    db,
    encryptor,
    config,
    googleClient,
    imap: { openSession: imap.openSession, store: imap.store },
  })
  const executionLoop = createExecutionLoop({
    db,
    config,
    makeClients,
  })

  // Digest scheduler: fires enabled Digest delivery Operators on their cron
  // schedules, claiming each occurrence in `digest_runs` and running it through
  // the same metered/credential-backed clients as the execution loop
  // (`llm_bedrock.invoke_model` + `mail_sender.send_message` as the Account).
  const digestScheduler = createDigestScheduler({ db, config, makeClients })

  // Pending-Archive sweep: performs the Archives earlier Triages recorded for
  // later, as each comes due (d-grcdd4ov, d-41v9yqvh).
  const pendingArchiveScheduler = createPendingArchiveScheduler({ db, config, makeClients })

  // Poll loop: per-Account fetch + Triage enqueue, on a croner cadence. When
  // OAuth is configured the live ProviderFactory resolves each Gmail Account's
  // stored credential and returns a credential-backed `GmailProvider`; an Account
  // with no usable credential (needs-reauth) is skipped on its first call (see
  // createLiveProviderFactory). When OAuth is unconfigured there is no Google
  // client to resolve tokens, so the factory stays the null factory — the loop
  // ticks and finds nothing pollable (unchanged). The loop enqueues Triages; the
  // execution loop picks up their pending runs.
  const providerFactory: ProviderFactory = createLiveProviderFactory({
    db,
    encryptor,
    googleClient,
    imapProvider: imap.provider,
  })
  const pollScheduler = createPollScheduler({
    db,
    config,
    providerFactory,
  })

  // The one heartbeat (d-gzv0jty7). No scheduler keeps a timer of its own; each
  // beat acts on whatever is due — an Account's elapsed interval, an Edition's
  // passed cue, a pending Archive past its moment.
  const heartbeat = createHeartbeat({
    heartbeatSeconds: config.heartbeatSeconds,
    ticks: [
      { name: 'poll', run: () => pollScheduler.pollDueAccounts() },
      { name: 'digest', run: () => digestScheduler.runDueDigests() },
      { name: 'pending-archive', run: () => pendingArchiveScheduler.runDuePendingArchives() },
    ],
  })

  const app = createApp({
    db,
    config,
    encryptor,
    version,
    pendingAuthStore,
    googleClient,
    imapProbe: imap.probe,
    accountFolders: imap.accountFolders,
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

  // Heartbeat: started after the execution loop so any Triage a poll enqueues
  // has a running loop to discover it.
  heartbeat.start()

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

    // 2. Stop the heartbeat so no new Triages are enqueued during drain, then
    //    let any in-flight digest run and pending-Archive sweep finish their
    //    DB writes.
    heartbeat.stop()
    await digestScheduler.drain()
    await pendingArchiveScheduler.drain()

    // 3. Stop the execution loop and drain in-flight workers. Workers still in
    //    flight resolve before this returns; any left `running` on a crash are
    //    swept on next startup by recoverInterruptedRuns.
    await executionLoop.stop()

    // Final step: close the DB connection cleanly.
    await closeDatabase(db)

    console.log('[grinbox] shutdown complete')
  }

  return {
    server,
    db,
    config,
    executionLoop,
    pollScheduler,
    digestScheduler,
    pendingArchiveScheduler,
    heartbeat,
    shutdown,
  }
}
