/**
 * `/api/cooldowns` — the user's per-kind minimum intervals (d-k3wq81vn) plus
 * the kind names the pipelines' enabled Notify Operators currently send, so
 * the interface can offer a cooldown for a kind before one is set. A kind's
 * setting outlives the operators naming it, so the two lists are independent:
 * a cooldown may name a kind no operator sends today, and a kind in use may
 * have no cooldown (then it has none at all, d-t6mhv3aq).
 */

import { operatorConfigSchemas } from '@grinbox/shared'
import { Hono } from 'hono'
import type { ApiDeps } from './deps.js'

export interface CooldownEntry {
  readonly id: number
  /** Stored trimmed; matched character for character (d-p8xrn2ce). */
  readonly kind: string
  /** Whole seconds >= 1, no ceiling (d-t6mhv3aq). */
  readonly interval_seconds: number
  readonly created_at: number
}

export function createCooldownsRoutes(deps: ApiDeps) {
  return new Hono().get('/', async (c) => {
    const rows = await deps.db
      .selectFrom('notification_cooldowns')
      .select(['id', 'kind', 'interval_seconds', 'created_at'])
      .orderBy('kind', 'asc')
      .execute()

    const cooldowns: CooldownEntry[] = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      interval_seconds: r.interval_seconds,
      created_at: r.created_at,
    }))

    // Kinds named by enabled, non-deleted Notify Operators (d-vn2jdxbs), read
    // through the shared config schema the save path validates against
    // (d-l6bbgp05: the optional `notification_kind` field). A config that
    // doesn't parse contributes nothing.
    const operators = await deps.db
      .selectFrom('operators')
      .select(['config_json'])
      .where('type_key', '=', 'notify')
      .where('enabled', '=', 1)
      .where('deleted_at', 'is', null)
      .execute()
    const kindsInUse = new Set<string>()
    for (const row of operators) {
      const parsed = operatorConfigSchemas.notify.safeParse(safeJsonParse(row.config_json))
      if (parsed.success && parsed.data.notification_kind !== undefined) {
        kindsInUse.add(parsed.data.notification_kind)
      }
    }

    return c.json({ cooldowns, kinds_in_use: [...kindsInUse].sort() })
  })
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
