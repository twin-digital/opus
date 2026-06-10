import { describe, expect, it } from 'vitest'
import { createPendingAuthStore } from './pending-auth.js'
import { createOAuthRoutes } from './routes.js'
import { type FakeGoogleClient, freshDbWithUser, makeFakeGoogleClient, testEncryptor } from './test-support.js'

describe('createOAuthRoutes', () => {
  it('POST /oauth/start returns a consent URL and persists pending-auth', async () => {
    const { db } = await freshDbWithUser()
    const store = createPendingAuthStore()
    const app = createOAuthRoutes({
      db,
      encryptor: testEncryptor(),
      store,
      googleClient: makeFakeGoogleClient(),
    })

    const res = await app.request('/oauth/start', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { consent_url: string }
    expect(body.consent_url).toContain('access_type=offline')
    expect(body.consent_url).toContain('prompt=consent')
    expect(store.size()).toBe(1)
  })

  it('POST /oauth/start binds account_id from the body', async () => {
    const { db } = await freshDbWithUser()
    const store = createPendingAuthStore()
    const app = createOAuthRoutes({
      db,
      encryptor: testEncryptor(),
      store,
      googleClient: makeFakeGoogleClient(),
    })

    const res = await app.request('/oauth/start', {
      method: 'POST',
      body: JSON.stringify({ account_id: 7 }),
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status).toBe(200)
    const url = new URL(((await res.json()) as { consent_url: string }).consent_url)
    const state = url.searchParams.get('state') ?? ''
    expect(store.consume(state)?.accountId).toBe(7)
  })

  it('reports not-configured (503) when no Google client is wired', async () => {
    const { db } = await freshDbWithUser()
    const app = createOAuthRoutes({
      db,
      encryptor: testEncryptor(),
      store: createPendingAuthStore(),
      googleClient: null,
    })

    const start = await app.request('/oauth/start', { method: 'POST' })
    expect(start.status).toBe(503)
    expect(((await start.json()) as { error: string }).error).toBe('oauth_not_configured')

    const cb = await app.request('/oauth/callback?code=c&state=s')
    expect(cb.status).toBe(503)
  })

  it('GET /oauth/callback happy path stores a credential and posts {ok, account_id}', async () => {
    const { db } = await freshDbWithUser()
    const store = createPendingAuthStore()
    const google = makeFakeGoogleClient({ email: 'hi@example.com' })
    const app = createOAuthRoutes({
      db,
      encryptor: testEncryptor(),
      store,
      googleClient: google,
      openerOrigin: 'http://10.0.0.5:8787',
    })

    // Begin a flow to mint a valid state.
    const startRes = await app.request('/oauth/start', { method: 'POST' })
    const url = new URL(((await startRes.json()) as { consent_url: string }).consent_url)
    const state = url.searchParams.get('state') ?? ''

    const cb = await app.request(`/oauth/callback?code=auth&state=${state}`)
    expect(cb.status).toBe(200)
    expect(cb.headers.get('content-type')).toContain('text/html')
    const html = await cb.text()
    // Posts the success payload to the configured opener origin, then closes.
    expect(html).toContain('"ok":true')
    expect(html).toContain('"source":"grinbox-oauth"')
    expect(html).toContain('http://10.0.0.5:8787')
    expect(html).toContain('window.close()')

    const creds = await db
      .selectFrom('credentials')
      .selectAll()
      .where('kind', '=', 'gmail_oauth')
      .where('deleted_at', 'is', null)
      .execute()
    expect(creds).toHaveLength(1)
  })

  it('GET /oauth/callback rejects an unknown state with a 400 error page', async () => {
    const { db } = await freshDbWithUser()
    const app = createOAuthRoutes({
      db,
      encryptor: testEncryptor(),
      store: createPendingAuthStore(),
      googleClient: makeFakeGoogleClient(),
    })

    const cb = await app.request('/oauth/callback?code=c&state=bogus')
    expect(cb.status).toBe(400)
    const html = await cb.text()
    expect(html).toContain('"ok":false')
    expect(html).toContain('invalid or expired authorization state')

    const creds = await db.selectFrom('credentials').selectAll().execute()
    expect(creds).toHaveLength(0)
  })

  it('POST /oauth/start rejects an invalid JSON body with 400', async () => {
    const { db } = await freshDbWithUser()
    const app = createOAuthRoutes({
      db,
      encryptor: testEncryptor(),
      store: createPendingAuthStore(),
      googleClient: makeFakeGoogleClient(),
    })

    const res = await app.request('/oauth/start', {
      method: 'POST',
      body: '{ not json',
      headers: { 'content-type': 'application/json' },
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('invalid_body')
  })

  it('GET /oauth/callback with a missing code returns a 400 error page', async () => {
    const { db } = await freshDbWithUser()
    const app = createOAuthRoutes({
      db,
      encryptor: testEncryptor(),
      store: createPendingAuthStore(),
      googleClient: makeFakeGoogleClient(),
    })

    const cb = await app.request('/oauth/callback?state=s') // no code
    expect(cb.status).toBe(400)
    expect(await cb.text()).toContain('missing code or state')
  })

  it('GET /oauth/callback with a missing state returns a 400 error page', async () => {
    const { db } = await freshDbWithUser()
    const app = createOAuthRoutes({
      db,
      encryptor: testEncryptor(),
      store: createPendingAuthStore(),
      googleClient: makeFakeGoogleClient(),
    })

    const cb = await app.request('/oauth/callback?code=c') // no state
    expect(cb.status).toBe(400)
    expect(await cb.text()).toContain('missing code or state')
  })

  it('GET /oauth/callback maps AccountNotFoundError (re-auth target gone) to 400', async () => {
    const { db } = await freshDbWithUser()
    const store = createPendingAuthStore()
    const app = createOAuthRoutes({
      db,
      encryptor: testEncryptor(),
      store,
      googleClient: makeFakeGoogleClient(),
    })

    // Begin a re-auth flow bound to an account that doesn't exist.
    const startRes = await app.request('/oauth/start', {
      method: 'POST',
      body: JSON.stringify({ account_id: 999 }),
      headers: { 'content-type': 'application/json' },
    })
    const url = new URL(((await startRes.json()) as { consent_url: string }).consent_url)
    const state = url.searchParams.get('state') ?? ''

    const cb = await app.request(`/oauth/callback?code=c&state=${state}`)
    expect(cb.status).toBe(400)
    const html = await cb.text()
    expect(html).toContain('"ok":false')
    expect(html).toContain('account to re-authorize was not found')
  })

  it('GET /oauth/callback maps an unexpected error to a generic 500 that leaks no secret', async () => {
    const { db } = await freshDbWithUser()
    const store = createPendingAuthStore()
    // A client whose exchange throws an error carrying a secret-shaped string;
    // the route must NOT surface it — only the generic "authorization failed".
    const leaky: FakeGoogleClient = {
      ...makeFakeGoogleClient(),
      exchangeCode: async () => {
        throw new Error('token=super-secret-refresh-abc123 leaked internally')
      },
    }
    const app = createOAuthRoutes({
      db,
      encryptor: testEncryptor(),
      store,
      googleClient: leaky,
    })

    const startRes = await app.request('/oauth/start', { method: 'POST' })
    const url = new URL(((await startRes.json()) as { consent_url: string }).consent_url)
    const state = url.searchParams.get('state') ?? ''

    const cb = await app.request(`/oauth/callback?code=c&state=${state}`)
    expect(cb.status).toBe(500)
    const html = await cb.text()
    expect(html).toContain('"ok":false')
    expect(html).toContain('authorization failed')
    // The internal error string must never reach the page.
    expect(html).not.toContain('super-secret-refresh-abc123')
    expect(html).not.toContain('leaked internally')
  })

  it('GET /oauth/callback defensively escapes an error string into the page (no raw </script>)', async () => {
    const { db } = await freshDbWithUser()
    const store = createPendingAuthStore()
    // InvalidStateError yields a fixed, escaped message; assert the embedded
    // JSON payload escapes `<` so a hostile error can't break out of <script>.
    const app = createOAuthRoutes({
      db,
      encryptor: testEncryptor(),
      store,
      googleClient: makeFakeGoogleClient(),
    })

    const cb = await app.request('/oauth/callback?code=c&state=%3C/script%3E%3Cscript%3Ealert(1)%3C/script%3E')
    // Unknown state → 400 error page; the page must not contain a raw closing
    // script tag injected from the (untrusted) inputs.
    expect(cb.status).toBe(400)
    const html = await cb.text()
    // The JSON payload inside <script> escapes `<` to <.
    expect(html).not.toMatch(/<\/script><script>/)
  })

  it('GET /oauth/callback posts with target "*" when no openerOrigin is configured', async () => {
    const { db } = await freshDbWithUser()
    const store = createPendingAuthStore()
    const app = createOAuthRoutes({
      db,
      encryptor: testEncryptor(),
      store,
      googleClient: makeFakeGoogleClient({ email: 'x@example.com' }),
      // openerOrigin intentionally omitted.
    })

    const startRes = await app.request('/oauth/start', { method: 'POST' })
    const url = new URL(((await startRes.json()) as { consent_url: string }).consent_url)
    const state = url.searchParams.get('state') ?? ''

    const cb = await app.request(`/oauth/callback?code=c&state=${state}`)
    expect(cb.status).toBe(200)
    const html = await cb.text()
    expect(html).toContain('postMessage(payload, "*")')
  })

  it('GET /oauth/callback surfaces the missing-refresh-token retry instruction', async () => {
    const { db } = await freshDbWithUser()
    const store = createPendingAuthStore()
    const app = createOAuthRoutes({
      db,
      encryptor: testEncryptor(),
      store,
      googleClient: makeFakeGoogleClient({ omitRefreshToken: true }),
    })

    const startRes = await app.request('/oauth/start', { method: 'POST' })
    const url = new URL(((await startRes.json()) as { consent_url: string }).consent_url)
    const state = url.searchParams.get('state') ?? ''

    const cb = await app.request(`/oauth/callback?code=c&state=${state}`)
    expect(cb.status).toBe(400)
    const html = await cb.text()
    expect(html).toContain('"ok":false')
    expect(html).toContain('refresh token')

    const creds = await db.selectFrom('credentials').selectAll().execute()
    expect(creds).toHaveLength(0)
  })
})
