/**
 * `/api/accounts` — the Account list + detail the Accounts page reads.
 *
 *  - `GET /api/accounts` — one row per live Account: name, provider, active
 *    Pipeline (name + id), last poll, poll cadence, and a derived **status**.
 *  - `GET /api/accounts/:id` — the same fields for a single Account (the thin
 *    Account-detail settings page).
 *
 * Status derivation (the warning chip the list renders):
 *  - `paused` — polling stopped and the Account needs the user: an IMAP server
 *    refused the password as the credential (d-v4mejzw5).
 *  - `needs_auth` — the Account holds no live credential of the kind its backend
 *    is authorized by, so polling can't authenticate.
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
import type { AccountCapabilities } from '../../providers/account-capabilities.js'
import { parseCapabilities } from '../../providers/account-capabilities.js'
import { IMAP_PASSWORD_KIND, IMAP_PROVIDER_TYPE } from '../../providers/imap/imap-settings.js'
import type { ApiDeps } from './deps.js'

export type AccountStatus = 'ok' | 'no_pipeline' | 'needs_auth' | 'paused'

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
  /**
   * What the Account's backend declared it can carry, read at its last poll
   * (d-bzw8qoiy). Null until the first successful poll. The interface reads it
   * to say which accounts cannot carry an operation, and why (d-qzxvoph1,
   * d-5h66e3zl).
   */
  readonly capabilities: AccountCapabilities | null
  /** Why polling is paused, or null while it runs (d-v4mejzw5). */
  readonly paused_reason: string | null
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
          'accounts.capabilities_json as capabilities_json',
          'accounts.paused_reason as paused_reason',
          'pipelines.name as active_pipeline_name',
        ])
        .orderBy('accounts.name', 'asc')
        .execute()

      // Which credential kinds does each Account hold? One query, then a
      // membership check per row (cheaper than a per-row credential lookup).
      const credentialed = await liveCredentialKinds(deps)

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
        status: deriveStatus(r.active_pipeline_id, isAuthorized(credentialed, r.id, r.provider_type), r.paused_reason),
        capabilities: parseCapabilities(r.capabilities_json),
        paused_reason: r.paused_reason,
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
          'accounts.capabilities_json as capabilities_json',
          'accounts.paused_reason as paused_reason',
          'pipelines.name as active_pipeline_name',
        ])
        .executeTakeFirst()

      if (!r) {
        return c.json({ error: 'account_not_found' }, 404)
      }

      const credentialed = await liveCredentialKinds(deps)
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
        status: deriveStatus(r.active_pipeline_id, isAuthorized(credentialed, r.id, r.provider_type), r.paused_reason),
        capabilities: parseCapabilities(r.capabilities_json),
        paused_reason: r.paused_reason,
      }
      return c.json({ account })
    })
    .get('/:id/folders', zValidator('param', idParam), async (c) => {
      const { accountFolders } = deps
      if (!accountFolders) {
        return c.json(
          { error: { code: 'folders_unavailable', message: "this deployment cannot list an account's folders" } },
          503,
        )
      }
      const { id } = c.req.valid('param')
      const account = await deps.db
        .selectFrom('accounts')
        .select('id')
        .where('id', '=', id)
        .where('deleted_at', 'is', null)
        .executeTakeFirst()
      if (!account) {
        return c.json({ error: 'account_not_found' }, 404)
      }
      return c.json({ folders: await accountFolders(id) })
    })
}

function deriveStatus(
  activePipelineId: number | null,
  authorized: boolean,
  pausedReason: string | null,
): AccountStatus {
  if (pausedReason !== null) {
    return 'paused'
  }
  if (!authorized) {
    return 'needs_auth'
  }
  if (activePipelineId === null) {
    return 'no_pipeline'
  }
  return 'ok'
}

/**
 * Which credential kind authorizes each backend: an OAuth grant the provider
 * issues for Gmail, a password the user holds for IMAP (d-fuln110d, d-ioso3voc).
 */
const AUTHORIZING_KIND: Readonly<Partial<Record<string, string>>> = {
  gmail: 'gmail_oauth',
  [IMAP_PROVIDER_TYPE]: IMAP_PASSWORD_KIND,
}

/** Account id → the live (non-deleted) credential kinds it holds. */
async function liveCredentialKinds(deps: ApiDeps): Promise<Map<number, Set<string>>> {
  const creds = await deps.db
    .selectFrom('credentials')
    .where('account_id', 'is not', null)
    .where('deleted_at', 'is', null)
    .select(['account_id', 'kind'])
    .execute()
  const byAccount = new Map<number, Set<string>>()
  for (const c of creds) {
    if (c.account_id !== null) {
      const kinds = byAccount.get(c.account_id) ?? new Set<string>()
      kinds.add(c.kind)
      byAccount.set(c.account_id, kinds)
    }
  }
  return byAccount
}

/** Does this Account hold the credential its backend is authorized by? */
function isAuthorized(kinds: Map<number, Set<string>>, accountId: number, providerType: string): boolean {
  const wanted = AUTHORIZING_KIND[providerType]
  if (wanted === undefined) {
    return false
  }
  return kinds.get(accountId)?.has(wanted) ?? false
}
