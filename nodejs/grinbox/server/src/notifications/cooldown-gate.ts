/**
 * The per-run notification cooldown gate (d-5amonj40, d-6ptxams7). The worker
 * builds one per Notify run; the operator consults it before its push reaches
 * any Resource, so a suppressed push is never Limit-checked and counts against
 * no Limit.
 *
 *  - `checkCooldown(kind)` — reads the user's interval for the kind
 *    (`notification_cooldowns`, d-k3wq81vn) and the latest delivered push of
 *    that kind (`notification_pushes`). A push inside the interval suppresses:
 *    the gate emits a `push_suppressed` event against this run — carrying the
 *    kind and the run whose push it deferred to (d-e9jslw4x) — and the verdict
 *    tells Notify to send nothing and complete.
 *  - `recordPush(kind)` — records this run's delivered push so later runs of
 *    the kind can defer to it. Called only after a succeeded send that named a
 *    kind; a kind-less push is recorded nowhere and grouped with nothing
 *    (d-vn2jdxbs).
 */

import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import type { CooldownVerdict, NotificationGate } from '../operators/types.js'
import type { ResourceEvent } from '../resources/make-resource-client.js'

export interface CooldownGateDeps {
  readonly db: Kysely<Database>
  readonly userId: number
  readonly triageId: number
  readonly operatorId: number
  /** Event accumulator — the same channel the metered clients report through. */
  readonly onEvent: (event: ResourceEvent) => void
  /** Injected clock (Unix seconds); defaults to the system clock. */
  readonly now?: () => number
}

export function createNotificationGate(deps: CooldownGateDeps): NotificationGate {
  const now = deps.now ?? ((): number => Math.floor(Date.now() / 1000))

  return {
    async checkCooldown(kind: string): Promise<CooldownVerdict> {
      const cooldown = await deps.db
        .selectFrom('notification_cooldowns')
        .select(['interval_seconds'])
        .where('user_id', '=', deps.userId)
        .where('kind', '=', kind)
        .executeTakeFirst()
      if (!cooldown) {
        // A kind with no setting has no cooldown (d-t6mhv3aq).
        return { suppressed: false }
      }

      const ts = now()
      const latest = await deps.db
        .selectFrom('notification_pushes')
        .select(['triage_id', 'operator_id', 'sent_at'])
        .where('user_id', '=', deps.userId)
        .where('kind', '=', kind)
        .where('sent_at', '>', ts - cooldown.interval_seconds)
        .orderBy('sent_at', 'desc')
        .orderBy('id', 'desc')
        .limit(1)
        .executeTakeFirst()
      if (!latest) {
        return { suppressed: false }
      }

      deps.onEvent({
        event_type: 'push_suppressed',
        details: {
          kind,
          deferred_to_triage_id: latest.triage_id,
          deferred_to_operator_id: latest.operator_id,
        },
      })
      return {
        suppressed: true,
        kind,
        deferred_to: { triage_id: latest.triage_id, operator_id: latest.operator_id },
      }
    },

    async recordPush(kind: string): Promise<void> {
      await deps.db
        .insertInto('notification_pushes')
        .values({
          user_id: deps.userId,
          kind,
          triage_id: deps.triageId,
          operator_id: deps.operatorId,
          sent_at: now(),
        })
        .execute()
    },
  }
}
