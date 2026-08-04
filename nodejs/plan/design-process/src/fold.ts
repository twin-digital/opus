import type { Increment, Product } from './load.js'
import type { DecisionEntry, ModelEntry, PresetEntry, RequirementEntry } from './types.js'

export interface FoldedClaim<T> {
  entry: T
  /** The increment that declared the entry now in force. */
  increment: number
}

export interface OutOfForce {
  id: string
  kind: 'requirement' | 'decision'
  /** `superseded` covers amends/supersedes; `retired` a retires: entry. */
  how: 'superseded' | 'retired'
  by: string
  increment: number
}

export interface Fold {
  at: number
  requirements: Map<string, FoldedClaim<RequirementEntry>>
  decisions: Map<string, FoldedClaim<DecisionEntry>>
  model: Map<string, FoldedClaim<ModelEntry>>
  presets: Map<string, FoldedClaim<PresetEntry>>
  outOfForce: OutOfForce[]
}

/** Fold a product's declared deltas into its effective state at increment `at` (default: newest). */
export const foldProduct = (product: Product, at?: number): Fold => {
  const limit = at ?? product.increments.at(-1)?.number ?? 0
  const fold: Fold = {
    at: limit,
    requirements: new Map(),
    decisions: new Map(),
    model: new Map(),
    presets: new Map(),
    outOfForce: [],
  }

  const remove = (
    kind: 'requirement' | 'decision',
    id: string,
    how: 'superseded' | 'retired',
    by: string,
    increment: number,
  ) => {
    const map = kind === 'requirement' ? fold.requirements : fold.decisions
    if (map.delete(id)) {
      fold.outOfForce.push({ id, kind, how, by, increment })
    }
  }

  for (const increment of product.increments.filter((candidate: Increment) => candidate.number <= limit)) {
    const requirementsSource = increment.requirements?.data
    for (const entry of requirementsSource?.requirements ?? []) {
      if (entry.amends !== undefined) {
        remove('requirement', entry.amends, 'superseded', entry.id, increment.number)
      }
      fold.requirements.set(entry.id, { entry, increment: increment.number })
    }
    for (const retirement of requirementsSource?.retires ?? []) {
      remove('requirement', retirement.id, 'retired', retirement.reason, increment.number)
    }
    for (const entry of requirementsSource?.model ?? []) {
      if (entry.status === 'unbound') {
        fold.model.delete(entry.name)
      } else {
        fold.model.set(entry.name, { entry, increment: increment.number })
      }
    }
    for (const entry of requirementsSource?.presets ?? []) {
      if (entry.status === 'dropped') {
        fold.presets.delete(entry.name)
      } else {
        fold.presets.set(entry.name, { entry, increment: increment.number })
      }
    }

    const decisionsSource = increment.decisions?.data
    for (const entry of decisionsSource?.decisions ?? []) {
      if (entry.supersedes !== undefined) {
        remove('decision', entry.supersedes, 'superseded', entry.id, increment.number)
      }
      fold.decisions.set(entry.id, { entry, increment: increment.number })
    }
    for (const retirement of decisionsSource?.retires ?? []) {
      remove('decision', retirement.id, 'retired', retirement.reason, increment.number)
    }
  }

  return fold
}

/** Claims coverage may cite: in force at the fold, and (for decisions) ruled rather than rejected, proposed, or deferred. */
export const coverableClaimIds = (fold: Fold): Set<string> => {
  const ids = new Set<string>(fold.requirements.keys())
  for (const [id, { entry }] of fold.decisions) {
    if (entry.status !== 'rejected' && entry.status !== 'proposed' && entry.status !== 'deferred') {
      ids.add(id)
    }
  }
  return ids
}
