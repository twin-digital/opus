import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'

import { isAuthorized } from './auth.js'
import { audit as defaultAudit } from './audit.js'
import type { Auditor } from './audit.js'
import type { TriggerConfig } from './config.js'
import { createRateLimiter } from './rate-limit.js'
import type { RateLimiter } from './rate-limit.js'
import { createUpstreamClient } from './upstream.js'
import type { UpstreamClient } from './upstream.js'

export interface ServerDeps {
  token: string
  upstream: UpstreamClient
  limiter: RateLimiter
  now?: () => number
  audit?: Auditor
}

const sendJson = (res: ServerResponse, status: number, body: unknown): void => {
  // no-store: a /refresh response carries the device user_code + verification URL; keep any
  // intermediary (reverse proxy, browser) from caching it.
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

const sourceOf = (req: IncomingMessage): string => req.socket.remoteAddress ?? 'unknown'

/**
 * The LAN-facing trigger server. It authenticates + rate-limits, then relays to the
 * credential-shelf refresh primitive over the Unix socket. It holds no AWS identity: the
 * worst an abused endpoint can do is ask the sidecar to start a login prompt (a DoS), never
 * mint. The `user_code` / verification URL flow back to the authenticated operator in the
 * response body and are never logged.
 */
export const createTriggerServer = (deps: ServerDeps): Server => {
  const now = deps.now ?? Date.now
  const audit = deps.audit ?? defaultAudit

  return createServer((req, res) => {
    const method = req.method ?? 'GET'
    const path = (req.url ?? '/').split('?')[0]
    req.resume() // we accept no request body

    // Unauthenticated liveness probe — carries no secrets.
    if (method === 'GET' && path === '/healthz') {
      sendJson(res, 200, { status: 'ok' })
      return
    }

    const event =
      method === 'POST' && path === '/refresh' ? 'refresh'
      : method === 'GET' && path === '/status' ? 'status'
      : null
    if (event === null) {
      sendJson(res, 404, { error: 'not found' })
      return
    }

    const source = sourceOf(req)
    if (!isAuthorized(req.headers.authorization, deps.token)) {
      audit({ event, source, authorized: false, outcome: 'unauthorized' })
      sendJson(res, 401, { error: 'unauthorized' })
      return
    }

    if (event === 'status') {
      deps
        .upstream('GET', '/status')
        .then((r) => {
          const ok = r.status === 200
          audit({ event, source, authorized: true, outcome: ok ? 'ok' : 'upstream_error' })
          sendJson(res, ok ? 200 : 502, ok ? r.body : { error: 'upstream error' })
        })
        .catch(() => {
          audit({ event, source, authorized: true, outcome: 'upstream_error' })
          sendJson(res, 502, { error: 'upstream unreachable' })
        })
      return
    }

    // event === 'refresh' — the powerful path; rate-limit before touching the device-auth flow.
    if (!deps.limiter.tryAcquire(now())) {
      audit({ event, source, authorized: true, outcome: 'rate_limited' })
      sendJson(res, 429, { error: 'rate limited; a refresh was triggered too recently' })
      return
    }

    deps
      .upstream('POST', '/refresh')
      .then((r) => {
        if (r.status === 200) {
          audit({ event, source, authorized: true, outcome: 'ok' })
          sendJson(res, 200, r.body) // relays { prompts: [...] } to the operator only
        } else {
          audit({ event, source, authorized: true, outcome: 'upstream_error' })
          sendJson(res, 502, { error: 'upstream error' })
        }
      })
      .catch(() => {
        audit({ event, source, authorized: true, outcome: 'upstream_error' })
        sendJson(res, 502, { error: 'upstream unreachable' })
      })
  })
}

/** Build deps from config and start listening. Returns the bound server. */
export const startServer = (cfg: TriggerConfig): Promise<Server> => {
  const server = createTriggerServer({
    token: cfg.token,
    upstream: createUpstreamClient(cfg.upstreamSocket),
    limiter: createRateLimiter(cfg.rateLimitIntervalSec, cfg.rateLimitBurst),
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(cfg.port, cfg.host, () => {
      server.removeListener('error', reject)
      process.stdout.write(
        `${new Date().toISOString()} refresh-trigger: listening on ${cfg.host}:${cfg.port.toString()} ` +
          `→ ${cfg.upstreamSocket} (rate: 1 per ${cfg.rateLimitIntervalSec.toString()}s, burst ${cfg.rateLimitBurst.toString()})\n`,
      )
      resolve(server)
    })
  })
}
