/**
 * `/api/accounts` — the Account list + detail the Accounts page reads
 * (ui-design.md "Accounts + OAuth onboarding").
 *
 *  - `GET /api/accounts` — one row per live Account: name, provider, active
 *    Pipeline (name + id), last poll, poll cadence, and a derived **status**.
 *  - `GET /api/accounts/:id` — the same fields for a single Account (the thin
 *    Account-detail settings page).
 *
 * Status derivation (the warning chip the list renders):
 *  - `needs_auth` — no live `gmail_oauth` Credential exists for the Account, so
 *    polling can't authenticate.
 *  - `no_pipeline` — `active_pipeline_id` is null ("no Pipeline assigned — won't
 *    be triaged").
 *  - `ok` — a live Pipeline is assigned and a live credential exists.
 *
 * `needs_auth` takes precedence over `no_pipeline`: an Account that can't even
 * authenticate is the more urgent thing to surface.
 */

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { ApiDeps } from './deps.js'

export type AccountStatus = 'ok' | 'no_pipeline' | 'needs_auth'

export interface AccountSummary {
  readonly id: number
  readonly name: string
  /** Display-badge glyph (shared ACCOUNT_ICONS); null → default mail icon. */
  readonly icon: string | null
  /** Display-badge color token (shared ACCOUNT_COLORS); null → neutral badge. */
  readonly color: string | null
  readonly provider_type: string
  readonly active_pipeline_id: number | null
  readonly active_pipeline_name: string | null
  readonly last_polled_at: number | null
  readonly poll_interval_seconds: number
  readonly status: AccountStatus
}

const idParam = z.object({ id: z.coerce.number().int().positive() })

export function createAccountsRoutes(deps: ApiDeps) {
  return new Hono()
    .get('/', async (c) => {
      const rows = await deps.db
        .selectFrom('accounts')
        .leftJoin('pipelines', (join) =>
          join.onRef('pipelines.id', '=', 'accounts.active_pipeline_id').on('pipelines.deleted_at', 'is', null),
        )
        .where('accounts.deleted_at', 'is', null)
        .select([
          'accounts.id as id',
          'accounts.name as name',
          'accounts.icon as icon',
          'accounts.color as color',
          'accounts.provider_type as provider_type',
          'accounts.active_pipeline_id as active_pipeline_id',
          'accounts.last_polled_at as last_polled_at',
          'accounts.poll_interval_seconds as poll_interval_seconds',
          'pipelines.name as active_pipeline_name',
        ])
        .orderBy('accounts.name', 'asc')
        .execute()

      // Which Accounts have a live gmail_oauth credential? One query, then a
      // membership check per row (cheaper than a per-row credential lookup).
      const credentialed = await liveOauthAccountIds(deps)

      const accounts: AccountSummary[] = rows.map((r) => ({
        id: r.id,
        name: r.name,
        icon: r.icon,
        color: r.color,
        provider_type: r.provider_type,
        active_pipeline_id: r.active_pipeline_id,
        active_pipeline_name: r.active_pipeline_name ?? null,
        last_polled_at: r.last_polled_at,
        poll_interval_seconds: r.poll_interval_seconds,
        status: deriveStatus(r.active_pipeline_id, credentialed.has(r.id)),
      }))

      return c.json({ accounts })
    })
    .get('/:id', zValidator('param', idParam), async (c) => {
      const { id } = c.req.valid('param')
      const r = await deps.db
        .selectFrom('accounts')
        .leftJoin('pipelines', (join) =>
          join.onRef('pipelines.id', '=', 'accounts.active_pipeline_id').on('pipelines.deleted_at', 'is', null),
        )
        .where('accounts.id', '=', id)
        .where('accounts.deleted_at', 'is', null)
        .select([
          'accounts.id as id',
          'accounts.name as name',
          'accounts.icon as icon',
          'accounts.color as color',
          'accounts.provider_type as provider_type',
          'accounts.active_pipeline_id as active_pipeline_id',
          'accounts.last_polled_at as last_polled_at',
          'accounts.poll_interval_seconds as poll_interval_seconds',
          'pipelines.name as active_pipeline_name',
        ])
        .executeTakeFirst()

      if (!r) {
        return c.json({ error: 'account_not_found' }, 404)
      }

      const credentialed = await liveOauthAccountIds(deps)
      const account: AccountSummary = {
        id: r.id,
        name: r.name,
        icon: r.icon,
        color: r.color,
        provider_type: r.provider_type,
        active_pipeline_id: r.active_pipeline_id,
        active_pipeline_name: r.active_pipeline_name ?? null,
        last_polled_at: r.last_polled_at,
        poll_interval_seconds: r.poll_interval_seconds,
        status: deriveStatus(r.active_pipeline_id, credentialed.has(r.id)),
      }
      return c.json({ account })
    })
}

function deriveStatus(activePipelineId: number | null, hasLiveOauth: boolean): AccountStatus {
  if (!hasLiveOauth) {
    return 'needs_auth'
  }
  if (activePipelineId === null) {
    return 'no_pipeline'
  }
  return 'ok'
}

/** The set of account ids that have a live (non-deleted) `gmail_oauth` cred. */
async function liveOauthAccountIds(deps: ApiDeps): Promise<Set<number>> {
  const creds = await deps.db
    .selectFrom('credentials')
    .where('kind', '=', 'gmail_oauth')
    .where('account_id', 'is not', null)
    .where('deleted_at', 'is', null)
    .select('account_id')
    .execute()
  const ids = new Set<number>()
  for (const c of creds) {
    if (c.account_id !== null) {
      ids.add(c.account_id)
    }
  }
  return ids
}
