/**
 * Execution-loop optimistic claim (S2). Per data-model "Execution loop claim" /
 * pipeline-runtime.md "Optimistic claim": flip a `pending` run to `running` with
 * a `WHERE ... AND status='pending'` guard, and confirm exactly one row changed.
 *
 * In a single-process Daemon the claim is already atomic via the event loop; the
 * status guard is cheap insurance against future multi-process scenarios and any
 * bug path that bypasses the loop. The `(triage_id, operator_id)` pair is the
 * run row's PK.
 */

import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'

/**
 * Attempts to claim a `pending` Operator run, moving it to `running`. Returns
 * `true` iff this call won the claim (`changes === 1`); a second claim of the
 * same row returns `false`.
 */
export async function claimOperatorRun(
  db: Kysely<Database>,
  triageId: number,
  operatorId: number,
  startedAt: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const result = await db
    .updateTable('triage_operator_runs')
    .set({ status: 'running', started_at: startedAt })
    .where('triage_id', '=', triageId)
    .where('operator_id', '=', operatorId)
    .where('status', '=', 'pending')
    .executeTakeFirst()
  return Number(result.numUpdatedRows) === 1
}
