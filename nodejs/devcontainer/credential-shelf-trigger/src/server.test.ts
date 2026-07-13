import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AuditEntry } from './audit.js'
import { createTriggerServer } from './server.js'
import type { ServerDeps } from './server.js'
import type { UpstreamResponse } from './upstream.js'

const TOKEN = 's3cret'

interface Harness {
  base: string
  upstream: ReturnType<typeof vi.fn>
  audits: AuditEntry[]
  close: () => Promise<void>
}

const start = async (over: Partial<ServerDeps> = {}): Promise<Harness> => {
  const audits: AuditEntry[] = []
  const upstream = vi.fn(
    (): Promise<UpstreamResponse> => Promise.resolve({ status: 200, body: { prompts: [{ user_code: 'WXYZ-1234' }] } }),
  )
  const deps: ServerDeps = {
    token: TOKEN,
    upstream,
    limiter: { tryAcquire: () => true },
    audit: (e) => audits.push(e),
    ...over,
  }
  const server = createTriggerServer(deps)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    base: `http://127.0.0.1:${port.toString()}`,
    upstream: deps.upstream as ReturnType<typeof vi.fn>, // the effective mock (an `over` may replace the default)
    audits,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve()
        })
      }),
  }
}

let harness: Harness | undefined
afterEach(async () => {
  await harness?.close()
  harness = undefined
})

const auth = { authorization: `Bearer ${TOKEN}` }

describe('createTriggerServer', () => {
  it('serves the operator page at / and /index.html without auth, carrying no token', async () => {
    harness = await start()
    for (const path of ['/', '/index.html']) {
      const res = await fetch(`${harness.base}${path}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/html')
      // Hardening: a page holding a bearer token gets a CSP, no framing, nosniff, no referrer.
      expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(res.headers.get('x-frame-options')).toBe('DENY')
      const body = await res.text()
      expect(body).toContain('AWS session refresh')
      expect(body).not.toContain(TOKEN) // the page ships no secret; the token is entered client-side
      expect(body).toContain('^https?') // approval links are scheme-restricted to http(s)
    }
    expect(harness.upstream).not.toHaveBeenCalled()
  })

  it('serves /healthz without auth and leaks nothing', async () => {
    harness = await start()
    const res = await fetch(`${harness.base}/healthz`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
    expect(harness.upstream).not.toHaveBeenCalled()
  })

  it('rejects an unauthenticated POST /refresh and never touches the sidecar', async () => {
    harness = await start()
    const res = await fetch(`${harness.base}/refresh`, { method: 'POST' })
    expect(res.status).toBe(401)
    expect(harness.upstream).not.toHaveBeenCalled()
    expect(harness.audits).toContainEqual({
      event: 'refresh',
      source: expect.any(String),
      authorized: false,
      outcome: 'unauthorized',
    })
  })

  it('relays the device-code prompt on an authorized POST /refresh', async () => {
    harness = await start()
    const res = await fetch(`${harness.base}/refresh`, { method: 'POST', headers: auth })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store') // secrets must not be cached
    expect(await res.json()).toEqual({ prompts: [{ user_code: 'WXYZ-1234' }] })
    expect(harness.upstream).toHaveBeenCalledWith('POST', '/refresh')
    expect(harness.audits).toContainEqual({
      event: 'refresh',
      source: expect.any(String),
      authorized: true,
      outcome: 'ok',
    })
  })

  it('throttles when the rate limiter is exhausted and no refresh is pending approval', async () => {
    harness = await start({
      limiter: { tryAcquire: () => false },
      upstream: vi.fn(
        (): Promise<UpstreamResponse> => Promise.resolve({ status: 200, body: { refresh_pending: false } }),
      ),
    })
    const res = await fetch(`${harness.base}/refresh`, { method: 'POST', headers: auth })
    expect(res.status).toBe(429)
    // pending: false is the page's license to say "none is awaiting approval"
    expect(await res.json()).toEqual({ error: expect.any(String), pending: false })
    // only the side-effect-free pending probe reaches the sidecar — never the refresh itself
    expect(harness.upstream).toHaveBeenCalledExactlyOnceWith('GET', '/status')
    expect(harness.audits).toContainEqual({
      event: 'refresh',
      source: expect.any(String),
      authorized: true,
      outcome: 'rate_limited',
    })
  })

  it('re-presents the outstanding prompt when throttled while a refresh is pending approval', async () => {
    const upstream = vi.fn(
      (method: string): Promise<UpstreamResponse> =>
        method === 'GET' ?
          Promise.resolve({ status: 200, body: { refresh_pending: true } })
        : Promise.resolve({ status: 200, body: { prompts: [{ user_code: 'WXYZ-1234' }] } }),
    )
    harness = await start({ limiter: { tryAcquire: () => false }, upstream })
    const res = await fetch(`${harness.base}/refresh`, { method: 'POST', headers: auth })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ prompts: [{ user_code: 'WXYZ-1234' }], in_flight: true })
    // exactly one side-effect-free probe, then exactly one relay — in that order
    expect(upstream.mock.calls).toEqual([
      ['GET', '/status'],
      ['POST', '/refresh'],
    ])
    expect(harness.audits).toContainEqual({
      event: 'refresh',
      source: expect.any(String),
      authorized: true,
      outcome: 'ok_in_flight',
    })
  })

  it('falls back to a 429 with pending unknown when the throttled pending-probe fails', async () => {
    harness = await start({
      limiter: { tryAcquire: () => false },
      upstream: vi.fn((): Promise<UpstreamResponse> => Promise.reject(new Error('socket down'))),
    })
    const res = await fetch(`${harness.base}/refresh`, { method: 'POST', headers: auth })
    expect(res.status).toBe(429)
    // the trigger could not verify the pending state, and must not claim it did — and the
    // audit outcome must not disguise a sidecar outage as routine rate limiting
    expect(await res.json()).toEqual({ error: expect.any(String), pending: 'unknown' })
    // the failed probe must be the only upstream call — never the refresh itself
    expect(harness.upstream).toHaveBeenCalledExactlyOnceWith('GET', '/status')
    expect(harness.audits).toContainEqual({
      event: 'refresh',
      source: expect.any(String),
      authorized: true,
      outcome: 'rate_limited_probe_failed',
    })
  })

  it('treats a throttled probe 200 without a JSON object body as a failed probe', async () => {
    harness = await start({
      limiter: { tryAcquire: () => false },
      upstream: vi.fn((): Promise<UpstreamResponse> => Promise.resolve({ status: 200, body: undefined })),
    })
    const res = await fetch(`${harness.base}/refresh`, { method: 'POST', headers: auth })
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: expect.any(String), pending: 'unknown' })
    expect(harness.upstream).toHaveBeenCalledExactlyOnceWith('GET', '/status')
    expect(harness.audits).toContainEqual({
      event: 'refresh',
      source: expect.any(String),
      authorized: true,
      outcome: 'rate_limited_probe_failed',
    })
  })

  it('maps an in-flight relay failure to 502, never ok_in_flight', async () => {
    const upstream = vi.fn(
      (method: string): Promise<UpstreamResponse> =>
        method === 'GET' ?
          Promise.resolve({ status: 200, body: { refresh_pending: true } })
        : Promise.reject(new Error('socket down')),
    )
    harness = await start({ limiter: { tryAcquire: () => false }, upstream })
    const res = await fetch(`${harness.base}/refresh`, { method: 'POST', headers: auth })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'upstream unreachable' })
    expect(harness.audits).toContainEqual({
      event: 'refresh',
      source: expect.any(String),
      authorized: true,
      outcome: 'upstream_error',
    })
    expect(harness.audits.map((a) => a.outcome)).not.toContain('ok_in_flight')
  })

  it('maps an in-flight relay non-200 to 502, never ok_in_flight', async () => {
    const upstream = vi.fn(
      (method: string): Promise<UpstreamResponse> =>
        method === 'GET' ?
          Promise.resolve({ status: 200, body: { refresh_pending: true } })
        : Promise.resolve({ status: 500, body: { error: 'boom' } }),
    )
    harness = await start({ limiter: { tryAcquire: () => false }, upstream })
    const res = await fetch(`${harness.base}/refresh`, { method: 'POST', headers: auth })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'upstream error' })
    expect(harness.audits.map((a) => a.outcome)).not.toContain('ok_in_flight')
  })

  it('routes the throttled pending probe through the dedicated probe client when provided', async () => {
    const probe = vi.fn(
      (): Promise<UpstreamResponse> => Promise.resolve({ status: 200, body: { refresh_pending: true } }),
    )
    harness = await start({ limiter: { tryAcquire: () => false }, probe })
    const res = await fetch(`${harness.base}/refresh`, { method: 'POST', headers: auth })
    expect(res.status).toBe(200)
    // probe traffic and refresh traffic stay on their own clients (the probe's timeout is short)
    expect(probe).toHaveBeenCalledExactlyOnceWith('GET', '/status')
    expect(harness.upstream).toHaveBeenCalledExactlyOnceWith('POST', '/refresh')
  })

  it('reports an upstream error when the refresh returns 200 without a JSON object body', async () => {
    harness = await start({
      upstream: vi.fn((): Promise<UpstreamResponse> => Promise.resolve({ status: 200, body: undefined })),
    })
    const res = await fetch(`${harness.base}/refresh`, { method: 'POST', headers: auth })
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'upstream error' })
    expect(harness.audits).toContainEqual({
      event: 'refresh',
      source: expect.any(String),
      authorized: true,
      outcome: 'upstream_error',
    })
  })

  it('reports an upstream error when the in-flight relay returns 200 with an array body', async () => {
    const upstream = vi.fn(
      (method: string): Promise<UpstreamResponse> =>
        method === 'GET' ?
          Promise.resolve({ status: 200, body: { refresh_pending: true } })
        : Promise.resolve({ status: 200, body: [{ user_code: 'WXYZ-1234' }] }),
    )
    harness = await start({ limiter: { tryAcquire: () => false }, upstream })
    const res = await fetch(`${harness.base}/refresh`, { method: 'POST', headers: auth })
    // spreading an array would mangle it into an index-keyed object; refuse instead
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'upstream error' })
    expect(harness.audits.map((a) => a.outcome)).not.toContain('ok_in_flight')
  })

  it('does not mark an unthrottled refresh as in-flight', async () => {
    harness = await start()
    const res = await fetch(`${harness.base}/refresh`, { method: 'POST', headers: auth })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ prompts: [{ user_code: 'WXYZ-1234' }] })
  })

  it('proxies an authorized GET /status', async () => {
    harness = await start({
      upstream: vi.fn((): Promise<UpstreamResponse> => Promise.resolve({ status: 200, body: { sessions: ['sso'] } })),
    })
    const res = await fetch(`${harness.base}/status`, { headers: auth })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sessions: ['sso'] })
    expect(harness.upstream).toHaveBeenCalledWith('GET', '/status')
  })

  it('audits a status upstream non-200 as an error, not ok', async () => {
    harness = await start({
      upstream: vi.fn((): Promise<UpstreamResponse> => Promise.resolve({ status: 500, body: undefined })),
    })
    const res = await fetch(`${harness.base}/status`, { headers: auth })
    expect(res.status).toBe(502)
    expect(harness.audits).toContainEqual({
      event: 'status',
      source: expect.any(String),
      authorized: true,
      outcome: 'upstream_error',
    })
  })

  it('maps an upstream failure to 502', async () => {
    harness = await start({
      upstream: vi.fn((): Promise<UpstreamResponse> => Promise.reject(new Error('socket gone'))),
    })
    const res = await fetch(`${harness.base}/refresh`, { method: 'POST', headers: auth })
    expect(res.status).toBe(502)
    expect(harness.audits).toContainEqual({
      event: 'refresh',
      source: expect.any(String),
      authorized: true,
      outcome: 'upstream_error',
    })
  })

  it('404s unknown routes', async () => {
    harness = await start()
    expect((await fetch(`${harness.base}/nope`)).status).toBe(404)
    expect((await fetch(`${harness.base}/refresh`)).status).toBe(404) // GET /refresh is not the trigger
    // /status is GET-only — POST is not accepted (it isn't authenticated as a status call).
    expect((await fetch(`${harness.base}/status`, { method: 'POST', headers: auth })).status).toBe(404)
  })
})
