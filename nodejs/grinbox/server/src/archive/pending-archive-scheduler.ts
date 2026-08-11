/**
 * The pending-Archive sweep: the third scheduler the daemon's one heartbeat
 * wakes (d-gzv0jty7). Each beat it takes the standing pending Archives whose
 * moment has passed and works the case table of d-41v9yqvh, in that order:
 *
 *  - its Pipeline, Account, or Operator is deleted → `abandoned`; nothing is
 *    called and what was recorded stays readable
 *  - its Pipeline is not active on the Account → nothing performs and the row
 *    stays `pending`, so it fires late if the Pipeline returns
 *  - the Message has already left the inbox → `already_departed`; the mailbox is
 *    untouched and the outcome records on the run that recorded it
 *  - a Limit denies the call → the row stays `pending` and the next beat retries
 *  - the call fails past its operation's retries → `failed` on that run; the
 *    retry is a re-triage (d-0tebpjex)
 *  - otherwise → `archived`, recorded on the run that recorded it
 *
 * "Already left the inbox" is judged from grinbox's own `source_state`, never a
 * fresh backend read (d-hgqlouvn): where that record is stale the call is made
 * and the backend answers it as the no-op it is.
 *
 * A Limit denial is recorded once, on the first beat that meets it (d-6a4p1edu)
 * — a row that stays due across a long window would otherwise append one event
 * per beat for the life of the window.
 *
 * The sweep shares the in-flight guard shape of the other two schedulers: a beat
 * arriving while a previous sweep is still working is a no-op, so one due row is
 * never worked twice concurrently.
 */

import type { Config } from '../config.js'
import type { DB } from '../db/schema.js'
import { type RunRef, appendTriageEvents } from '../pipeline/persist.js'
import type { TriageEventInput } from '../pipeline/triage-event.js'
import { createResourceClientFactory } from '../resources/make-resource-client.js'
import type { MakeUnderlyingClients } from '../resources/underlying-clients.js'
import { pendingArchiveSkippedEvent, settlePendingArchive } from './pending-archive.js'

export interface PendingArchiveSchedulerDeps {
  readonly db: DB
  readonly config: Config
  readonly makeClients: MakeUnderlyingClients
}

/** What one due pending Archive did on this beat. */
export interface PendingArchiveSweepSummary {
  readonly pendingArchiveId: number
  readonly messageId: number
  readonly triageId: number
  readonly operatorId: number
  /** The case of d-41v9yqvh this row met. `deferred` is a Limit denial or an
   * inactive Pipeline — the row still stands. */
  readonly outcome: 'archived' | 'already_departed' | 'failed' | 'abandoned' | 'deferred'
}

export interface PendingArchiveScheduler {
  /**
   * Work every pending Archive due as of `now` (Unix seconds; defaults to the
   * wall clock). Guarded: a call made while a previous sweep is in flight is a
   * no-op returning `[]`. One row's failure is recorded on its own run and does
   * not abort the others.
   */
  runDuePendingArchives(now?: number): Promise<PendingArchiveSweepSummary[]>
  /** Await any in-flight sweep's DB writes, so shutdown can close the
   * connection under it. Idempotent. */
  drain(): Promise<void>
}

/** A due row joined to everything the case table turns on. */
interface DueRow {
  readonly id: number
  readonly message_id: number
  readonly triage_id: number
  readonly operator_id: number
  readonly pipeline_id: number
  readonly user_id: number
  readonly account_id: number
  readonly backend_message_id: string
  readonly source_state: string
  readonly account_deleted_at: number | null
  readonly active_pipeline_id: number | null
  readonly pipeline_deleted_at: number | null
  readonly operator_deleted_at: number | null
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

export function createPendingArchiveScheduler(deps: PendingArchiveSchedulerDeps): PendingArchiveScheduler {
  const { db, config, makeClients } = deps
  let inFlight: Promise<PendingArchiveSweepSummary[]> | null = null

  async function selectDue(now: number): Promise<DueRow[]> {
    return db
      .selectFrom('pending_archives as pa')
      .innerJoin('messages as m', 'm.id', 'pa.message_id')
      .innerJoin('accounts as a', 'a.id', 'm.account_id')
      .innerJoin('triages as t', 't.id', 'pa.triage_id')
      .innerJoin('pipelines as p', 'p.id', 't.pipeline_id')
      .leftJoin('operators as o', 'o.id', 'pa.operator_id')
      .select([
        'pa.id as id',
        'pa.message_id as message_id',
        'pa.triage_id as triage_id',
        'pa.operator_id as operator_id',
        'p.id as pipeline_id',
        'p.user_id as user_id',
        'a.id as account_id',
        'm.backend_message_id as backend_message_id',
        'm.source_state as source_state',
        'a.deleted_at as account_deleted_at',
        'a.active_pipeline_id as active_pipeline_id',
        'p.deleted_at as pipeline_deleted_at',
        'o.deleted_at as operator_deleted_at',
      ])
      .where('pa.status', '=', 'pending')
      .where('pa.due_at', '<=', now)
      .orderBy('pa.due_at', 'asc')
      .orderBy('pa.id', 'asc')
      .execute()
  }

  function refOf(row: DueRow): RunRef {
    return {
      triageId: row.triage_id,
      operatorId: row.operator_id,
      messageId: row.message_id,
      pipelineId: row.pipeline_id,
    }
  }

  /** Whether this run already carries a Limit denial from an earlier beat. */
  async function alreadyRecordedDenial(row: DueRow): Promise<boolean> {
    const existing = await db
      .selectFrom('triage_events')
      .select('sequence_num')
      .where('triage_id', '=', row.triage_id)
      .where('operator_id', '=', row.operator_id)
      .where('event_type', '=', 'resource_op_limited')
      .limit(1)
      .executeTakeFirst()
    return existing !== undefined
  }

  async function workOne(row: DueRow, now: number): Promise<PendingArchiveSweepSummary> {
    const base = {
      pendingArchiveId: row.id,
      messageId: row.message_id,
      triageId: row.triage_id,
      operatorId: row.operator_id,
    }

    // 1. Deleted configuration never performs (d-s2kf8vjq).
    if (row.pipeline_deleted_at !== null || row.account_deleted_at !== null || row.operator_deleted_at !== null) {
      await appendTriageEvents(db, refOf(row), [pendingArchiveSkippedEvent('abandoned')])
      await settlePendingArchive(db, row.id, 'abandoned', now)
      return { ...base, outcome: 'abandoned' }
    }

    // 2. The Pipeline is not active on the Account: nothing performs, and the
    //    row stays due so it fires late if the Pipeline returns.
    if (row.active_pipeline_id !== row.pipeline_id) {
      return { ...base, outcome: 'deferred' }
    }

    // 3. The Message has already left the inbox: the mailbox is untouched.
    if (row.source_state !== 'present') {
      await appendTriageEvents(db, refOf(row), [pendingArchiveSkippedEvent('already_departed')])
      await settlePendingArchive(db, row.id, 'already_departed', now)
      return { ...base, outcome: 'already_departed' }
    }

    // 4-6. Make the call through the metered client, so the Limit check, the
    //      operation's retry policy, and the event vocabulary are the ones the
    //      immediate archive already goes through.
    const events: TriageEventInput[] = []
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
    }, config.operatorTimeoutMs)

    let outcome: PendingArchiveSweepSummary['outcome']
    try {
      const makeResourceClient = createResourceClientFactory({
        db,
        userId: row.user_id,
        messageId: row.message_id,
        operatorId: row.operator_id,
        triageId: row.triage_id,
        signal: controller.signal,
        onEvent: (event) => {
          events.push({ eventType: event.event_type, detailsJson: JSON.stringify(event.details) })
        },
        onUsage: () => undefined,
        clients: makeClients({ accountId: row.account_id, notifyCredentialsId: null }),
      })
      const mailbox = makeResourceClient('mailbox', ['archive'])
      const result = await mailbox.archive({ backendMessageId: row.backend_message_id })

      switch (result.outcome) {
        case 'succeeded':
          await settlePendingArchive(db, row.id, 'archived', now)
          outcome = 'archived'
          break
        case 'skipped_by_limit':
          // Stays due; the next beat tries again (d-j8wm2qfx). The denial is
          // recorded once (d-6a4p1edu).
          if (await alreadyRecordedDenial(row)) {
            events.length = 0
          }
          outcome = 'deferred'
          break
        case 'failed':
          await settlePendingArchive(db, row.id, 'failed', now)
          outcome = 'failed'
          break
      }
    } finally {
      clearTimeout(timer)
    }

    await appendTriageEvents(db, refOf(row), events)
    return { ...base, outcome }
  }

  async function runSweep(now: number): Promise<PendingArchiveSweepSummary[]> {
    const rows = await selectDue(now)
    const summaries: PendingArchiveSweepSummary[] = []
    for (const row of rows) {
      try {
        summaries.push(await workOne(row, now))
      } catch (err) {
        console.error(`[grinbox][pending-archive] id=${row.id} message=${row.message_id} sweep error`, err)
      }
    }
    return summaries
  }

  function runDuePendingArchives(now: number = nowSeconds()): Promise<PendingArchiveSweepSummary[]> {
    if (inFlight !== null) {
      return Promise.resolve([])
    }
    const sweep = runSweep(now)
    inFlight = sweep
    void sweep.finally(() => {
      if (inFlight === sweep) {
        inFlight = null
      }
    })
    return sweep
  }

  async function drain(): Promise<void> {
    if (inFlight !== null) {
      await inFlight.catch(() => undefined)
    }
  }

  return { runDuePendingArchives, drain }
}
