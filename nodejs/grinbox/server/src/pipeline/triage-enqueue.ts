/**
 * Triage enqueue (S2). Per data-model "Triage enqueue" / pipeline-runtime.md
 * "Triage lifecycle → Creation": a single transaction INSERTs the `triages` row
 * (`running`, `started_at`), then one `triage_operator_runs` row per enabled
 * *message-triggered* Operator, snapshotting
 * `(type_key, type_code_version, op_config_json)`.
 *
 * ## Triage-creation recheck semantics
 *
 * Before snapshotting runs, a lightweight recheck confirms the Pipeline is still
 * structurally valid (pipeline-runtime.md "Contract validation lifecycle → At
 * Triage creation"). If invalid, the Triage is marked `failed` immediately with
 * NO runs inserted.
 *
 * The recheck uses {@link validatePipeline} (shared's declarative registry over
 * every declared type) — NOT the behavioral registry. Hard-invalid (unknown
 * `type_key`, config that no longer parses, output-key collision, dangling
 * input, or a cycle) fails the Triage: these are Pipeline-level breakages that
 * would mis-run or deadlock, so no runs are enqueued.
 *
 * ## Schedule-triggered Operators are not enqueued
 *
 * A schedule-triggered type (shared's `OPERATOR_TYPE_TRIGGERS`; today
 * `digest_delivery`) participates in Pipeline validation like any other
 * enabled Operator, but its runs are time-triggered by the digest scheduler —
 * not per-Message — so enqueue inserts no `triage_operator_runs` row for it.
 *
 * Enqueue does not consult the behavioral registry at all; runtime
 * dispatchability is the execution loop's concern (S7).
 */

import { isScheduledOperatorType, operatorTypeKeySchema } from '@grinbox/shared'
import { type Kysely, sql } from 'kysely'
import type { Database } from '../db/schema.js'
import { type OperatorForValidation, validatePipeline } from './validation.js'

export interface EnqueueTriageInput {
  readonly messageId: number
  readonly pipelineId: number
  readonly triggeredBy:
    'message_arrival' | 'user_replay' | 'user_reset_and_replay' | 'pipeline_changed' | 'scheduled_replay'
  readonly actorUserId: number | null
}

export interface EnqueueTriageResult {
  readonly triageId: number
  /** `running` (runs enqueued), `completed` (settled at creation — the
   * Pipeline has no per-Message Operators to run), or `failed` (recheck
   * rejected the Pipeline). */
  readonly status: 'running' | 'completed' | 'failed'
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

    // Schedule-triggered types (digest_delivery) validate with the Pipeline
    // above but never run per-Message — the digest scheduler drives them.
    const messageTriggeredOps = enabledOps.filter((o) => {
      const parsed = operatorTypeKeySchema.safeParse(o.type_key)
      return parsed.success ? !isScheduledOperatorType(parsed.data) : true
    })

    // With no per-Message runs to dispatch (a digest-only or empty Pipeline),
    // the Triage settles at creation: there is no worker completion to run the
    // settlement check, so leaving it `running` would strand it forever. An
    // all-zero run set is trivially `completed`; `current_triages` gets the
    // standard latest-started-wins UPSERT so the Inbox reflects the (empty)
    // Tag state of this Triage.
    const noRuns = messageTriggeredOps.length === 0

    const triage = await tx
      .insertInto('triages')
      .values({
        message_id: input.messageId,
        pipeline_id: input.pipelineId,
        triggered_by: input.triggeredBy,
        actor_user_id: input.actorUserId,
        started_at: ts,
        ended_at: noRuns ? ts : null,
        status: noRuns ? 'completed' : 'running',
        error_summary: null,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    if (noRuns) {
      await sql`
        INSERT INTO current_triages (message_id, pipeline_id, triage_id,
                                     triage_started_at, updated_at)
        VALUES (${input.messageId}, ${input.pipelineId}, ${triage.id},
                ${ts}, ${ts})
        ON CONFLICT (message_id, pipeline_id) DO UPDATE SET
          triage_id          = excluded.triage_id,
          triage_started_at  = excluded.triage_started_at,
          updated_at         = excluded.updated_at
        WHERE excluded.triage_started_at > current_triages.triage_started_at
      `.execute(tx)
      return { triageId: triage.id, status: 'completed' }
    }

    if (messageTriggeredOps.length > 0) {
      await tx
        .insertInto('triage_operator_runs')
        .values(
          messageTriggeredOps.map((o) => ({
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
