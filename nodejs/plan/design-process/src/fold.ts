import type { IncrementSources, Product } from './load.js'
import type { ComponentEntry, DecisionEntry, ModelEntry, PresetEntry, RequirementEntry, TermEntry } from './types.js'

/** How an increment names itself: a published number, or a draft increment's directory name. */
export type IncrementRef = number | string

export interface FoldedClaim<T> {
  entry: T
  /** The increment that declared the entry now in force. */
  increment: IncrementRef
}

export interface OutOfForce {
  id: string
  kind: 'requirement' | 'decision'
  /** `superseded` covers amends/supersedes; `retired` a retires: entry. */
  how: 'superseded' | 'retired'
  by: string
  increment: IncrementRef
}

export interface Fold {
  /** The published increment the fold is taken at; a draft increment claims no number. */
  at: number
  /** The last increment folded — `at`, or a draft increment's directory name when drafts folded. */
  label: IncrementRef
  /** The draft increments folded, in ordinal order. */
  drafts: string[]
  requirements: Map<string, FoldedClaim<RequirementEntry>>
  decisions: Map<string, FoldedClaim<DecisionEntry>>
  model: Map<string, FoldedClaim<ModelEntry>>
  presets: Map<string, FoldedClaim<PresetEntry>>
  /** State entries folding by id; the latest declaration — retired included — is current state. */
  components: Map<string, FoldedClaim<ComponentEntry>>
  terms: Map<string, FoldedClaim<TermEntry>>
  outOfForce: OutOfForce[]
}

/**
 * Fold a product's declared deltas into its effective state at increment `at` (default: newest
 * published). With `includeDrafts`, the tree's draft increments fold after every published one, in
 * ordinal order (d-x1mhu3a3).
 */
export const foldProduct = (product: Product, at?: number, includeDrafts = false): Fold => {
  const limit = at ?? product.increments.at(-1)?.number ?? 0
  const drafts = includeDrafts ? product.drafts : []
  const fold: Fold = {
    at: limit,
    label: drafts.at(-1)?.name ?? limit,
    drafts: drafts.map((draft) => draft.name),
    requirements: new Map(),
    decisions: new Map(),
    model: new Map(),
    presets: new Map(),
    components: new Map(),
    terms: new Map(),
    outOfForce: [],
  }

  const remove = (
    kind: 'requirement' | 'decision',
    id: string,
    how: 'superseded' | 'retired',
    by: string,
    increment: IncrementRef,
  ) => {
    const map = kind === 'requirement' ? fold.requirements : fold.decisions
    if (map.delete(id)) {
      fold.outOfForce.push({ id, kind, how, by, increment })
    }
  }

  const apply = (increment: IncrementSources, ref: IncrementRef) => {
    const requirementsSource = increment.requirements?.data
    for (const entry of requirementsSource?.requirements ?? []) {
      // `requirement@1` spells the succession `amends:`; `@2` spells it `supersedes:` (d-4i5k9nsi)
      const succeeds = entry.supersedes ?? entry.amends
      if (succeeds !== undefined) {
        remove('requirement', succeeds, 'superseded', entry.id, ref)
      }
      fold.requirements.set(entry.id, { entry, increment: ref })
    }
    for (const retirement of requirementsSource?.retires ?? []) {
      remove('requirement', retirement.id, 'retired', retirement.reason, ref)
    }
    for (const entry of requirementsSource?.model ?? []) {
      if (entry.status === 'unbound' || entry.status === 'retired') {
        fold.model.delete(entry.name)
      } else {
        fold.model.set(entry.name, { entry, increment: ref })
      }
    }
    for (const entry of requirementsSource?.presets ?? []) {
      if (entry.status === 'dropped') {
        fold.presets.delete(entry.name)
      } else {
        // a `requirements@3` retirement is current state, kept for its reason (d-cizeaklk)
        fold.presets.set(entry.name, { entry, increment: ref })
      }
    }
    for (const entry of requirementsSource?.components ?? []) {
      fold.components.set(entry.id, { entry, increment: ref })
    }
    for (const entry of requirementsSource?.terms ?? []) {
      fold.terms.set(entry.id, { entry, increment: ref })
    }

    const decisionsSource = increment.decisions?.data
    for (const entry of decisionsSource?.decisions ?? []) {
      if (entry.supersedes !== undefined) {
        remove('decision', entry.supersedes, 'superseded', entry.id, ref)
      }
      fold.decisions.set(entry.id, { entry, increment: ref })
    }
    for (const retirement of decisionsSource?.retires ?? []) {
      remove('decision', retirement.id, 'retired', retirement.reason, ref)
    }
  }

  for (const increment of product.increments.filter((candidate) => candidate.number <= limit)) {
    apply(increment, increment.number)
  }
  for (const draft of drafts) {
    apply(draft, draft.name)
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
