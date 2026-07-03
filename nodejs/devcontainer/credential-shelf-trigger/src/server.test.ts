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
      const body = await res.text()
      expect(body).toContain('AWS session refresh')
      expect(body).not.toContain(TOKEN) // the page ships no secret; the token is entered client-side
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

  it('throttles when the rate limiter is exhausted, before hitting the sidecar', async () => {
    harness = await start({ limiter: { tryAcquire: () => false } })
    const res = await fetch(`${harness.base}/refresh`, { method: 'POST', headers: auth })
    expect(res.status).toBe(429)
    expect(harness.upstream).not.toHaveBeenCalled()
    expect(harness.audits).toContainEqual({
      event: 'refresh',
      source: expect.any(String),
      authorized: true,
      outcome: 'rate_limited',
    })
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
