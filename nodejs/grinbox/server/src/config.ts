import { z } from 'zod'

/**
 * Daemon configuration, parsed and validated from `process.env` at startup.
 *
 * Required-at-boot fields are the minimum the Daemon needs to open the State DB,
 * stand up the HTTP server, and build the encryption seam. Everything a later
 * task consumes (OAuth, Bedrock) is declared here so the `Config` shape is
 * stable, but is left optional — those features aren't needed to answer
 * `/healthz`, and forcing them at boot would make the Tier-0 skeleton
 * un-runnable.
 *
 * Validation is fail-fast: a missing/invalid required var throws, the daemon
 * logs and exits non-zero, and systemd restarts it (the documented contract in
 * pipeline-runtime.md "Crash-loop prevention").
 */

/** Decode a base64- or hex-encoded key string into raw bytes.
 *
 * Accepts either encoding so the host's secret-delivery mechanism
 * (docs/decisions/grinbox-secret-delivery.md) can hand us whichever is
 * convenient. Hex is detected first (strict `[0-9a-f]` of even length);
 * anything else is treated as base64. Returns `null` if neither decodes to a
 * non-empty buffer.
 */
function decodeKey(raw: string): Buffer | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return null
  }

  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    const buf = Buffer.from(trimmed, 'hex')
    if (buf.length > 0) {
      return buf
    }
  }

  const buf = Buffer.from(trimmed, 'base64')
  // Buffer.from(..., 'base64') silently drops invalid chars and never throws,
  // so a zero-length result is our only signal that decoding failed.
  if (buf.length > 0) {
    return buf
  }
  return null
}

/**
 * The token-encryption key environment variable.
 *
 * Chosen as part of T0.4 so the daemon skeleton and the OAuth flow (S6) agree
 * on a single name. It carries the 32-byte (AES-256-GCM) key the host supplies
 * at startup; the application neither generates nor persists it (oauth-flow.md
 * "Encryption at rest", docs/decisions/grinbox-secret-delivery.md). Provided
 * base64- or hex-encoded.
 */
export const TOKEN_ENC_KEY_ENV = 'GRINBOX_TOKEN_ENC_KEY'

/** AES-256-GCM key length in bytes. */
export const TOKEN_ENC_KEY_BYTES = 32

const keySchema = z
  .string({
    error: (issue) => (issue.input === undefined ? `${TOKEN_ENC_KEY_ENV} is required` : undefined),
  })
  .transform((raw, ctx) => {
    const decoded = decodeKey(raw)
    if (decoded === null) {
      ctx.addIssue({
        code: 'custom',
        message: `${TOKEN_ENC_KEY_ENV} must be a base64- or hex-encoded ${TOKEN_ENC_KEY_BYTES}-byte key`,
      })
      return z.NEVER
    }
    if (decoded.length !== TOKEN_ENC_KEY_BYTES) {
      ctx.addIssue({
        code: 'custom',
        message: `${TOKEN_ENC_KEY_ENV} must decode to exactly ${TOKEN_ENC_KEY_BYTES} bytes (got ${decoded.length})`,
      })
      return z.NEVER
    }
    return decoded
  })

const portSchema = z.coerce.number().int().min(1).max(65535).default(8787)

const configSchema = z.object({
  // --- Required at boot ---

  /** Path to the SQLite State DB file. */
  dbPath: z.string().min(1).default('./grinbox.db'),

  /** HTTP listen port. */
  httpPort: portSchema,

  /**
   * HTTP listen host. Defaults to `0.0.0.0`: the Daemon "listens on its own IP
   * and trusts every request from the deployment network" (architecture.md).
   */
  httpHost: z.string().min(1).default('0.0.0.0'),

  /** Raw 32-byte AES-256-GCM token-encryption key (decoded). */
  tokenEncKey: keySchema,

  /**
   * Absolute path to the built web SPA (the `index.html` + `assets/` tree Vite
   * emits to `packages/web/dist`). The daemon serves it as static assets with a
   * client-side-routing fallback (architecture.md "Web UI": "served as static
   * assets from the same Daemon").
   *
   * Optional with an empty-string default. When unset, the static-serving layer
   * resolves the path relative to the compiled server: from `packages/server/dist`
   * up to the sibling package's `packages/web/dist`, so a standard production
   * layout works without setting this var. Set it to override for non-standard layouts (a
   * separately-deployed build, a test temp dir). When neither the env value nor
   * the default resolution points at a directory containing `index.html`, the
   * daemon logs a warning and skips static serving (the API + `/healthz` still
   * serve).
   */
  webDistPath: z.string().default(''),

  // --- Optional now; consumed by later tasks ---

  /** Gmail OAuth client id — consumed by the OAuth flow (S6). */
  oauthClientId: z.string().min(1).optional(),

  /** Gmail OAuth client secret — consumed by the OAuth flow (S6). */
  oauthClientSecret: z.string().min(1).optional(),

  /**
   * The registered Google OAuth redirect URI — the one-path public surface
   * `https://grinbox.pegasuspad.com/oauth/callback` (oauth-flow.md "Network
   * model"). Sent on the consent URL and used in the code exchange; must match
   * the value registered on the OAuth client. Defaults to the documented URL so
   * a standard deployment needs only the client id/secret.
   */
  oauthRedirectUri: z.string().min(1).default('https://grinbox.pegasuspad.com/oauth/callback'),

  /**
   * The internal origin of the SPA that opens the consent popup
   * (`http://<daemon-ip>:PORT`). The callback's `postMessage` targets exactly
   * this origin (oauth-flow.md "Cross-origin postMessage"); the SPA in turn
   * verifies `event.origin` is the public callback origin. Optional: when unset,
   * the callback posts with `'*'` and relies on the SPA-side origin check — a
   * looser default acceptable for the lab-internal MVP, tightened by setting it.
   */
  oauthOpenerOrigin: z.string().min(1).optional(),

  /** AWS region for the Bedrock LLM client (S4). */
  bedrockRegion: z.string().min(1).optional(),

  /**
   * Per-Operator execution timeout in milliseconds. The execution-loop worker
   * wraps each Operator run in an AbortController + timer of this duration
   * (pipeline-runtime.md "Timeout enforcement"). A run that exceeds it (or whose
   * Operator ignores the abort signal) is marked `failed`.
   */
  operatorTimeoutMs: z.coerce.number().int().positive().default(30_000),

  /**
   * Execution-loop worker-pool size: the maximum number of Operator runs
   * dispatched concurrently (pipeline-runtime.md "Worker pool"). Workers are
   * async functions on the same event loop; the bottleneck is network I/O.
   */
  workerPoolSize: z.coerce.number().int().positive().default(3),

  /**
   * Poll-scheduler tick cadence in seconds: how often the in-process croner job
   * wakes to look for *due* Accounts (pipeline-runtime.md "Process model → Poll
   * loop"). This is the scheduler's heartbeat, NOT the per-Account poll
   * interval: each Account is only polled once its own `poll_interval_seconds`
   * has elapsed since its `last_polled_at`. A short tick (default 60s) keeps the
   * effective poll latency close to each Account's interval (default 600s)
   * without scheduling per-Account timers.
   */
  pollSchedulerTickSeconds: z.coerce.number().int().positive().default(60),

  /**
   * How often (seconds) to run the source-state reconcile for an Account: a full
   * inbox snapshot diffed against stored rows, which heals any source-state drift
   * the incremental History feed missed (e.g. removals during a >7-day daemon
   * outage, after which the historyId-expired fallback carries no deltas). Far
   * coarser than the poll interval — the incremental path does the routine work;
   * this is the backstop. Default 1 day. Checked opportunistically on a poll, so
   * the effective cadence is at most one poll interval later than this.
   */
  reconcileIntervalSeconds: z.coerce.number().int().positive().default(86_400),
})

export type Config = z.infer<typeof configSchema>

/**
 * Map raw environment variables to the schema's input shape. Kept separate from
 * the schema so the env-var names live in one place and tests can build a
 * config from an explicit record without going through `process.env`.
 */
function fromEnv(env: NodeJS.ProcessEnv): Record<string, unknown> {
  return {
    dbPath: env.GRINBOX_DB_PATH,
    httpPort: env.GRINBOX_HTTP_PORT,
    httpHost: env.GRINBOX_HTTP_HOST,
    tokenEncKey: env[TOKEN_ENC_KEY_ENV],
    webDistPath: env.GRINBOX_WEB_DIST,
    oauthClientId: env.GRINBOX_OAUTH_CLIENT_ID,
    oauthClientSecret: env.GRINBOX_OAUTH_CLIENT_SECRET,
    oauthRedirectUri: env.GRINBOX_OAUTH_REDIRECT_URI,
    oauthOpenerOrigin: env.GRINBOX_OAUTH_OPENER_ORIGIN,
    bedrockRegion: env.GRINBOX_BEDROCK_REGION,
    operatorTimeoutMs: env.GRINBOX_OPERATOR_TIMEOUT_MS,
    workerPoolSize: env.GRINBOX_WORKER_POOL_SIZE,
    pollSchedulerTickSeconds: env.GRINBOX_POLL_SCHEDULER_TICK_SECONDS,
    reconcileIntervalSeconds: env.GRINBOX_RECONCILE_INTERVAL_SECONDS,
  }
}

/**
 * Parse and validate configuration from an environment-variable bag (defaults
 * to `process.env`). Throws a single error listing every problem on invalid
 * input; the daemon entrypoint turns that into a non-zero exit.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(fromEnv(env))
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid Grinbox configuration:\n${detail}`)
  }
  return result.data
}
