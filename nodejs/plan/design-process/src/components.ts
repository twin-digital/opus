import type { Fold, FoldedClaim } from './fold.js'
import type { Product } from './load.js'
import type { ComponentEntry, Finding, Scope } from './types.js'

/** The folded component state: every declaration, the live subset, and the child edges. */
export interface ComponentTree {
  entries: Map<string, FoldedClaim<ComponentEntry>>
  /** Ids whose current declaration is not retired. */
  live: Set<string>
  /** Live parent → live children; a component with no parent is a child of the product root. */
  children: Map<string, string[]>
}

/** A scope field as the list it denotes; absent means the whole product (d-rplsevuk). */
export const scopeIds = (scope: Scope | undefined): string[] =>
  scope === undefined ? []
  : Array.isArray(scope) ? scope
  : [scope]

/** Build the component tree the fold declares. Cycles and dangling parents are checkComponents's. */
export const componentTree = (fold: Fold): ComponentTree => {
  const entries = new Map(fold.components)
  const live = new Set<string>()
  for (const [id, { entry }] of entries) {
    if ((entry.status ?? 'active') === 'active') {
      live.add(id)
    }
  }
  const children = new Map<string, string[]>()
  for (const id of live) {
    const parent = entries.get(id)?.entry.parent
    if (parent !== undefined && live.has(parent)) {
      children.set(parent, [...(children.get(parent) ?? []), id])
    }
  }
  return { entries, live, children }
}

/**
 * A component and everything beneath it — the reach of a foundation scoped there (d-rplsevuk).
 * A cycle cannot extend the walk past the ids already seen, so the traversal terminates on any input.
 */
export const subtree = (tree: ComponentTree, id: string): Set<string> => {
  const reached = new Set<string>()
  const queue = [id]
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    if (reached.has(next)) {
      continue
    }
    reached.add(next)
    queue.push(...(tree.children.get(next) ?? []))
  }
  return reached
}

/**
 * The component declaration gates (032): a parent that does not resolve or a cycle (d-cgr6q2j1,
 * d-x3ar9r8q); retirement while an in-force foundation is scoped to the component or a live child
 * names it as parent, unless `superseded_by` resolves (d-cc3nilxq); a scope on a requirement,
 * decision, preset, or term naming no live component (d-hl3l8df0, d-ue31prqs); a requirement-preset
 * product declaring components or scoping its own requirements (d-5gz40hdo); one increment
 * declaring one component twice (d-3kow7q0r).
 */
export const checkComponents = (product: Product, fold: Fold): Finding[] => {
  void product
  void fold
  throw new Error('not implemented until the Code wave')
}

/**
 * The re-parenting report (d-uw3ilu6d): a redeclaration that moves a component names, as a
 * `report`, the in-force claims whose reach the move changes.
 */
export const reparentingReports = (product: Product, fold: Fold): Finding[] => {
  void product
  void fold
  throw new Error('not implemented until the Code wave')
}
