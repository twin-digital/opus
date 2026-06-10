/**
 * The execution loop (pipeline-runtime.md "Execution loop" + "Worker pool").
 * Pulls ready `triage_operator_runs` rows FIFO, classifies their inputs, claims
 * the satisfied ones, dispatches each to a worker (bounded by the pool size),
 * and cascade-skips the definitively-missing ones. Coordination is entirely
 * through the State DB — no per-Triage state outlives a worker.
 *
 * ## Tick-based design (test-friendly)
 *
 * The loop body is a single `tick()` that does one pass and returns the number
 * of runs it dispatched. `start()` schedules `tick()` on an interval (the
 * documented 150ms idle sleep); `stop()` halts scheduling and *awaits in-flight
 * workers* (the shutdown drain). `runUntilIdle()` drives `tick()` until no
 * `pending`/`running` runs remain — tests use it to run a Triage to settlement
 * deterministically, with no timers and no risk of a spinning process.
 */

import type { Config } from '../config.js'
import type { DB } from '../db/schema.js'
import type { OperatorSnapshot } from '../operators/run.js'
import { claimOperatorRun } from '../pipeline/claim.js'
import { markSkipped } from '../pipeline/persist.js'
import type { MakeUnderlyingClients } from '../resources/underlying-clients.js'
import { classifyInputs } from './classify-inputs.js'
import type { ClassifyRun, RunStatus } from './classify-inputs.js'
import { type SnapshotContract, resolveSnapshotContract } from './resolve-contract.js'
import { type WorkerRunRow, runWorker } from './worker.js'

/** How long the loop sleeps when a tick dispatched nothing (ms). */
const IDLE_SLEEP_MS = 150

/** How many candidate `pending` rows a single tick fetches. */
const CANDIDATE_LIMIT = 50

export interface ExecutionLoopDeps {
  readonly db: DB
  readonly config: Config
  /**
   * Per-run builder of the underlying Resource transports (real in prod, fakes
   * in tests). The worker calls it once per run with the run's context (the
   * Message's Account, the Notify Operator's referenced credential) so the
   * credential-backed Action clients can resolve per-run auth.
   */
  readonly makeClients: MakeUnderlyingClients
  /**
   * Snapshot → declared input/output Tag keys, for input classification.
   * Defaults to {@link resolveSnapshotContract} over the code-resident registry;
   * production always uses the default. Injectable only so tests can exercise
   * cross-Operator dependency-ordering and cascade shapes with synthetic
   * Contracts that would be awkward to express through real config. Mirrors
   * `runOperator`'s injectable `resolve`.
   */
  readonly resolveContract?: (snapshot: OperatorSnapshot) => SnapshotContract
}

export interface ExecutionLoop {
  /** One loop pass: dispatch ready runs (bounded by free pool slots), skip
   * definitively-missing ones. Returns the number dispatched. */
  tick(): Promise<number>
  /** Tick until no `pending`/`running` runs remain. For tests + the recovery
   * resume; never spins on timers. */
  runUntilIdle(): Promise<void>
  /** Begin scheduling `tick()` on an interval (150ms idle sleep). */
  start(): void
  /** Halt scheduling and await all in-flight workers (the shutdown drain). */
  stop(): Promise<void>
}

/**
 * The `triage_operator_runs` columns the loop reads per candidate. Snapshot
 * columns drive contract resolution; `status` drives sibling classification.
 */
interface CandidateRow {
  readonly triage_id: number
  readonly operator_id: number
  readonly message_id: number
  readonly type_key: string
  readonly type_code_version: string
  readonly op_config_json: string
  readonly status: RunStatus
}

export function createExecutionLoop(deps: ExecutionLoopDeps): ExecutionLoop {
  const { db, config, makeClients } = deps
  const resolveContract = deps.resolveContract ?? resolveSnapshotContract
  const poolSize = config.workerPoolSize

  /** In-flight worker promises, keyed by `"<triage>:<operator>"`. */
  const inFlight = new Map<string, Promise<void>>()
  let running = false
  let scheduled: ReturnType<typeof setTimeout> | null = null

  function availableSlots(): number {
    return poolSize - inFlight.size
  }

  function dispatch(run: WorkerRunRow): void {
    const key = `${run.triage_id}:${run.operator_id}`
    const promise = runWorker(db, run, makeClients, config).finally(() => {
      inFlight.delete(key)
    })
    inFlight.set(key, promise)
  }

  async function tick(): Promise<number> {
    const slots = availableSlots()
    if (slots <= 0) {
      return 0
    }

    const candidates = await db
      .selectFrom('triage_operator_runs')
      .select(['triage_id', 'operator_id', 'message_id', 'type_key', 'type_code_version', 'op_config_json', 'status'])
      .where('status', '=', 'pending')
      .orderBy('created_at', 'asc')
      .limit(CANDIDATE_LIMIT)
      .execute()

    let dispatched = 0
    for (const row of candidates) {
      if (dispatched >= slots) {
        break
      }

      const classification = await classifyCandidate(db, row, resolveContract)
      if (classification.kind === 'satisfied') {
        const won = await claimOperatorRun(db, row.triage_id, row.operator_id)
        if (won) {
          dispatch({
            triage_id: row.triage_id,
            operator_id: row.operator_id,
            message_id: row.message_id,
            type_key: row.type_key,
            type_code_version: row.type_code_version,
            op_config_json: row.op_config_json,
          })
          dispatched++
        }
      } else if (classification.kind === 'definitively_missing') {
        for (const warning of classification.warnings) {
          console.warn(`[grinbox][execution] ${warning.message}`)
        }
        await markSkipped(db, row.triage_id, row.operator_id, classification.reason)
      }
      // else 'pending': leave it; a later tick retries.
    }

    return dispatched
  }

  async function runUntilIdle(): Promise<void> {
    // Drive ticks until there is no pending OR running work left. Each loop:
    // tick (dispatch what's ready), then await one settling so newly-produced
    // Tags unblock dependents. No timers — terminates when the DB is quiescent.
    // A guard caps iterations to surface a stuck pipeline rather than spin.
    const maxIterations = 100_000
    for (let i = 0; i < maxIterations; i++) {
      const dispatched = await tick()
      const remaining = await countNonTerminal(db)
      if (remaining === 0 && inFlight.size === 0) {
        return
      }
      if (inFlight.size > 0) {
        // Let an in-flight worker settle (producing Tags / marking terminal)
        // before re-ticking, so dependents become eligible.
        await Promise.race(inFlight.values())
      } else if (dispatched === 0) {
        // Work remains, nothing is in flight, and this tick dispatched nothing:
        // the loop can make no further progress (e.g. all pending rows wait on
        // a sibling that no worker is running). Surface it rather than spin.
        throw new Error(
          `execution loop runUntilIdle stalled: ${remaining} run(s) pending/running but no worker dispatched`,
        )
      }
    }
    throw new Error('execution loop runUntilIdle exceeded iteration cap (possible stuck pipeline)')
  }

  function scheduleNext(delayMs: number): void {
    scheduled = setTimeout(() => {
      void runOnce()
    }, delayMs)
  }

  async function runOnce(): Promise<void> {
    if (!running) {
      return
    }
    let dispatched = 0
    try {
      dispatched = await tick()
    } catch (err) {
      console.error('[grinbox][execution] tick error', err)
    }
    // stop() flips `running` while tick() is awaited — narrowing can't see that.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!running) {
      return
    }
    scheduleNext(dispatched > 0 ? 0 : IDLE_SLEEP_MS)
  }

  function start(): void {
    if (running) {
      return
    }
    running = true
    scheduleNext(0)
  }

  async function stop(): Promise<void> {
    running = false
    if (scheduled) {
      clearTimeout(scheduled)
      scheduled = null
    }
    // Drain: await all in-flight workers to finish (the shutdown drain).
    await Promise.allSettled(inFlight.values())
  }

  return { tick, runUntilIdle, start, stop }
}

type CandidateClassification =
  | { kind: 'satisfied' }
  | { kind: 'pending' }
  | {
      kind: 'definitively_missing'
      reason: string
      warnings: readonly { message: string }[]
    }

/**
 * Resolve a candidate run's Contract + its siblings' Contracts + the Triage's
 * Tag keys, then delegate to {@link classifyInputs}. A snapshot that fails to
 * resolve (unknown/stale type, bad config) can never run, so it is treated as
 * `satisfied` — the worker will then fail it with the resolution error and
 * downstream Operators cascade-skip, the documented per-Operator failure path.
 */
async function classifyCandidate(
  db: DB,
  row: CandidateRow,
  resolveContract: (snapshot: OperatorSnapshot) => SnapshotContract,
): Promise<CandidateClassification> {
  const siblings = await db
    .selectFrom('triage_operator_runs')
    .select(['operator_id', 'type_key', 'type_code_version', 'op_config_json', 'status'])
    .where('triage_id', '=', row.triage_id)
    .execute()

  const tagRows = await db.selectFrom('tags').select(['key']).where('triage_id', '=', row.triage_id).execute()
  const tagsInTriage = new Set(tagRows.map((t) => t.key))

  const siblingRuns: ClassifyRun[] = []
  let selfResolved = true
  for (const s of siblings) {
    let inputKeys: readonly string[] = []
    let outputKeys: readonly string[] = []
    try {
      const contract = resolveContract(s)
      inputKeys = contract.inputKeys
      outputKeys = contract.outputKeys
    } catch {
      // A sibling whose snapshot can't resolve owns no usable outputs and
      // declares no usable inputs from our perspective; leave both empty.
      if (s.operator_id === row.operator_id) {
        selfResolved = false
      }
    }
    siblingRuns.push({
      operatorId: s.operator_id,
      inputKeys,
      outputKeys,
      status: s.status,
    })
  }

  // The candidate row itself can't resolve → let the worker fail it.
  if (!selfResolved) {
    return { kind: 'satisfied' }
  }

  // The candidate is one of its own siblings (same Triage); find it back.
  const self = siblingRuns.find((r) => r.operatorId === row.operator_id)
  if (!self) {
    return { kind: 'satisfied' }
  }
  const result = classifyInputs(self, siblingRuns, tagsInTriage)
  if (result.status === 'satisfied') {
    return { kind: 'satisfied' }
  }
  if (result.status === 'pending') {
    return { kind: 'pending' }
  }
  return {
    kind: 'definitively_missing',
    reason: result.reason,
    warnings: result.warnings,
  }
}

/** Count `triage_operator_runs` rows still `pending` or `running`. */
async function countNonTerminal(db: DB): Promise<number> {
  const rows = await db
    .selectFrom('triage_operator_runs')
    .select((eb) => eb.fn.countAll<number>().as('n'))
    .where('status', 'in', ['pending', 'running'])
    .executeTakeFirstOrThrow()
  return rows.n
}
