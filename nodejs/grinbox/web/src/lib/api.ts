import type { ApiRoutes } from '@twin-digital/grinbox-server'
import { hc } from 'hono/client'

/**
 * Typed Hono RPC client for the daemon's `/api` surface. The type parameter is
 * the server's exported `ApiRoutes`, so every route's path + response shape is
 * inferred end-to-end with no hand-written DTOs (architecture.md "Web UI").
 *
 * The base URL is same-origin by default — the SPA is served by the daemon — and
 * overridable via `VITE_API_BASE` for split-origin dev. The `@twin-digital/grinbox-server`
 * import is type-only (erased at build); the web bundle never pulls in server
 * runtime code.
 */
export const apiBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

export const api = hc<ApiRoutes>(apiBase)
