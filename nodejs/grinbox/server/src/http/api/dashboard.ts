/**
 * `/api/dashboard` — the single aggregate the Dashboard cards read
 * (ui-design.md "Dashboard"; data-model.md "Metrics dashboard"). One endpoint,
 * one round of aggregates:
 *
 *  - `first_run` checklist flags: whether any Account / Pipeline exists, and
 *    whether any Account has an active Pipeline assigned.
 *  - `triages_last_24h` — count of `triages` started in the trailing 24h.
 *  - `notifications_sent_today` — count of `resource_op_succeeded` events whose
 *    `details_json.operation = 'send_notification'`, since local-agnostic
 *    midnight (computed as the start of the trailing 24h is *not* "today"; we
 *    use start-of-UTC-day relative to `now`). Matches data-model.md's
 *    notification-volume query, scoped to today.
 *  - `top_tags` — the most common current Tags across recent Messages (the
 *    `current_triages → tags` join), as `{key, value, count}` rows.
 *  - `errors_last_24h` / `limit_hits_last_24h` — counts of `resource_op_failed`
 *    / `resource_op_limited` events in the trailing 24h, plus failed Triages.
 *    The card renders only when non-zero.
 *  - `recent_operator_edits` — the latest `change_log` rows for
 *    `entity_type = 'operator'` (the "recent Operator edits" quick link).
 *
 * All time windows are computed from the injected `now` (UNIX seconds), so the
 * 24h / today math is deterministic under a frozen clock in tests.
 */

import { Hono } from 'hono'
import type { ApiDeps } from './deps.js'

const DAY_SECONDS = 86_400

export interface TopTag {
  readonly key: string
  readonly value: string
  readonly count: number
}

export interface RecentOperatorEdit {
  readonly change_log_id: number
  readonly operator_id: number
  readonly action: string
  readonly actor_user_id: number | null
  readonly recorded_at: number
}

export interface DashboardResponse {
  readonly first_run: {
    readonly has_account: boolean
    readonly has_pipeline: boolean
    readonly has_assigned_pipeline: boolean
  }
  readonly triages_last_24h: number
  readonly notifications_sent_today: number
  readonly top_tags: readonly TopTag[]
  readonly errors_last_24h: number
  readonly limit_hits_last_24h: number
  readonly failed_triages_last_24h: number
  readonly recent_operator_edits: readonly RecentOperatorEdit[]
}

export function createDashboardRoutes(deps: ApiDeps) {
  return new Hono().get('/', async (c) => {
    const now = deps.now()
    const since24h = now - DAY_SECONDS
    const startOfToday = now - (now % DAY_SECONDS) // start of UTC day

    const [
      accountCount,
      pipelineCount,
      assignedCount,
      triages24h,
      failedTriages24h,
      notifRows,
      errors24h,
      limitHits24h,
      topTagRows,
      edits,
    ] = await Promise.all([
      deps.db
        .selectFrom('accounts')
        .where('deleted_at', 'is', null)
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .executeTakeFirst(),
      deps.db
        .selectFrom('pipelines')
        .where('deleted_at', 'is', null)
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .executeTakeFirst(),
      deps.db
        .selectFrom('accounts')
        .where('deleted_at', 'is', null)
        .where('active_pipeline_id', 'is not', null)
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .executeTakeFirst(),
      deps.db
        .selectFrom('triages')
        .where('started_at', '>=', since24h)
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .executeTakeFirst(),
      deps.db
        .selectFrom('triages')
        .where('started_at', '>=', since24h)
        .where('status', '=', 'failed')
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .executeTakeFirst(),
      // Notifications today: succeeded send_notification events. Fetched as rows
      // (details_json filtered in app code) to stay portable across SQLite JSON
      // support; the daily volume is small.
      deps.db
        .selectFrom('triage_events')
        .where('event_type', '=', 'resource_op_succeeded')
        .where('recorded_at', '>=', startOfToday)
        .select(['details_json'])
        .execute(),
      deps.db
        .selectFrom('triage_events')
        .where('event_type', '=', 'resource_op_failed')
        .where('recorded_at', '>=', since24h)
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .executeTakeFirst(),
      deps.db
        .selectFrom('triage_events')
        .where('event_type', '=', 'resource_op_limited')
        .where('recorded_at', '>=', since24h)
        .select((eb) => eb.fn.countAll<number>().as('n'))
        .executeTakeFirst(),
      deps.db
        .selectFrom('current_triages as ct')
        .innerJoin('tags as tg', 'tg.triage_id', 'ct.triage_id')
        .select((eb) => ['tg.key as key', 'tg.value as value', eb.fn.countAll<number>().as('count')])
        .groupBy(['tg.key', 'tg.value'])
        .orderBy('count', 'desc')
        .orderBy('tg.key', 'asc')
        .orderBy('tg.value', 'asc')
        .limit(10)
        .execute(),
      deps.db
        .selectFrom('change_log')
        .where('entity_type', '=', 'operator')
        .select(['id', 'entity_id', 'action', 'actor_user_id', 'recorded_at'])
        .orderBy('recorded_at', 'desc')
        .orderBy('id', 'desc')
        .limit(10)
        .execute(),
    ])

    const notificationsSentToday = notifRows.filter((r) => {
      if (!r.details_json) {
        return false
      }
      try {
        const d = JSON.parse(r.details_json) as { operation?: unknown }
        return d.operation === 'send_notification'
      } catch {
        return false
      }
    }).length

    const body: DashboardResponse = {
      first_run: {
        has_account: (accountCount?.n ?? 0) > 0,
        has_pipeline: (pipelineCount?.n ?? 0) > 0,
        has_assigned_pipeline: (assignedCount?.n ?? 0) > 0,
      },
      triages_last_24h: triages24h?.n ?? 0,
      notifications_sent_today: notificationsSentToday,
      top_tags: topTagRows.map((r) => ({
        key: r.key,
        value: r.value,
        count: r.count,
      })),
      errors_last_24h: errors24h?.n ?? 0,
      limit_hits_last_24h: limitHits24h?.n ?? 0,
      failed_triages_last_24h: failedTriages24h?.n ?? 0,
      recent_operator_edits: edits.map((e) => ({
        change_log_id: e.id,
        operator_id: e.entity_id,
        action: e.action,
        actor_user_id: e.actor_user_id,
        recorded_at: e.recorded_at,
      })),
    }
    return c.json(body)
  })
}
