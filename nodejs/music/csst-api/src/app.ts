import { Hono } from 'hono'

/**
 * Builds the CS Studio API.
 */
export function createApp() {
  return new Hono().get('/healthz', (c) => c.json({ ok: true }))
}

/**
 * Route surface the web client builds a typed Hono RPC client from.
 */
export type AppType = ReturnType<typeof createApp>
