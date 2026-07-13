import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'

import { isAuthorized } from './auth.js'
import { audit as defaultAudit } from './audit.js'
import type { Auditor } from './audit.js'
import type { TriggerConfig } from './config.js'
import { INDEX_HTML } from './page.js'
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

    // The operator page (no secrets — the token is entered client-side and kept in localStorage,
    // then sent as a Bearer header). Unauthenticated by design so a phone can load the shell.
    // Hardened: a tight CSP (own inline script/style only, same-origin fetch, no framing), plus
    // nosniff / no-referrer — the page holds a bearer token, so shrink the injection/clickjacking
    // blast radius.
    if (method === 'GET' && (path === '/' || path === '/index.html')) {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy':
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
          "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'x-frame-options': 'DENY',
      })
      res.end(INDEX_HTML)
      return
    }

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

    // event === 'refresh' — the powerful path. The limiter guards *starting* device-auth
    // flows (they burn AWS device-authorization quota); re-presenting a prompt already
    // awaiting approval costs nothing — the shelf's refresh handler is single-flight and
    // returns the in-flight prompt instead of spawning a second login.
    const relayRefresh = (inFlight: boolean): void => {
      deps
        .upstream('POST', '/refresh')
        .then((r) => {
          if (r.status === 200) {
            audit({ event, source, authorized: true, outcome: inFlight ? 'ok_in_flight' : 'ok' })
            // relays { prompts: [...] } to the operator only; in_flight tells the page this
            // is an outstanding request being re-presented, not a new login
            const body =
              inFlight && typeof r.body === 'object' && r.body !== null ? { ...r.body, in_flight: true } : r.body
            sendJson(res, 200, body)
          } else {
            audit({ event, source, authorized: true, outcome: 'upstream_error' })
            sendJson(res, 502, { error: 'upstream error' })
          }
        })
        .catch(() => {
          audit({ event, source, authorized: true, outcome: 'upstream_error' })
          sendJson(res, 502, { error: 'upstream unreachable' })
        })
    }

    if (deps.limiter.tryAcquire(now())) {
      relayRefresh(false)
      return
    }

    // Throttled: if a refresh is already pending approval, relay anyway so the operator gets
    // the outstanding prompt back (losing the tab or re-tapping used to strand them until the
    // rate-limit window passed). Only a throttled request with *nothing* pending is refused —
    // that is the abuse case the limiter exists for.
    deps
      .upstream('GET', '/status')
      .then((r) => {
        const pending =
          r.status === 200 &&
          typeof r.body === 'object' &&
          r.body !== null &&
          (r.body as { refresh_pending?: unknown }).refresh_pending === true
        if (pending) {
          relayRefresh(true)
        } else {
          audit({ event, source, authorized: true, outcome: 'rate_limited' })
          sendJson(res, 429, { error: 'rate limited; a refresh was triggered too recently' })
        }
      })
      .catch(() => {
        audit({ event, source, authorized: true, outcome: 'rate_limited' })
        sendJson(res, 429, { error: 'rate limited; a refresh was triggered too recently' })
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
