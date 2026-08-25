import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { startServer, type Fake } from '../testing/http.js'
import { startLynxFake } from '../testing/lynx-fake.js'
import { createWorld, type World } from '../testing/world.js'
import { LynxApiError, LynxClient, type TokenCache } from './client.js'

describe('lynx client', () => {
  let world: World
  let fake: Fake
  let client: LynxClient

  beforeEach(async () => {
    world = createWorld()
    world.addReservation({ bookingId: 20559349, propertyId: 72230, code: '9234' })
    fake = await startLynxFake(world)
    client = new LynxClient({
      baseUrl: fake.baseUrl,
      username: world.credentials.username,
      password: world.credentials.password,
      userId: '232753',
    })
  })
  afterEach(async () => {
    await fake.close()
  })

  it('enumerates the active property set', async () => {
    const properties = await client.listProperties()
    expect(properties.map((p) => p.uniquePropertyId)).toEqual([72230])
  })

  it('reads reservations with code + readiness', async () => {
    const reservations = await client.listReservations(72230, 'upcoming')
    expect(reservations[0]?.confirmationCode).toBe('20559349VK222262')
    expect(reservations[0]?.accessCodes.every((c) => c.syncToLockStatus === 'success')).toBe(true)
  })

  it('reads the full lock set (readiness denominator)', async () => {
    expect(await client.listSmartLocks(72230)).toHaveLength(3)
  })

  it('logs in once and reuses the cached token across calls', async () => {
    await client.listProperties()
    await client.listReservations(72230, 'upcoming')
    await client.listSmartLocks(72230)
    const logins = world.lynxRequests.filter((r) => r.path.endsWith('/api/v1/auth/login'))
    expect(logins).toHaveLength(1)
  })

  it('throws LynxApiError when credentials are rejected', async () => {
    const bad = new LynxClient({
      baseUrl: fake.baseUrl,
      username: 'nope',
      password: 'wrong',
      userId: '232753',
    })
    await expect(bad.listProperties()).rejects.toBeInstanceOf(LynxApiError)
  })

  it('uses a token from the injected cache without logging in', async () => {
    const cache: TokenCache = { get: () => Promise.resolve(world.token), set: () => Promise.resolve() }
    // Deliberately wrong credentials: a login would fail, proving the cached token is used.
    const cached = new LynxClient({ baseUrl: fake.baseUrl, username: 'x', password: 'y', userId: '232753', cache })
    await cached.listProperties()
    expect(world.lynxRequests.filter((r) => r.path.endsWith('/api/v1/auth/login'))).toHaveLength(0)
  })

  it('writes a freshly minted token to the injected cache', async () => {
    let stored: string | undefined
    const cache: TokenCache = {
      get: () => Promise.resolve(stored),
      set: (token) => {
        stored = token
        return Promise.resolve()
      },
    }
    const fresh = new LynxClient({
      baseUrl: fake.baseUrl,
      username: world.credentials.username,
      password: world.credentials.password,
      userId: '232753',
      cache,
    })
    await fresh.listProperties()
    expect(stored).toBe(world.token)
  })

  it('reports each auth-endpoint call through onLogin, including failed mints', async () => {
    let mints = 0
    const counting = new LynxClient({
      baseUrl: fake.baseUrl,
      username: world.credentials.username,
      password: world.credentials.password,
      userId: '232753',
      onLogin: () => {
        mints += 1
      },
    })
    await counting.listProperties()
    await counting.listSmartLocks(72230) // token cached — must not count a second mint
    expect(mints).toBe(1)

    let failedMints = 0
    const bad = new LynxClient({
      baseUrl: fake.baseUrl,
      username: 'nope',
      password: 'wrong',
      userId: '232753',
      onLogin: () => {
        failedMints += 1
      },
    })
    await expect(bad.listProperties()).rejects.toBeInstanceOf(LynxApiError)
    expect(failedMints).toBe(1)
  })

  it('coalesces concurrent first-calls into a single login', async () => {
    // Both calls start with an empty cache; the in-flight login promise must be shared.
    await Promise.all([client.listProperties(), client.listSmartLocks(72230)])
    expect(world.lynxRequests.filter((r) => r.path.endsWith('/api/v1/auth/login'))).toHaveLength(1)
  })

  it('auto-paginates, collecting records across multiple pages', async () => {
    // PER_PAGE is 50; seed enough to force a second page (plus the one from beforeEach).
    for (let booking = 1; booking <= 60; booking += 1) {
      world.addReservation({ bookingId: booking, propertyId: 72230, code: '9234' })
    }
    expect(await client.listReservations(72230, 'upcoming')).toHaveLength(61)
  })

  it('throws LynxApiError (not a SyntaxError) on a non-JSON dashboard body', async () => {
    const cache: TokenCache = { get: () => Promise.resolve('tok'), set: () => Promise.resolve() }
    const maintenance = await startServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html>maintenance</html>')
    })
    try {
      const c = new LynxClient({ baseUrl: maintenance.baseUrl, username: 'u', password: 'p', userId: '1', cache })
      await expect(c.listProperties()).rejects.toBeInstanceOf(LynxApiError)
    } finally {
      await maintenance.close()
    }
  })

  it('re-mints the token and retries once on a 401', async () => {
    let dashboardCalls = 0
    let logins = 0
    const okBody = JSON.stringify({
      status: true,
      errorCodeId: 0,
      errorMessage: '',
      data: { properties: [] },
      paginationInfo: { perPage: 50, page: 1, total: 0, totalPages: 1 },
    })
    const server = await startServer((req, res) => {
      const path = new URL(req.url ?? '/', 'http://x').pathname
      if (path.endsWith('/api/v1/auth/login')) {
        logins += 1
        res.setHeader('x-auth-token', 'tok')
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{}')
        return
      }
      dashboardCalls += 1
      // First dashboard call rejects the token; the client must re-mint and retry.
      res.writeHead(dashboardCalls === 1 ? 401 : 200, { 'content-type': 'application/json' })
      res.end(dashboardCalls === 1 ? '{}' : okBody)
    })
    try {
      const c = new LynxClient({ baseUrl: server.baseUrl, username: 'u', password: 'p', userId: '1' })
      await expect(c.listProperties()).resolves.toEqual([])
      expect(dashboardCalls).toBe(2)
      expect(logins).toBe(2)
    } finally {
      await server.close()
    }
  })
})
