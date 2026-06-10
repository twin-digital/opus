/**
 * Execution-loop input classification (pipeline-runtime.md "Input
 * classification"). A pure function over already-resolved data: it decides
 * whether a `pending` Operator run's declared input Tag keys are all available
 * in the Triage (`satisfied`), are blocked because the Operator that owns a key
 * has failed/skipped/produced-nothing (`definitively_missing` → cascade skip),
 * or are still being produced by an upstream Operator (`pending` → wait).
 *
 * The function is deliberately I/O-free: the execution loop resolves each run's
 * Contract (declared input keys + owned output keys) from its snapshot and loads
 * the Triage's Tag keys, then hands those facts here. That keeps the
 * classification logic unit-testable without a DB or the code-resident registry.
 *
 * Raw Message fields are always satisfied (the Message is part of the Triage
 * context), so they never appear as declared input Tag keys — only Tag keys
 * produced by *other* Operators gate a run.
 */

/** Terminal/non-terminal status of a sibling run, as the classifier sees it. */
export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

/**
 * One Operator run as the classifier sees it: its identity, declared input Tag
 * keys, the output Tag keys it owns (declared outputs), and its current status.
 */
export interface ClassifyRun {
  readonly operatorId: number
  /** Declared input Tag keys (from the snapshotted Contract). */
  readonly inputKeys: readonly string[]
  /** Output Tag keys this run owns (declared outputs from its Contract). */
  readonly outputKeys: readonly string[]
  readonly status: RunStatus
}

/** A logged data-inconsistency the classifier detected (owner completed but
 * didn't produce a declared output Tag). */
export interface ClassifyWarning {
  readonly inputKey: string
  readonly ownerOperatorId: number
  readonly message: string
}

export type ClassifyResult =
  | { readonly status: 'satisfied' }
  | { readonly status: 'pending' }
  | {
      readonly status: 'definitively_missing'
      readonly reason: string
      readonly warnings: readonly ClassifyWarning[]
    }

/**
 * Classify a run's inputs (pipeline-runtime.md). For each declared input Tag
 * key:
 *  - present in `tagsInTriage` → satisfied
 *  - else find the sibling run that owns the key (declares it as an output):
 *    - owner `failed`/`skipped` → definitively_missing (cascade skip)
 *    - owner `completed` but the key isn't in `tagsInTriage` → data
 *      inconsistency: definitively_missing + a warning
 *    - owner `pending`/`running` → wait
 *  - no owner at all → definitively_missing (dangling dep; save-time validation
 *    should prevent this, but the loop must not wait forever on a key nobody
 *    produces)
 *
 * Aggregate: any key definitively_missing → definitively_missing; else any key
 * still waiting → pending; else satisfied.
 */
export function classifyInputs(
  run: ClassifyRun,
  siblingRuns: readonly ClassifyRun[],
  tagsInTriage: ReadonlySet<string>,
): ClassifyResult {
  const ownerByKey = buildOwnerIndex(siblingRuns)

  const reasons: string[] = []
  const warnings: ClassifyWarning[] = []
  let anyWaiting = false

  for (const key of run.inputKeys) {
    if (tagsInTriage.has(key)) {
      continue
    }

    const owner = ownerByKey.get(key)
    if (!owner) {
      // Dangling dependency: no enabled sibling produces this key. Save-time
      // validation forbids this, but if the loop sees it the input can never be
      // satisfied, so treat it as definitively missing rather than hanging.
      reasons.push(`input Tag '${key}' has no producing Operator in this Triage`)
      continue
    }

    switch (owner.status) {
      case 'failed':
      case 'skipped':
        reasons.push(`input Tag '${key}' not produced: Operator ${owner.operatorId} ${owner.status}`)
        break
      case 'completed': {
        // Owner finished but the Tag isn't present — a data inconsistency.
        const warning: ClassifyWarning = {
          inputKey: key,
          ownerOperatorId: owner.operatorId,
          message: `Operator ${owner.operatorId} completed without producing ` + `declared output Tag '${key}'`,
        }
        warnings.push(warning)
        reasons.push(`input Tag '${key}' not produced: Operator ${owner.operatorId} completed without producing it`)
        break
      }
      case 'pending':
      case 'running':
        anyWaiting = true
        break
    }
  }

  if (reasons.length > 0) {
    return {
      status: 'definitively_missing',
      reason: reasons.join('; '),
      warnings,
    }
  }
  if (anyWaiting) {
    return { status: 'pending' }
  }
  return { status: 'satisfied' }
}

/**
 * Maps each output Tag key to the sibling run that owns it. Single-producer
 * per Tag key is a save-time invariant, so the first owner wins if (against the
 * invariant) two declare the same key.
 */
function buildOwnerIndex(siblingRuns: readonly ClassifyRun[]): Map<string, ClassifyRun> {
  const index = new Map<string, ClassifyRun>()
  for (const sibling of siblingRuns) {
    for (const key of sibling.outputKeys) {
      if (!index.has(key)) {
        index.set(key, sibling)
      }
    }
  }
  return index
}
