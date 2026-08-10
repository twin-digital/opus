/**
 * Startup recovery sweep for digest runs, the `digest_runs` counterpart of the
 * Triage-run sweep (execution/recovery.ts): a previous process may have died
 * with a run still `running`. Marking it `failed` keeps the coverage watermark
 * unadvanced (only `completed` runs advance it), so the occurrence's window is
 * absorbed into the next scheduled run — and the claim row it left behind
 * still blocks its occurrence from ever firing twice.
 */

import type { DB } from '../db/schema.js'

/** Mark interrupted `running` digest runs `failed`. Idempotent. */
export async function recoverInterruptedDigestRuns(db: DB): Promise<number> {
  const result = await db
    .updateTable('digest_runs')
    .set({
      status: 'failed',
      finished_at: Math.floor(Date.now() / 1000),
      error_summary: 'daemon interrupted',
    })
    .where('status', '=', 'running')
    .executeTakeFirst()
  return Number(result.numUpdatedRows)
}
