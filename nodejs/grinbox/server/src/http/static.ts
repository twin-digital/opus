import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveStatic } from '@hono/node-server/serve-static'
import type { Context, Hono, Next } from 'hono'
import type { BlankEnv } from 'hono/types'

/**
 * Resolve the directory holding the built web SPA.
 *
 * Precedence:
 *  1. an explicit `configuredPath` (the `GRINBOX_WEB_DIST` env value) when set —
 *     resolved to an absolute path against `process.cwd()` if it is relative.
 *  2. otherwise, the path relative to the compiled server: this module compiles
 *     to `packages/server/dist/http/static.js`, and the Vite build emits to the
 *     sibling package's `packages/web/dist`, so `../../../web/dist` from this
 *     module's dir is the standard production location. This makes a normal
 *     deployment work with no env var set.
 */
export function resolveWebDistPath(configuredPath: string): string {
  if (configuredPath !== '') {
    return isAbsolute(configuredPath) ? configuredPath : resolve(process.cwd(), configuredPath)
  }
  const here = dirname(fileURLToPath(import.meta.url))
  return resolve(here, '../../../web/dist')
}

/**
 * Mount static-asset serving + SPA client-routing fallback onto `app`.
 *
 * Ordering contract: this is called *after* `/healthz`, `/oauth/*`, and the
 * `/api/*` router are mounted, so those keep their exact behavior and an unknown
 * `/api/*` path still falls through to the API's JSON 404 rather than the SPA's
 * `index.html`. The static layer only handles GET requests that don't match an
 * earlier route.
 *
 * Behavior:
 *  - Real files under `webDistPath` (`/assets/*`, `/favicon`, …) are served from
 *    disk.
 *  - A GET that matches no static file and is not `/api`, `/oauth`, or `/healthz`
 *    returns `index.html`, so client-side routes (`/inbox/123`) load the app.
 *  - Non-GET unmatched requests fall through to Hono's normal 404.
 *
 * Graceful absence: if `webDistPath` has no `index.html` (web not built, or a
 * dev/test run), this logs one warning and mounts nothing — the daemon still
 * boots and serves `/api` + `/healthz`.
 */
export function mountStatic(app: Hono, webDistPath: string): void {
  const indexHtml = join(webDistPath, 'index.html')
  if (!existsSync(indexHtml)) {
    console.warn(
      `[grinbox] web build not found at ${webDistPath} (no index.html); skipping static + SPA serving (API + /healthz still served)`,
    )
    return
  }

  // Reserved prefixes the API/OAuth/health surfaces own. The static layer is
  // registered after their routes, so a *matched* `/api`/`/oauth`/`/healthz`
  // request never reaches it. This guard covers the *unmatched* case — e.g.
  // `GET /api/<nonexistent>`, which has no api handler and would otherwise fall
  // into the SPA fallback and wrongly return `index.html`. Skipping it here lets
  // Hono's normal 404 (the API's JSON 404) stand.
  const isReserved = (path: string): boolean =>
    path === '/healthz' ||
    path === '/api' ||
    path.startsWith('/api/') ||
    path === '/oauth' ||
    path.startsWith('/oauth/')

  // serveStatic joins its `root` onto the request path. An absolute `root` joins
  // cleanly, so we pass the resolved dist dir directly rather than a cwd-relative
  // path. On a miss serveStatic calls `next()`, handing off to the SPA fallback.
  // Annotate the context so its Input generic is `{}` rather than the `any`
  // Hono infers for bare '*' handlers (which type-aware lint rejects).
  app.use('*', async (c: Context<BlankEnv, string>, next: Next) => {
    if (isReserved(c.req.path)) {
      return next()
    }
    return serveStatic({ root: webDistPath })(c, next)
  })

  // SPA fallback: any GET that didn't match a static file returns index.html so
  // the client router can take over. `path` serves a fixed file regardless of the
  // request path. Scoped to GET so non-GET unmatched requests hit Hono's 404, and
  // skips reserved prefixes so an unknown `/api/*` keeps the API's JSON 404.
  app.get('*', async (c, next) => {
    if (isReserved(c.req.path)) {
      return next()
    }
    return serveStatic({ root: webDistPath, path: 'index.html' })(c, next)
  })
}
