import { hc } from 'hono/client'
import { describe, expect, it } from 'vitest'
import type { ApiRoutes } from './index.js'

/**
 * Type-level confirmation that the exported `ApiRoutes` is usable as the
 * argument to Hono's RPC client `hc<ApiRoutes>` — exactly how the web tier
 * consumes it. The build of `client` here is purely to exercise the type; if a
 * route group were defined in a way Hono's RPC can't infer (e.g. not chained),
 * this file would fail to typecheck. We also assert a couple of route paths
 * exist on the client at runtime so the test isn't only compile-time.
 */
describe('ApiRoutes is a valid hc<AppType>', () => {
  it('builds a typed client whose route tree matches the mounted paths', () => {
    const client = hc<ApiRoutes>('http://localhost')
    // The chained `.route('/api/...')` calls surface as nested accessors.
    expect(client.api.accounts.$url().pathname).toBe('/api/accounts')
    expect(client.api.credentials.$url().pathname).toBe('/api/credentials')
    expect(client.api.pipelines.$url().pathname).toBe('/api/pipelines')
    expect(client.api.messages.$url().pathname).toBe('/api/messages')
    expect(client.api.limits.$url().pathname).toBe('/api/limits')
    expect(client.api.activity.$url().pathname).toBe('/api/activity')
    expect(client.api.dashboard.$url().pathname).toBe('/api/dashboard')
  })

  it('exposes the write routes on the typed client', () => {
    const client = hc<ApiRoutes>('http://localhost')
    // Mutating routes are chained onto the same app, so the RPC type carries
    // them. Assert their `$post`/`$patch`/`$delete` accessors and paths exist.
    expect(typeof client.api.pipelines.$post).toBe('function')
    expect(client.api.limits.$post).toBeTypeOf('function')
    expect(client.api.credentials.$post).toBeTypeOf('function')
    expect(client.api.messages[':id'].replay.$url({ param: { id: '1' } }).pathname).toBe('/api/messages/1/replay')
    expect(client.api.operators[':id'].enable.$url({ param: { id: '2' } }).pathname).toBe('/api/operators/2/enable')
  })
})
