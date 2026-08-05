import type { ComposeClient } from '../docker/compose.js'
import type { RunSettings } from '../settings/resolve.js'
import type { OutputStream } from '../stream.js'
import type { Workspace } from '../workspace.js'
import type { ReconcilePlan } from './plan.js'

/** What one run of the reconcile did, for the stream and for tests. */
export interface ReconcileOutcome {
  plan: ReconcilePlan
  /** problems carried rather than thrown: a build that failed, a pack deployed as a stub */
  reported: readonly string[]
}

/** Everything a reconcile needs. */
export interface ReconcileContext {
  workspace: Workspace
  settings: RunSettings
  compose: ComposeClient
  stream: OutputStream
  /** the world the run serves */
  level: string
}

/**
 * The one operation that changes what the server holds. It runs at start once the one-shot builds
 * have finished, and again on every debounced change to a selected pack's built output.
 *
 * Five steps, in order: re-run discovery and resolve the selection; read the server's pool
 * contents, activation lists, and each pool directory's file names; compare them against the built
 * output of the selected packs; apply the difference; bring the change live. A run with nothing to
 * apply applies nothing and brings nothing live.
 */
export const reconcileOnce = (
  _context: ReconcileContext,
  _changed?: ReadonlySet<string>,
): Promise<ReconcileOutcome> => {
  throw new Error('not implemented: reconcileOnce')
}

/**
 * Serialises reconciles. One runs at a time; changes arriving while one is in flight — the restart
 * it may be performing included — accumulate into a single follow-up that begins when the current
 * one returns. A reconcile is never cancelled part-way and never runs beside another.
 */
export interface ReconcileQueue {
  /** requests a reconcile covering the named packs; resolves when one covering them has run */
  request(changed?: Iterable<string>): Promise<void>
  /** waits for the in-flight and queued reconciles to drain */
  drain(): Promise<void>
}

export const createReconcileQueue = (_context: ReconcileContext): ReconcileQueue => {
  throw new Error('not implemented: createReconcileQueue')
}
