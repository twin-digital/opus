/**
 * `/api/activity` — the Activity Log feed (ui-design.md "Activity Log"):
 * operational events about Grinbox itself, most-recent-first, filterable by
 * severity and Resource.
 *
 * MVP sourcing note: daemon-level events (startup / shutdown / fetch errors)
 * are written to the systemd journal, NOT the State DB (data-model.md "Metrics
 * dashboard": "Daemon-level events go to logs"). So the DB-backed feed is
 * **Triage-derived**: it unions
 *   - `triage_events` rows with `event_type IN ('resource_op_limited',
 *     'resource_op_failed')` — Limit hits and Resource-op failures, and
 *   - failed `triage_operator_runs` (`status = 'failed'`) — Operator runtime
 *     failures.
 * This is a known MVP limitation, not a gap: the journal carries the rest, and
 * a later task can surface journal events here. Each entry carries a `severity`
 * (`warning` for limited, `error` for failures) and a `resource` (the Resource
 * named in the event, or `null` for a bare run failure) so the UI's
 * severity/Resource filters work.
 */

import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { ApiDeps } from './deps.js'

export type ActivitySeverity = 'warning' | 'error'

export interface ActivityEntry {
  /** Discriminates the underlying source row shape. */
  readonly source: 'triage_event' | 'operator_run'
  readonly severity: ActivitySeverity
  readonly event_type: string
  readonly resource: string | null
  readonly operation: string | null
  readonly triage_id: number
  readonly operator_id: number
  readonly message_id: number | null
  readonly recorded_at: number
  /** Human-facing detail (parsed message / error string), best-effort. */
  readonly detail: string | null
}

export interface ActivityResponse {
  readonly events: readonly ActivityEntry[]
  readonly page: { readonly limit: number; readonly offset: number }
}

const query = z.object({
  severity: z.enum(['warning', 'error']).optional(),
  resource: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export function createActivityRoutes(deps: ApiDeps) {
  return new Hono().get('/', zValidator('query', query), async (c) => {
    const f = c.req.valid('query')

    const entries: ActivityEntry[] = []

    // Source 1: resource-op limited/failed events.
    const eventRows = await deps.db
      .selectFrom('triage_events')
      .where('event_type', 'in', ['resource_op_limited', 'resource_op_failed'])
      .select(['triage_id', 'operator_id', 'event_type', 'details_json', 'recorded_at'])
      .execute()
    for (const r of eventRows) {
      const details = parseDetails(r.details_json)
      entries.push({
        source: 'triage_event',
        severity: r.event_type === 'resource_op_limited' ? 'warning' : 'error',
        event_type: r.event_type,
        resource: typeof details.resource === 'string' ? details.resource : null,
        operation: typeof details.operation === 'string' ? details.operation : null,
        triage_id: r.triage_id,
        operator_id: r.operator_id,
        message_id: null,
        recorded_at: r.recorded_at,
        detail:
          typeof details.error === 'string' ? details.error
          : typeof details.scope === 'string' ? `limit scope: ${details.scope}`
          : null,
      })
    }

    // Source 2: failed Operator runs. `finished_at` is the event time (a failed
    // run is always terminal, so it's non-null per the run-row CHECK).
    const runRows = await deps.db
      .selectFrom('triage_operator_runs')
      .where('status', '=', 'failed')
      .select(['triage_id', 'operator_id', 'message_id', 'error_summary', 'finished_at', 'created_at'])
      .execute()
    for (const r of runRows) {
      entries.push({
        source: 'operator_run',
        severity: 'error',
        event_type: 'operator_run_failed',
        resource: null,
        operation: null,
        triage_id: r.triage_id,
        operator_id: r.operator_id,
        message_id: r.message_id,
        recorded_at: r.finished_at ?? r.created_at,
        detail: r.error_summary,
      })
    }

    // Filter + sort most-recent-first across both sources, then paginate.
    const filtered = entries
      .filter((e) => (f.severity ? e.severity === f.severity : true))
      .filter((e) => (f.resource ? e.resource === f.resource : true))
      .sort((a, b) => b.recorded_at - a.recorded_at)

    const page = filtered.slice(f.offset, f.offset + f.limit)
    return c.json<ActivityResponse>({
      events: page,
      page: { limit: f.limit, offset: f.offset },
    })
  })
}

function parseDetails(json: string | null): Record<string, unknown> {
  if (!json) {
    return {}
  }
  try {
    const v: unknown = JSON.parse(json)
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
