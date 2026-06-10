/**
 * `/api/limits` — the Limits settings subsection (ui-design.md "Settings →
 * Limits"). One entry per Limit with its current usage:
 *
 *  - `per_window` Limits carry their tumbling-window counter state. The stored
 *    `window_start` may belong to an expired window; usage is reported as `0`
 *    when `now - window_start >= window_seconds` (the next attempt resets it),
 *    matching the resource-operation tumbling-window check. `now` comes from the
 *    injected clock so the expiry math is deterministic in tests.
 *  - `per_message` Limits accumulate per Message and never reset; there's no
 *    single "current usage" number, so the response reports how many Messages
 *    have a counter and the largest per-Message count (the closest-to-limit
 *    Message). The per-Message detail isn't expanded here — the Limits page
 *    shows the definition + headroom, and per-Message context surfaces on
 *    Message detail.
 */

import { Hono } from 'hono'
import type { ApiDeps } from './deps.js'

export interface WindowUsage {
  readonly kind: 'per_window'
  readonly window_start: number | null
  /** Count within the *current* (non-expired) window; 0 if expired/unused. */
  readonly current_count: number
  readonly window_active: boolean
}

export interface MessageUsage {
  readonly kind: 'per_message'
  /** Number of Messages that have hit this Limit at least once. */
  readonly messages_counted: number
  /** Largest per-Message count — the Message closest to (or at) the cap. */
  readonly max_message_count: number
}

export interface LimitEntry {
  readonly id: number
  readonly resource: string
  readonly operation: string
  readonly scope: 'per_window' | 'per_message'
  readonly max_count: number
  readonly window_seconds: number | null
  readonly usage: WindowUsage | MessageUsage
}

export function createLimitsRoutes(deps: ApiDeps) {
  return new Hono().get('/', async (c) => {
    const now = deps.now()

    const limits = await deps.db
      .selectFrom('limits')
      .select(['id', 'resource', 'operation', 'scope', 'max_count', 'window_seconds'])
      .orderBy('resource', 'asc')
      .orderBy('operation', 'asc')
      .orderBy('scope', 'asc')
      .execute()

    const windowCounters = await deps.db
      .selectFrom('limit_counters_window')
      .select(['limit_id', 'window_start', 'count'])
      .execute()
    const windowByLimit = new Map(windowCounters.map((w) => [w.limit_id, w]))

    const messageAgg = await deps.db
      .selectFrom('limit_counters_message')
      .select((eb) => [
        'limit_id',
        eb.fn.countAll<number>().as('messages_counted'),
        eb.fn.max('count').as('max_message_count'),
      ])
      .groupBy('limit_id')
      .execute()
    const messageByLimit = new Map(messageAgg.map((m) => [m.limit_id, m]))

    const entries: LimitEntry[] = limits.map((l) => {
      let usage: WindowUsage | MessageUsage
      if (l.scope === 'per_window') {
        const w = windowByLimit.get(l.id)
        const windowSeconds = l.window_seconds ?? 0
        const active = w !== undefined && windowSeconds > 0 && now - w.window_start < windowSeconds
        usage = {
          kind: 'per_window',
          window_start: w?.window_start ?? null,
          current_count: active ? w.count : 0,
          window_active: active,
        }
      } else {
        const m = messageByLimit.get(l.id)
        usage = {
          kind: 'per_message',
          messages_counted: m?.messages_counted ?? 0,
          max_message_count: m?.max_message_count ?? 0,
        }
      }
      return {
        id: l.id,
        resource: l.resource,
        operation: l.operation,
        scope: l.scope,
        max_count: l.max_count,
        window_seconds: l.window_seconds,
        usage,
      }
    })

    return c.json({ limits: entries })
  })
}
