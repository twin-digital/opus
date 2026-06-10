/**
 * Triage enqueue (S2). Per data-model "Triage enqueue" / pipeline-runtime.md
 * "Triage lifecycle → Creation": a single transaction INSERTs the `triages` row
 * (`running`, `started_at`), then one `triage_operator_runs` row per *enabled*
 * Operator, snapshotting `(type_key, type_code_version, op_config_json)`.
 *
 * ## Triage-creation recheck semantics
 *
 * Before snapshotting runs, a lightweight recheck confirms the Pipeline is still
 * structurally valid (pipeline-runtime.md "Contract validation lifecycle → At
 * Triage creation"). If invalid, the Triage is marked `failed` immediately with
 * NO runs inserted.
 *
 * The recheck uses {@link validatePipeline} (shared's declarative registry over
 * all five types) — NOT the behavioral registry. The chosen semantics:
 *
 *  - **Hard-invalid → fail the Triage**: unknown `type_key`, config that no
 *    longer parses, output-key collision, dangling input, or a cycle. These are
 *    Pipeline-level breakages that would mis-run or deadlock; no runs are
 *    enqueued.
 *  - **Declared-but-not-yet-runnable type → still enqueue**: a type that
 *    validates structurally but whose behavioral `run` hasn't landed (e.g.
 *    `digest_delivery`) is intentionally allowed to enqueue. Its run row is
 *    snapshotted with the Operator's stored `type_code_version`; the runtime
 *    runnability check happens later in the execution loop (via the behavioral
 *    `resolveSnapshot`), where such a run fails individually and downstream
 *    cascades to `skipped` — exactly the per-Operator failure path, not a
 *    whole-Pipeline failure. This matches the data-model note that a
 *    declared-but-not-runnable type "is allowed to exist; it would just fail at
 *    execution later."
 *
 * Enqueue therefore does not consult the behavioral registry at all; the
 * not-runnable distinction is deferred to the execution loop (S7).
 */

import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { type OperatorForValidation, validatePipeline } from './validation.js'

export interface EnqueueTriageInput {
  readonly messageId: number
  readonly pipelineId: number
  readonly triggeredBy:
    | 'message_arrival'
    | 'user_replay'
    | 'user_reset_and_replay'
    | 'pipeline_changed'
    | 'scheduled_replay'
  readonly actorUserId: number | null
}

export interface EnqueueTriageResult {
  readonly triageId: number
  /** `running` (runs enqueued) or `failed` (recheck rejected the Pipeline). */
  readonly status: 'running' | 'failed'
}

function now(): number {
  return Math.floor(Date.now() / 1000)
}

/**
 * Enqueues a Triage for `messageId` under `pipelineId`. Returns the new Triage
 * id and whether it was enqueued (`running`) or immediately `failed` by the
 * recheck. Runs in a single transaction.
 */
export async function enqueueTriage(db: Kysely<Database>, input: EnqueueTriageInput): Promise<EnqueueTriageResult> {
  return db.transaction().execute(async (tx) => {
    const ts = now()

    const enabledOps = await tx
      .selectFrom('operators')
      .select(['id', 'type_key', 'type_code_version', 'config_json'])
      .where('pipeline_id', '=', input.pipelineId)
      .where('enabled', '=', 1)
      .where('deleted_at', 'is', null)
      .execute()

    const forValidation: OperatorForValidation[] = enabledOps.map((o) => ({
      operator_id: o.id,
      type_key: o.type_key,
      config_json: o.config_json,
    }))
    const validation = validatePipeline(forValidation)

    if (!validation.ok) {
      // Recheck failed: record a failed Triage with no runs.
      const summary = validation.errors.map((e) => e.message).join('; ')
      const failed = await tx
        .insertInto('triages')
        .values({
          message_id: input.messageId,
          pipeline_id: input.pipelineId,
          triggered_by: input.triggeredBy,
          actor_user_id: input.actorUserId,
          started_at: ts,
          ended_at: ts,
          status: 'failed',
          error_summary: `Pipeline invalid at Triage creation: ${summary}`,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      return { triageId: failed.id, status: 'failed' }
    }

    const triage = await tx
      .insertInto('triages')
      .values({
        message_id: input.messageId,
        pipeline_id: input.pipelineId,
        triggered_by: input.triggeredBy,
        actor_user_id: input.actorUserId,
        started_at: ts,
        ended_at: null,
        status: 'running',
        error_summary: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    if (enabledOps.length > 0) {
      await tx
        .insertInto('triage_operator_runs')
        .values(
          enabledOps.map((o) => ({
            triage_id: triage.id,
            operator_id: o.id,
            message_id: input.messageId,
            type_key: o.type_key,
            type_code_version: o.type_code_version,
            op_config_json: o.config_json,
            status: 'pending' as const,
            started_at: null,
            finished_at: null,
            duration_ms: null,
            skip_reason: null,
            error_summary: null,
            resource_usage_json: null,
            created_at: ts,
          })),
        )
        .execute()
    }

    return { triageId: triage.id, status: 'running' }
  })
}
