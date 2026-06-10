/**
 * `/api/credentials` — read-only, non-secret metadata for the User's live
 * Credentials. The Notify Operator editor uses this to populate its Pushover
 * Credential picker (`?kind=pushover`) instead of asking for a raw numeric id.
 *
 * The route returns only the metadata columns — `id`, `kind`, `account_id`,
 * `created_at`, `updated_at` — and **never** the encrypted `data_enc` blob. The
 * secret material (`app_token` / `user_key`, OAuth tokens) only ever leaves the
 * DB through the daemon's own credential-store reads, not over the web surface.
 *
 * An optional `?kind=` query narrows to a single Credential kind (`gmail_oauth`,
 * `pushover`); omitted, every live Credential is returned. Single-User MVP: rows
 * aren't filtered by user (the read surface assumes one seeded User), matching
 * the other read routes.
 */

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { ApiDeps } from './deps.js'

export interface CredentialSummary {
  readonly id: number
  readonly kind: string
  readonly account_id: number | null
  readonly created_at: number
  readonly updated_at: number | null
}

const listQuery = z.object({ kind: z.string().min(1).optional() })

export function createCredentialsRoutes(deps: ApiDeps) {
  return new Hono().get('/', zValidator('query', listQuery), async (c) => {
    const { kind } = c.req.valid('query')
    let query = deps.db
      .selectFrom('credentials')
      .where('deleted_at', 'is', null)
      // Metadata only — `data_enc` is deliberately never selected.
      .select(['id', 'kind', 'account_id', 'created_at', 'updated_at'])
      .orderBy('id', 'asc')
    if (kind !== undefined) {
      query = query.where('kind', '=', kind)
    }

    const rows = await query.execute()
    const credentials: CredentialSummary[] = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      account_id: r.account_id,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }))
    return c.json({ credentials })
  })
}
