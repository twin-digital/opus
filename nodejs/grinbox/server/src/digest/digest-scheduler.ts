/**
 * The digest scheduler: the Daemon loop that fires Digest delivery Operators
 * on their cron schedules. Structure mirrors the poll scheduler — the daemon's
 * one heartbeat (d-gzv0jty7) calls `runDueDigests`, an in-flight guard keeps a
 * slow cycle from being overlapped, and tests drive `runDueDigests(now?)`
 * directly.
 *
 * ## Firing model
 *
 * A digest fires per `(Operator, Account)`: each enabled `digest_delivery`
 * Operator, joined with each non-deleted Account whose `active_pipeline_id` is
 * the Operator's Pipeline. Each fire covers that Account's Messages and sends
 * through that Account to its own address; a Pipeline active on several
 * Accounts digests each mailbox separately.
 *
 * ## Occurrence claim (no double-send)
 *
 * Per beat, each pair resolves the most recent cron occurrence `<= now` that
 * is strictly after its last *attempted* occurrence ({@link latestDueOccurrence};
 * the floor for a first-ever run is the Operator's `created_at`). The fire is
 * claimed by INSERTing the `digest_runs` row (`status='running'`) — the UNIQUE
 * `(operator_id, account_id, scheduled_for)` index makes the INSERT the atomic
 * claim, so racing ticks (or a restart racing a stale in-flight cycle) can
 * fire an occurrence at most once. `ON CONFLICT DO NOTHING` + no returned row
 * = someone else claimed it.
 *
 * Missed occurrences (Daemon down over one or more scheduled times) collapse
 * into that single latest occurrence — fired once on the next beat — and any
 * older missed ones are never fired. Their coverage isn't lost: the coverage
 * window starts at the last *completed* run's `covers_to` (else the Operator's
 * `created_at`), so the catch-up run covers the whole gap, and a failed run —
 * which does not advance that watermark — is likewise absorbed into the next
 * occurrence's window ("covers the union").
 *
 * An Operator whose stored config no longer parses (or whose schedule croner
 * rejects) is skipped with a log line; save-time validation makes this an
 * edge, not a path.
 */

import { operatorConfigSchemas } from '@grinbox/shared'
import type { Config } from '../config.js'
import type { DB } from '../db/schema.js'
import type { MakeUnderlyingClients } from '../resources/underlying-clients.js'
import { type DigestRunOutcome, executeDigestRun } from './digest-runner.js'
import { latestDueOccurrence, validateDigestSchedule } from './schedule.js'

export interface DigestSchedulerDeps {
  readonly db: DB
  readonly config: Config
  readonly makeClients: MakeUnderlyingClients
}

/** Summary of one fired digest occurrence (returned for tests/logging). */
export interface DigestFireSummary {
  readonly operatorId: number
  readonly accountId: number
  readonly scheduledFor: number
  readonly outcome: DigestRunOutcome
}

export interface DigestScheduler {
  /**
   * Fire every digest occurrence due as of `now` (Unix seconds; defaults to
   * the wall clock). Guarded: a call while a previous cycle is in flight is a
   * no-op returning `[]`. One pair's failure is recorded on its run row and
   * does not abort the others.
   */
  runDueDigests(now?: number): Promise<DigestFireSummary[]>
  /** Await any in-flight cycle's DB writes, so shutdown can close the
   * connection under it. Idempotent. */
  drain(): Promise<void>
}

/** The digest Operator × Account pairs eligible for scheduling. */
interface EligiblePair {
  readonly operator_id: number
  readonly operator_name: string
  readonly config_json: string
  readonly operator_created_at: number
  readonly pipeline_id: number
  readonly user_id: number
  readonly account_id: number
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

export function createDigestScheduler(deps: DigestSchedulerDeps): DigestScheduler {
  const { db, config, makeClients } = deps
  let inFlight: Promise<DigestFireSummary[]> | null = null

  async function selectEligiblePairs(): Promise<EligiblePair[]> {
    return db
      .selectFrom('operators')
      .innerJoin('pipelines', 'pipelines.id', 'operators.pipeline_id')
      .innerJoin('accounts', 'accounts.active_pipeline_id', 'pipelines.id')
      .select([
        'operators.id as operator_id',
        'operators.name as operator_name',
        'operators.config_json as config_json',
        'operators.created_at as operator_created_at',
        'operators.pipeline_id as pipeline_id',
        'pipelines.user_id as user_id',
        'accounts.id as account_id',
      ])
      .where('operators.type_key', '=', 'digest_delivery')
      .where('operators.enabled', '=', 1)
      .where('operators.deleted_at', 'is', null)
      .where('pipelines.deleted_at', 'is', null)
      .where('accounts.deleted_at', 'is', null)
      .execute()
  }

  /**
   * Fire one pair's due occurrence, if any: resolve due time, resolve the
   * coverage watermark, claim, run. Returns `null` when nothing was due or the
   * claim was lost.
   */
  async function fireIfDue(pair: EligiblePair, now: number): Promise<DigestFireSummary | null> {
    const parsed = operatorConfigSchemas.digest_delivery.safeParse(safeJsonParse(pair.config_json))
    if (!parsed.success) {
      console.warn(`[grinbox][digest] operator=${pair.operator_id} config no longer parses; skipping`)
      return null
    }
    const cfg = parsed.data

    // Surface a croner-rejected schedule/timezone as an actionable warning
    // rather than letting the occurrence math silently return "nothing due".
    const scheduleError = validateDigestSchedule(cfg.schedule, cfg.timezone)
    if (scheduleError !== null) {
      console.warn(
        `[grinbox][digest] operator=${pair.operator_id} schedule/timezone rejected by croner (${scheduleError}); skipping`,
      )
      return null
    }

    const lastAttempt = await db
      .selectFrom('digest_runs')
      .select(({ fn }) => fn.max('scheduled_for').as('m'))
      .where('operator_id', '=', pair.operator_id)
      .where('account_id', '=', pair.account_id)
      .executeTakeFirst()

    const due = latestDueOccurrence({
      schedule: cfg.schedule,
      timezone: cfg.timezone,
      after: lastAttempt?.m ?? pair.operator_created_at,
      now,
    })
    if (due === null) {
      return null
    }

    // Watermark: the latest completed run's coverage end; a first-ever digest
    // covers from the Operator's creation (not the Account's whole history).
    const watermark = await db
      .selectFrom('digest_runs')
      .select(['covers_to'])
      .where('operator_id', '=', pair.operator_id)
      .where('account_id', '=', pair.account_id)
      .where('status', '=', 'completed')
      .orderBy('covers_to', 'desc')
      .limit(1)
      .executeTakeFirst()
    const coversFrom = watermark?.covers_to ?? pair.operator_created_at

    // The claim: INSERT the occurrence row; a conflict means another cycle
    // already attempted this occurrence — never fire it again.
    const claimed = await db
      .insertInto('digest_runs')
      .values({
        operator_id: pair.operator_id,
        account_id: pair.account_id,
        scheduled_for: due,
        covers_from: coversFrom,
        covers_to: now,
        op_config_json: pair.config_json,
        status: 'running',
        started_at: now,
        finished_at: null,
        message_count: null,
        error_summary: null,
        resource_usage_json: null,
        events_json: null,
      })
      .onConflict((oc) => oc.columns(['operator_id', 'account_id', 'scheduled_for']).doNothing())
      .returning('id')
      .executeTakeFirst()
    if (!claimed) {
      return null
    }

    const outcome = await executeDigestRun(
      { db, makeClients, timeoutMs: config.digestTimeoutMs },
      {
        runId: claimed.id,
        operatorId: pair.operator_id,
        operatorName: pair.operator_name,
        accountId: pair.account_id,
        pipelineId: pair.pipeline_id,
        userId: pair.user_id,
        config: cfg,
        coversFrom,
        coversTo: now,
      },
    )
    return {
      operatorId: pair.operator_id,
      accountId: pair.account_id,
      scheduledFor: due,
      outcome,
    }
  }

  async function runCycle(now: number): Promise<DigestFireSummary[]> {
    const pairs = await selectEligiblePairs()
    const summaries: DigestFireSummary[] = []
    for (const pair of pairs) {
      try {
        const fired = await fireIfDue(pair, now)
        if (fired !== null) {
          summaries.push(fired)
          if (fired.outcome.status === 'failed') {
            console.error(
              `[grinbox][digest] operator=${pair.operator_id} account=${pair.account_id} run failed: ${fired.outcome.errorSummary}`,
            )
          }
        }
      } catch (err) {
        console.error(`[grinbox][digest] operator=${pair.operator_id} account=${pair.account_id} cycle error`, err)
      }
    }
    return summaries
  }

  function runDueDigests(now: number = nowSeconds()): Promise<DigestFireSummary[]> {
    if (inFlight !== null) {
      return Promise.resolve([])
    }
    const cycle = runCycle(now)
    inFlight = cycle
    void cycle.finally(() => {
      if (inFlight === cycle) {
        inFlight = null
      }
    })
    return cycle
  }

  async function drain(): Promise<void> {
    // Let an in-flight cycle finish its DB writes before the daemon closes the
    // connection. Failures were already handled inside the cycle.
    if (inFlight !== null) {
      await inFlight.catch(() => undefined)
    }
  }

  return { runDueDigests, drain }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}
