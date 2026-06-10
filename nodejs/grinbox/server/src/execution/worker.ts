/**
 * Execution-loop worker (pipeline-runtime.md "Worker pool" → `workerRun` /
 * `buildContext`). Given a *claimed* `triage_operator_runs` row (already flipped
 * to `running`), it:
 *
 *  1. Loads the `MessageView` from the run's denormalized `message_id`.
 *  2. Loads the Triage's in-scope Tags as a `ReadonlyMap` (the inputs an
 *     Operator reads).
 *  3. Resolves the `user_id` (message → account → user) for the Limit scope.
 *  4. Creates an AbortController + timer (`config.operatorTimeoutMs`) — Layer 2
 *     of timeout enforcement; the signal flows into every metered client.
 *  5. Builds the {@link createResourceClientFactory} factory closing over the
 *     event/usage accumulators, runs the Operator via {@link runOperator}, and
 *     persists the outcome via {@link persistOperatorResult}.
 *
 * On success it persists `completed` with the produced Tags + accumulated
 * events/usage; on a throw it persists `failed`, distinguishing an Operator
 * timeout (the abort fired) from any other error in the `error_summary`. The
 * underlying Resource transports (`bedrock`/`gmail`/`pushover`) are *injected*
 * so production wires real ones and tests pass fakes — the worker never
 * constructs SDK clients.
 */

import type { Config } from '../config.js'
import type { DB, MessagesTable } from '../db/schema.js'
import { runOperator } from '../operators/run.js'
import { messageViewFromRow } from '../operators/types.js'
import { type OutputTag, type RunRef, type TriageEventInput, persistOperatorResult } from '../pipeline/persist.js'
import { type ResourceEvent, type UsageDelta, createResourceClientFactory } from '../resources/make-resource-client.js'
import type { MakeUnderlyingClients } from '../resources/underlying-clients.js'

/** The reason carried on the AbortSignal when the Operator timer fires. */
export const OPERATOR_TIMEOUT_REASON = 'operator_timeout'

/** The subset of a `triage_operator_runs` row the worker needs. */
export interface WorkerRunRow {
  readonly triage_id: number
  readonly operator_id: number
  readonly message_id: number
  readonly type_key: string
  readonly type_code_version: string
  readonly op_config_json: string
}

/**
 * Run one claimed Operator run end-to-end and persist its outcome. Never
 * throws: any failure (resolution, config parse, Operator throw, timeout) is
 * captured and persisted as a `failed` run so the Triage can still settle.
 */
export async function runWorker(
  db: DB,
  run: WorkerRunRow,
  makeClients: MakeUnderlyingClients,
  config: Config,
): Promise<void> {
  const startedMs = Date.now()
  const events: ResourceEvent[] = []
  const usage: Record<string, Record<string, number>> = {}

  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(OPERATOR_TIMEOUT_REASON)
  }, config.operatorTimeoutMs)

  try {
    const { message, tags, userId, accountId, pipelineId } = await loadContext(db, run)

    // Per-run underlying Action clients: gmail auth keyed on the Message's
    // Account, pushover auth on the Notify Operator's referenced credential
    // (`null` for non-Notify runs → pushover "not configured").
    const clients = makeClients({
      accountId,
      notifyCredentialsId: notifyCredentialsId(run),
    })

    const makeResourceClient = createResourceClientFactory({
      db,
      userId,
      messageId: run.message_id,
      operatorId: run.operator_id,
      triageId: run.triage_id,
      signal: controller.signal,
      onEvent: (event) => events.push(event),
      onUsage: (resourceOp, delta) => {
        mergeUsage(usage, resourceOp, delta)
      },
      clients,
    })

    const result = await runOperator(
      {
        type_key: run.type_key,
        type_code_version: run.type_code_version,
        op_config_json: run.op_config_json,
      },
      {
        message,
        tags,
        makeResourceClient,
        signal: controller.signal,
      },
    )

    const outputTags: OutputTag[] = result.tags.map((t) => ({
      key: t.key,
      value: t.value,
    }))

    await persistOperatorResult(db, ref(run, pipelineId), 'completed', {
      tags: outputTags,
      events: toTriageEvents(events),
      usage: usageOrNull(usage),
      errorSummary: null,
      durationMs: Date.now() - startedMs,
    })
  } catch (err) {
    const errorSummary =
      controller.signal.aborted ? `operator timed out after ${config.operatorTimeoutMs}ms`
      : err instanceof Error ? err.message
      : String(err)

    // The pipeline_id is needed for settlement's current_triages UPSERT; resolve
    // it independently of the (possibly failed) context load above.
    const pipelineId = await resolvePipelineId(db, run.triage_id)

    await persistOperatorResult(db, ref(run, pipelineId), 'failed', {
      tags: [],
      events: toTriageEvents(events),
      usage: usageOrNull(usage),
      errorSummary,
      durationMs: Date.now() - startedMs,
    })
  } finally {
    clearTimeout(timer)
  }
}

interface WorkerContext {
  readonly message: ReturnType<typeof messageViewFromRow>
  readonly tags: ReadonlyMap<string, string>
  readonly userId: number
  /** The Message's Account id — keys the per-run gmail credential resolution. */
  readonly accountId: number
  readonly pipelineId: number
}

/**
 * Derive the Pushover `credentials_id` a Notify run's config references, used to
 * resolve the per-run Pushover client. Returns `null` for any non-Notify run, or
 * when the config can't be parsed (the worker will fail the run on its own
 * resolution path; a `null` here just means "no Pushover credential to wire").
 */
function notifyCredentialsId(run: WorkerRunRow): number | null {
  if (run.type_key !== 'notify') {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(run.op_config_json)
    if (parsed && typeof parsed === 'object') {
      const id = (parsed as { credentials_id?: unknown }).credentials_id
      if (typeof id === 'number') {
        return id
      }
    }
  } catch {
    // Malformed config: the Operator's own config-parse will fail the run.
  }
  return null
}

/** Load the Message view, in-scope Tags, user id (Limit scope), pipeline id. */
async function loadContext(db: DB, run: WorkerRunRow): Promise<WorkerContext> {
  const messageRow = await db
    .selectFrom('messages')
    .selectAll()
    .where('id', '=', run.message_id)
    .executeTakeFirstOrThrow()

  // user_id for the Limit scope: message → account → user.
  const account = await db
    .selectFrom('accounts')
    .select(['user_id'])
    .where('id', '=', messageRow.account_id)
    .executeTakeFirstOrThrow()

  const pipeline = await resolvePipelineId(db, run.triage_id)

  const tagRows = await db.selectFrom('tags').select(['key', 'value']).where('triage_id', '=', run.triage_id).execute()
  const tags = new Map<string, string>()
  for (const t of tagRows) {
    tags.set(t.key, t.value)
  }

  return {
    // `messageViewFromRow` is typed against the insert-side `MessagesTable`
    // (id is `Generated`); a SELECT-all row is the resolved {@link Selectable}
    // form (id is `number`). The function only reads fields, so the resolved
    // row is structurally compatible — bridge the Generated/number mismatch.
    message: messageViewFromRow(messageRow as unknown as MessagesTable),
    tags,
    userId: account.user_id,
    accountId: messageRow.account_id,
    pipelineId: pipeline,
  }
}

async function resolvePipelineId(db: DB, triageId: number): Promise<number> {
  const triage = await db
    .selectFrom('triages')
    .select(['pipeline_id'])
    .where('id', '=', triageId)
    .executeTakeFirstOrThrow()
  return triage.pipeline_id
}

function ref(run: WorkerRunRow, pipelineId: number): RunRef {
  return {
    triageId: run.triage_id,
    operatorId: run.operator_id,
    messageId: run.message_id,
    pipelineId,
  }
}

/**
 * Merge a {@link UsageDelta} into the accumulating usage map, keyed by
 * `"<resource>.<operation>"`, summing each numeric counter (data-model
 * `resource_usage_json`).
 */
function mergeUsage(usage: Record<string, Record<string, number>>, resourceOp: string, delta: UsageDelta): void {
  const bucket = usage[resourceOp] ?? {}
  for (const [k, v] of Object.entries(delta)) {
    if (typeof v === 'number') {
      bucket[k] = (bucket[k] ?? 0) + v
    }
  }
  usage[resourceOp] = bucket
}

function usageOrNull(usage: Record<string, Record<string, number>>): Record<string, unknown> | null {
  return Object.keys(usage).length > 0 ? usage : null
}

/** Map accumulated {@link ResourceEvent}s into `persistOperatorResult` inputs. */
function toTriageEvents(events: readonly ResourceEvent[]): TriageEventInput[] {
  return events.map((e) => ({
    eventType: e.event_type,
    detailsJson: JSON.stringify(e.details),
  }))
}
