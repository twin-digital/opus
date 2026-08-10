/**
 * `POST /api/sync` — trigger an on-demand Gmail poll for every eligible Account,
 * bypassing the per-Account interval. The Inbox refresh button calls this so a
 * user can pull new mail immediately instead of waiting for the scheduled tick.
 *
 * The actual poll work is the daemon's {@link ApiDeps.syncNow} seam (the poll
 * scheduler's `pollAllNow`). When it isn't wired (read-only / test app, or a
 * boot without a Provider), the route reports `sync_unavailable` (503) rather
 * than pretending to sync. The call is synchronous: it resolves once the poll
 * cycle has fetched + upserted new Messages (their Triages then run
 * asynchronously), so the client can refetch the list right after.
 */

import { Hono } from 'hono'
import type { ApiDeps, SyncResult } from './deps.js'

export function createSyncRoutes(deps: ApiDeps) {
  return new Hono().post('/', async (c) => {
    if (deps.syncNow === undefined) {
      return c.json(
        {
          error: { code: 'sync_unavailable', message: 'Sync is not available' },
        },
        503,
      )
    }
    const result: SyncResult = await deps.syncNow()
    return c.json(result)
  })
}
