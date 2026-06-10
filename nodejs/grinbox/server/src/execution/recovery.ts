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

import { type Kysely, sql } from 'kysely'
import type { DB, Database } from '../db/schema.js'
import { deriveTriageStatus } from '../pipeline/persist.js'

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

    // Settle each affected Triage whose runs are now all terminal. A Triage
    // with surviving `pending` runs stays `running` — the execution loop will
    // pick those up and cascade-skip dependents of the just-failed runs.
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

/**
 * If every run for `triageId` is terminal, derive its final status, set
 * `ended_at`, and UPSERT `current_triages` (latest-started-wins). Mirrors the
 * settlement done inside `persistOperatorResult`, reusing
 * {@link deriveTriageStatus}. Returns whether it settled.
 */
async function settleTriageIfTerminal(tx: Kysely<Database>, triageId: number, ts: number): Promise<boolean> {
  const runs = await tx
    .selectFrom('triage_operator_runs')
    .select(['status', 'message_id'])
    .where('triage_id', '=', triageId)
    .execute()

  const anyNonTerminal = runs.some((r) => r.status === 'pending' || r.status === 'running')
  if (anyNonTerminal) {
    return false
  }

  const finalStatus = deriveTriageStatus(runs.map((r) => r.status))

  const triage = await tx
    .selectFrom('triages')
    .select(['pipeline_id', 'started_at', 'message_id'])
    .where('id', '=', triageId)
    .executeTakeFirstOrThrow()

  await tx.updateTable('triages').set({ status: finalStatus, ended_at: ts }).where('id', '=', triageId).execute()

  await sql`
    INSERT INTO current_triages (message_id, pipeline_id, triage_id,
                                 triage_started_at, updated_at)
    VALUES (${triage.message_id}, ${triage.pipeline_id}, ${triageId},
            ${triage.started_at}, ${ts})
    ON CONFLICT (message_id, pipeline_id) DO UPDATE SET
      triage_id          = excluded.triage_id,
      triage_started_at  = excluded.triage_started_at,
      updated_at         = excluded.updated_at
    WHERE excluded.triage_started_at > current_triages.triage_started_at
  `.execute(tx)

  return true
}

function now(): number {
  return Math.floor(Date.now() / 1000)
}
