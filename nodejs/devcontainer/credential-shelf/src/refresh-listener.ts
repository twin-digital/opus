import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs'
import { createServer } from 'node:http'
import type { Server, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { writeAwsConfig } from './aws-config.js'
import { vendAwsOnce } from './aws.js'
import { spawnCapturing } from './exec.js'
import { distinctAwsSessions } from './refresh.js'
import { log, shelfDir } from './shelf.js'
import type { VendConfig } from './types.js'

const PREFIX = 'refresh-listener'
const PROMPT_TIMEOUT_MS = Number(process.env.REFRESH_PROMPT_TIMEOUT_MS ?? '30000')

const errMsg = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** The device-code prompt parsed out of one session's `aws sso login` output. */
export interface DevicePrompt {
  session: string
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
}

export interface ParsedPrompt {
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
}

const stripTrailing = (u: string): string => u.replace(/[)\].,]+$/, '')

/**
 * Extract the device-code `verification_uri` + `user_code` from `aws sso login
 * --use-device-code` output. Defensive against wording changes: the code is the only
 * `XXXX-XXXX` token, the completion URL is the one carrying `user_code=`, and the plain
 * verification URL is the other https URL. Returns null until both are present.
 */
export const parseDevicePrompt = (output: string): ParsedPrompt | null => {
  const userCode = /\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/.exec(output)?.[0]
  const uris = [...output.matchAll(/https?:\/\/\S+/g)].map((m) => stripTrailing(m[0]))
  const verificationUriComplete = uris.find((u) => /[?&]user_code=/.test(u))
  const verificationUri = uris.find((u) => !/[?&]user_code=/.test(u)) ?? verificationUriComplete
  if (userCode === undefined || verificationUri === undefined) {
    return null
  }
  return {
    userCode,
    verificationUri,
    ...(verificationUriComplete !== undefined ? { verificationUriComplete } : {}),
  }
}

/** A device-code login in flight: its prompt (fast) and its completion (after operator approval). */
export interface LoginRun {
  /** Resolves once the device-code URL + user code are parsed from the login output. */
  prompt: Promise<DevicePrompt>
  /** Resolves when the login completes (operator approved); rejects if it fails. */
  completed: Promise<void>
}

/** Start a device-code login for one sso-session. Injectable so tests never spawn real `aws`. */
export type LoginRunner = (session: string) => LoginRun

const defaultLoginRunner: LoginRunner = (session) => {
  const proc = spawnCapturing('aws', ['sso', 'login', '--sso-session', session, '--use-device-code', '--no-browser'])
  const prompt = proc.waitForMatch(/[A-Z0-9]{4}-[A-Z0-9]{4}/, PROMPT_TIMEOUT_MS).then((m) => {
    const parsed = parseDevicePrompt(m.input ?? '')
    if (parsed === null) {
      throw new Error('could not parse device-code prompt from aws output')
    }
    return { session, ...parsed }
  })
  // If the prompt never appears (timeout / early exit), don't leave the poller running.
  prompt.catch(() => {
    if (!proc.child.killed) {
      proc.child.kill()
    }
  })
  const completed = proc.done.then((code) => {
    if (code !== 0) {
      throw new Error(`aws sso login (session '${session}') exited ${code.toString()}`)
    }
  })
  return { prompt, completed }
}

export interface RefreshStatus {
  sessions: string[]
  /** ISO expiry of the SSO session (~8h) — when a refresh is due. Null if never logged in. */
  session_expires_at: string | null
  /** ISO expiry of the currently-vended AWS creds (≤1h) off the shelf. */
  credentials_expire_at: string | null
  /** A device-code refresh is currently awaiting operator approval. */
  refresh_pending: boolean
}

export interface RefreshHandler {
  /**
   * Start a device-code refresh and resolve with the prompt(s) to hand the operator. While a
   * refresh is already pending approval, returns the same in-flight prompt(s) — never spawns a
   * second login (would burn AWS device-authorization quota and could block the real refresh).
   */
  triggerRefresh: () => Promise<DevicePrompt[]>
  status: () => RefreshStatus
}

export interface RefreshHandlerOptions {
  loginRunner?: LoginRunner
  vend?: (profiles: string[]) => Promise<unknown>
  /** Profiles to vend on approval; defaults to rendering `~/.aws/config` from `cfg`. */
  vendProfiles?: string[]
  /** Override the SSO-session expiry probe (defaults to reading `~/.aws/sso/cache`). */
  sessionExpiry?: () => string | null
}

const ssoCacheDir = (): string => join(homedir(), '.aws', 'sso', 'cache')

/** Latest SSO access-token `expiresAt` across the cache (the ~8h session), or null. */
export const readSessionExpiry = (): string | null => {
  const dir = ssoCacheDir()
  if (!existsSync(dir)) {
    return null
  }
  let latestIso: string | null = null
  let latest = -Infinity
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) {
      continue
    }
    try {
      const raw = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, unknown>
      // The dir also holds client-registration files; only the token cache has accessToken + expiresAt.
      if (typeof raw.accessToken !== 'string' || typeof raw.expiresAt !== 'string') {
        continue
      }
      const t = Date.parse(raw.expiresAt)
      if (!Number.isNaN(t) && t > latest) {
        latest = t
        latestIso = raw.expiresAt
      }
    } catch {
      // ignore unreadable / non-JSON cache files
    }
  }
  return latestIso
}

const shelfAwsExpiry = (): string | null => {
  const file = join(shelfDir(), 'aws', 'expiration')
  if (!existsSync(file)) {
    return null
  }
  const value = readFileSync(file, 'utf8').trim()
  return value.length > 0 && value !== 'unknown' ? value : null
}

/**
 * The one narrow primitive the network-facing trigger drives: *start a device-code
 * authorization, hand back the `user_code` + `verification_uri`, then background-poll and
 * vend only on operator approval.* It takes no caller arguments — the sso-session(s) come
 * from the sidecar's own baked config, never the request — so it can't be steered to a
 * different IdP or coerced into minting. The heavy authority (the SSO session, `kms:Sign`)
 * never leaves this container.
 */
export const createRefreshHandler = (cfg: VendConfig, opts: RefreshHandlerOptions = {}): RefreshHandler => {
  const loginRunner = opts.loginRunner ?? defaultLoginRunner
  const vend = opts.vend ?? vendAwsOnce
  const sessionExpiry = opts.sessionExpiry ?? readSessionExpiry
  const vendProfiles = opts.vendProfiles ?? writeAwsConfig(cfg)
  const sessions = distinctAwsSessions(cfg)

  let active: Promise<DevicePrompt[]> | null = null

  const startAll = async (): Promise<DevicePrompt[]> => {
    const runs = sessions.map((s) => loginRunner(s))
    const prompts = await Promise.all(runs.map((r) => r.prompt))
    // Background: vend once every session's login is approved; free the single-flight slot either way.
    void Promise.all(runs.map((r) => r.completed))
      .then(async () => {
        if (vendProfiles.length > 0) {
          await vend(vendProfiles)
        }
        log(PREFIX, 'device-code approved; fresh AWS credentials vended to the shelf')
      })
      .catch((err: unknown) => {
        log(PREFIX, `device-code login did not complete: ${errMsg(err)}`)
      })
      .finally(() => {
        active = null
      })
    return prompts
  }

  const triggerRefresh = (): Promise<DevicePrompt[]> => {
    if (sessions.length === 0) {
      return Promise.reject(new Error('no aws-sso providers configured; nothing to refresh'))
    }
    if (active === null) {
      log(PREFIX, `starting device-code refresh for session(s): ${sessions.join(', ')}`)
      active = startAll().catch((err: unknown) => {
        active = null
        throw err instanceof Error ? err : new Error(String(err))
      })
    } else {
      log(PREFIX, 'device-code refresh already pending approval; returning the in-flight prompt')
    }
    return active
  }

  const status = (): RefreshStatus => ({
    sessions,
    session_expires_at: sessionExpiry(),
    credentials_expire_at: shelfAwsExpiry(),
    refresh_pending: active !== null,
  })

  return { triggerRefresh, status }
}

const promptWire = (p: DevicePrompt): Record<string, string> => ({
  session: p.session,
  user_code: p.userCode,
  verification_uri: p.verificationUri,
  ...(p.verificationUriComplete !== undefined ? { verification_uri_complete: p.verificationUriComplete } : {}),
})

const sendJson = (res: ServerResponse, statusCode: number, body: unknown): void => {
  res.writeHead(statusCode, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

/**
 * HTTP over the Unix socket: `POST /refresh` (trigger) and `GET /status` (expiry). Bodies are
 * ignored — the primitive takes no arguments. This is the sidecar's only inbound surface.
 */
export const createRefreshServer = (handler: RefreshHandler): Server =>
  createServer((req, res) => {
    const method = req.method ?? 'GET'
    const path = (req.url ?? '/').split('?')[0]
    req.resume() // discard any request body; we accept no input
    if (method === 'POST' && path === '/refresh') {
      handler
        .triggerRefresh()
        .then((prompts) => {
          sendJson(res, 200, { prompts: prompts.map(promptWire) })
        })
        .catch((err: unknown) => {
          log(PREFIX, `refresh failed: ${errMsg(err)}`)
          sendJson(res, 502, { error: 'refresh failed' })
        })
      return
    }
    if (method === 'GET' && path === '/status') {
      sendJson(res, 200, handler.status())
      return
    }
    sendJson(res, 404, { error: 'not found' })
  })

/**
 * The refresh-listener loop: bind the Unix socket and serve the trigger primitive forever.
 * Started by the supervisor when `REFRESH_LISTENER_SOCKET` is set. Resolves never; rejects if
 * the socket errors or closes so the supervisor exits and the restart policy revives it.
 */
export const runRefreshListener = async (cfg: VendConfig, socketPath: string): Promise<never> => {
  const handler = createRefreshHandler(cfg)
  const server = createRefreshServer(handler)

  mkdirSync(dirname(socketPath), { recursive: true })
  if (existsSync(socketPath)) {
    unlinkSync(socketPath) // clear a stale socket left by a crashed prior run
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(socketPath, () => {
      server.removeListener('error', reject)
      // Only the shared-volume peer (same uid/gid) should connect; never world-reachable.
      chmodSync(socketPath, 0o660)
      resolve()
    })
  })
  log(PREFIX, `listening on ${socketPath} — device-code refresh trigger ready`)

  return new Promise<never>((_resolve, reject) => {
    server.on('error', (err) => {
      reject(err)
    })
    server.on('close', () => {
      reject(new Error('refresh-listener socket closed'))
    })
  })
}
