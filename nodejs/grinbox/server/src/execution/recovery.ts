/**
 * Startup recovery sweep (pipeline-runtime.md "Daemon lifecycle → Startup
 * sequence"). A previous Daemon process may have crashed (or been killed at the
 * shutdown hard-timeout) with `triage_operator_runs` rows still `running` — work
 * that is no longer in flight. This sweep marks every such row `failed` with
 * `error_summary='daemon interrupted'`, then settles any Triage those rows
 * belonged to: newly-`failed` runs cascade their dependents to `skipped` (handled
 * by the execution loop on the next ticks) and Triages whose runs are now all
 * terminal settle to `partial`.
 *
 * Runs in a single transaction at startup, before the execution loop starts, so
 * the loop never observes a stale `running` row it didn't dispatch.
 */

import type { DB } from '../db/schema.js'
import { settleTriageIfTerminal } from '../pipeline/persist.js'

/** Number of interrupted runs the sweep marked `failed`. */
export interface RecoveryResult {
  readonly sweptRuns: number
  readonly settledTriages: number
}

/**
 * Mark interrupted `running` runs `failed` and settle their Triages. Idempotent:
 * a second call finds no `running` rows and is a no-op. Single transaction.
 */
export async function recoverInterruptedRuns(db: DB): Promise<RecoveryResult> {
  return db.transaction().execute(async (tx) => {
    const ts = now()

    const interrupted = await tx
      .selectFrom('triage_operator_runs')
      .select(['triage_id'])
      .where('status', '=', 'running')
      .execute()

    if (interrupted.length === 0) {
      return { sweptRuns: 0, settledTriages: 0 }
    }

    await tx
      .updateTable('triage_operator_runs')
      .set({
        status: 'failed',
        finished_at: ts,
        error_summary: 'daemon interrupted',
      })
      .where('status', '=', 'running')
      .execute()

    // Settle each affected Triage whose runs are now all terminal, via the
    // shared settlement in `pipeline/persist.ts` (the same check run
    // completion uses). A Triage with surviving `pending` runs stays
    // `running` — the execution loop will pick those up and cascade-skip
    // dependents of the just-failed runs.
    const affectedTriageIds = [...new Set(interrupted.map((r) => r.triage_id))]
    let settledTriages = 0
    for (const triageId of affectedTriageIds) {
      if (await settleTriageIfTerminal(tx, triageId, ts)) {
        settledTriages++
      }
    }

    return { sweptRuns: interrupted.length, settledTriages }
  })
}

function now(): number {
  return Math.floor(Date.now() / 1000)
}
