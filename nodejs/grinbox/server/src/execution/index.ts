/**
 * Execution-loop + worker-pool surface. The daemon constructs the loop here and
 * runs the recovery sweep; the poll loop (next task) feeds Triages by enqueueing
 * them — the execution loop discovers their `pending` runs on its own ticks.
 *
 * Wiring contract for the poll loop: after enqueuing a Triage (via
 * `enqueueTriage`), no explicit hand-off to the loop is needed — `start()` keeps
 * ticking and picks up the new `pending` rows. A future poll loop only needs to
 * ensure the execution loop has been `start()`ed.
 */

export {
  type ClassifyResult,
  type ClassifyRun,
  type ClassifyWarning,
  type RunStatus,
  classifyInputs,
} from './classify-inputs.js'

export { type SnapshotContract, resolveSnapshotContract } from './resolve-contract.js'

export { OPERATOR_TIMEOUT_REASON, type WorkerRunRow, runWorker } from './worker.js'

export { type ExecutionLoop, type ExecutionLoopDeps, createExecutionLoop } from './execution-loop.js'

export { type RecoveryResult, recoverInterruptedRuns } from './recovery.js'
