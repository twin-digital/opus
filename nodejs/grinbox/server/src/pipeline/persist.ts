/**
 * Operator run completion + settlement (S2). Per data-model "Operator run
 * completion" / pipeline-runtime.md "Execution loop → persistOperatorResult":
 * each completion runs as one `BEGIN IMMEDIATE` transaction that UPDATEs the run
 * row, INSERTs output Tags, INSERTs `triage_events` (each computing its
 * `sequence_num` in a single `INSERT ... SELECT COALESCE(MAX(...),0)+1`
 * statement), then performs the in-transaction settlement check.
 *
 * Doing settlement in the same transaction is what makes concurrent worker
 * completions safe: only one worker observes "no siblings pending/running" and
 * wins the settlement; the other sees the already-settled state next transaction
 * and does nothing. `BEGIN IMMEDIATE` serializes the whole sequence.
 */

import { type Kysely, sql } from 'kysely'
import type { Database } from '../db/schema.js'
import { withPipelineEditLock } from './edit-lock.js'

/** A single output Tag an Operator produced. */
export interface OutputTag {
  readonly key: string
  readonly value: string
}

/** A `triage_events` row to record (sequence_num is assigned in-transaction). */
export interface TriageEventInput {
  readonly eventType: 'tag_set' | 'resource_op_succeeded' | 'resource_op_limited' | 'resource_op_failed'
  readonly detailsJson: string | null
}

/** The run being completed: identity + denormalized message id. */
export interface RunRef {
  readonly triageId: number
  readonly operatorId: number
  readonly messageId: number
  readonly pipelineId: number
}

export interface PersistResultArgs {
  readonly tags: readonly OutputTag[]
  readonly events: readonly TriageEventInput[]
  readonly usage: Readonly<Record<string, unknown>> | null
  readonly errorSummary: string | null
  readonly durationMs: number | null
}

/**
 * Persists a completed Operator run (`completed` or `failed`) with its output
 * Tags, events, and usage, then settles the Triage if this was the last
 * non-terminal sibling run. Single `BEGIN IMMEDIATE` transaction.
 */
export async function persistOperatorResult(
  db: Kysely<Database>,
  run: RunRef,
  outcome: 'completed' | 'failed',
  args: PersistResultArgs,
): Promise<void> {
  return withPipelineEditLock(db, async (tx) => {
    const ts = now()

    await tx
      .updateTable('triage_operator_runs')
      .set({
        status: outcome,
        finished_at: ts,
        duration_ms: args.durationMs,
        resource_usage_json: args.usage ? JSON.stringify(args.usage) : null,
        error_summary: args.errorSummary,
      })
      .where('triage_id', '=', run.triageId)
      .where('operator_id', '=', run.operatorId)
      .execute()

    for (const tag of args.tags) {
      await tx
        .insertInto('tags')
        .values({
          triage_id: run.triageId,
          operator_id: run.operatorId,
          key: tag.key,
          value: tag.value,
          created_at: ts,
        })
        .execute()
    }

    for (const event of args.events) {
      await insertTriageEvent(tx, run, event, ts)
    }

    await maybeSettle(tx, run, ts)
  })
}

/**
 * Marks an Operator run `skipped` (the execution loop's cascade-skip path,
 * pipeline-runtime.md `markSkipped`), then runs the same in-transaction
 * settlement check as {@link persistOperatorResult}. A skipped run produces no
 * Tags or events.
 */
export async function markSkipped(
  db: Kysely<Database>,
  triageId: number,
  operatorId: number,
  reason: string,
): Promise<void> {
  return withPipelineEditLock(db, async (tx) => {
    const ts = now()
    const runRow = await tx
      .selectFrom('triage_operator_runs')
      .select(['message_id'])
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', operatorId)
      .executeTakeFirstOrThrow()
    const pipelineRow = await tx
      .selectFrom('triages')
      .select(['pipeline_id'])
      .where('id', '=', triageId)
      .executeTakeFirstOrThrow()

    await tx
      .updateTable('triage_operator_runs')
      .set({ status: 'skipped', finished_at: ts, skip_reason: reason })
      .where('triage_id', '=', triageId)
      .where('operator_id', '=', operatorId)
      .execute()

    await maybeSettle(
      tx,
      {
        triageId,
        operatorId,
        messageId: runRow.message_id,
        pipelineId: pipelineRow.pipeline_id,
      },
      ts,
    )
  })
}

/**
 * Settlement check, inside the caller's transaction. If no sibling run for the
 * Triage remains `pending`/`running`, derives the final Triage status, sets
 * `ended_at`, and UPSERTs `current_triages` via the conditional
 * latest-started-wins single statement (data-model `current_triages`).
 */
async function maybeSettle(tx: Kysely<Database>, run: RunRef, ts: number): Promise<void> {
  const statuses = await tx
    .selectFrom('triage_operator_runs')
    .select(['status'])
    .where('triage_id', '=', run.triageId)
    .execute()

  const anyNonTerminal = statuses.some((s) => s.status === 'pending' || s.status === 'running')
  if (anyNonTerminal) {
    return
  }

  const finalStatus = deriveTriageStatus(statuses.map((s) => s.status))

  await tx.updateTable('triages').set({ status: finalStatus, ended_at: ts }).where('id', '=', run.triageId).execute()

  const triage = await tx
    .selectFrom('triages')
    .select(['started_at'])
    .where('id', '=', run.triageId)
    .executeTakeFirstOrThrow()

  // Conditional latest-started-wins UPSERT. Kysely's `onConflict` can't express
  // the `WHERE excluded.* > current.*` guard, so this is raw SQL (data-model
  // current_triages). The denormalized `triage_started_at` is what lets the
  // condition reference `excluded` without a join back to `triages`.
  await sql`
    INSERT INTO current_triages (message_id, pipeline_id, triage_id,
                                 triage_started_at, updated_at)
    VALUES (${run.messageId}, ${run.pipelineId}, ${run.triageId},
            ${triage.started_at}, ${ts})
    ON CONFLICT (message_id, pipeline_id) DO UPDATE SET
      triage_id          = excluded.triage_id,
      triage_started_at  = excluded.triage_started_at,
      updated_at         = excluded.updated_at
    WHERE excluded.triage_started_at > current_triages.triage_started_at
  `.execute(tx)
}

/**
 * Derives a settled Triage's status from its run statuses (data-model /
 * pipeline-runtime.md settlement table):
 *  - all `completed` → `completed`
 *  - any `failed` or `skipped` (with at least one terminal run) → `partial`
 *  - `failed` is reserved for loop-level errors and is NOT derived here; callers
 *    that hit a system-level loop error set it explicitly.
 *
 * Exported so the poll/execution loops and tests share the single source of the
 * mapping. Assumes all runs are terminal (the settlement check guarantees this).
 */
export function deriveTriageStatus(runStatuses: readonly string[]): 'completed' | 'partial' {
  const allCompleted = runStatuses.every((s) => s === 'completed')
  return allCompleted ? 'completed' : 'partial'
}

/**
 * Inserts one `triage_events` row, computing `sequence_num` as
 * `COALESCE(MAX(sequence_num),0)+1` for the Triage in a single statement — the
 * race-safe pattern the composite PK `(triage_id, sequence_num)` guards.
 */
async function insertTriageEvent(
  tx: Kysely<Database>,
  run: RunRef,
  event: TriageEventInput,
  ts: number,
): Promise<void> {
  await sql`
    INSERT INTO triage_events
      (triage_id, operator_id, sequence_num, event_type, details_json, recorded_at)
    SELECT ${run.triageId}, ${run.operatorId},
           COALESCE(MAX(sequence_num), 0) + 1,
           ${event.eventType}, ${event.detailsJson}, ${ts}
    FROM triage_events
    WHERE triage_id = ${run.triageId}
  `.execute(tx)
}

function now(): number {
  return Math.floor(Date.now() / 1000)
}
