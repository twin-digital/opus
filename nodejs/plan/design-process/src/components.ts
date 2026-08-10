import { foldProduct } from './fold.js'

import type { Fold, FoldedClaim, IncrementRef } from './fold.js'
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
 * The live component a scope reference denotes: the id itself, or — where it names a retired
 * component — the component its `superseded_by` chain resolves through (d-cc3nilxq).
 */
export const resolveScopeId = (tree: ComponentTree, id: string): string | undefined => {
  const seen = new Set<string>()
  let current: string | undefined = id
  while (current !== undefined && !seen.has(current)) {
    if (tree.live.has(current)) {
      return current
    }
    seen.add(current)
    current = tree.entries.get(current)?.entry.superseded_by
  }
  return undefined
}

/** The requirements source path of the increment `ref` names, for a finding's location. */
const sourcePathOf = (product: Product, ref: IncrementRef): string =>
  (typeof ref === 'number' ?
    product.increments.find((increment) => increment.number === ref)
  : product.drafts.find((draft) => draft.name === ref)
  )?.requirements?.path ?? product.dir

interface ScopedEntry {
  id: string
  scope: Scope | undefined
  path: string
}

/** Every scope-bearing declaration in force: requirements, decisions, presets, and terms. */
const scopedEntries = (product: Product, fold: Fold): ScopedEntry[] => {
  const decisionsPathOf = (ref: IncrementRef): string =>
    (typeof ref === 'number' ?
      product.increments.find((increment) => increment.number === ref)
    : product.drafts.find((draft) => draft.name === ref)
    )?.decisions?.path ?? product.dir
  return [
    ...[...fold.requirements.values()].map(({ entry, increment }) => ({
      id: entry.id,
      scope: entry.scope,
      path: sourcePathOf(product, increment),
    })),
    ...[...fold.decisions.values()].map(({ entry, increment }) => ({
      id: entry.id,
      scope: entry.scope,
      path: decisionsPathOf(increment),
    })),
    ...[...fold.presets.values()]
      .filter(({ entry }) => entry.status !== 'dropped' && entry.status !== 'retired')
      .map(({ entry, increment }) => ({
        id: `preset ${entry.name}`,
        scope: entry.scope,
        path: sourcePathOf(product, increment),
      })),
    ...[...fold.terms.values()]
      .filter(({ entry }) => (entry.status ?? 'active') === 'active')
      .map(({ entry, increment }) => ({
        id: `term ${entry.id}`,
        scope: entry.scope,
        path: sourcePathOf(product, increment),
      })),
  ]
}

/**
 * The component declaration gates (032): a parent that does not resolve or a cycle (d-cgr6q2j1,
 * d-x3ar9r8q); retirement while an in-force foundation is scoped to the component or a live child
 * names it as parent, unless `superseded_by` resolves (d-cc3nilxq); a scope on a requirement,
 * decision, preset, or term resolving to no live component (d-hl3l8df0, d-ue31prqs); a
 * requirement-preset product declaring components or scoping its own requirements (d-5gz40hdo).
 */
export const checkComponents = (product: Product, fold: Fold): Finding[] => {
  const findings: Finding[] = []
  const tree = componentTree(fold)

  // a requirement-preset declares no components, and its own requirements carry no scope
  if (product.declaration?.data.kind === 'requirement-preset') {
    for (const { increment } of fold.components.values()) {
      findings.push({
        rule: 'preset-declares-no-components',
        claims: ['d-5gz40hdo'],
        path: sourcePathOf(product, increment),
        message: 'a requirement-preset declares no components; the applying product supplies the scope',
        product: product.id,
      })
    }
    for (const { entry, increment } of fold.requirements.values()) {
      if (entry.scope !== undefined) {
        findings.push({
          rule: 'preset-requirement-unscoped',
          claims: ['d-5gz40hdo'],
          path: sourcePathOf(product, increment),
          message: `${entry.id} carries a scope; a preset's own requirements carry none`,
          product: product.id,
        })
      }
    }
    return findings
  }

  // parents resolve to live components (d-cgr6q2j1)
  for (const id of tree.live) {
    const claim = tree.entries.get(id)
    const parent = claim?.entry.parent
    if (parent !== undefined && !tree.live.has(parent)) {
      findings.push({
        rule: 'component-parent-resolves',
        claims: ['d-cgr6q2j1'],
        path: sourcePathOf(product, claim?.increment ?? 0),
        message: `component ${id} names parent ${JSON.stringify(parent)}, which is no live component`,
        product: product.id,
      })
    }
  }

  // the graph is acyclic (d-x3ar9r8q)
  const inCycle = new Set<string>()
  for (const id of tree.live) {
    const trail = new Set<string>()
    let current: string | undefined = id
    while (current !== undefined && tree.live.has(current) && !trail.has(current)) {
      trail.add(current)
      current = tree.entries.get(current)?.entry.parent
    }
    if (current !== undefined && trail.has(current) && !inCycle.has(current)) {
      const members = [...trail].slice([...trail].indexOf(current))
      for (const member of members) {
        inCycle.add(member)
      }
      const latest = members
        .map((member) => tree.entries.get(member))
        .filter((claim) => claim !== undefined)
        .at(-1)
      findings.push({
        rule: 'component-acyclic',
        claims: ['d-x3ar9r8q', 'd-cgr6q2j1'],
        path: sourcePathOf(product, latest?.increment ?? 0),
        message: `components cycle: ${members.join(' → ')}`,
        product: product.id,
      })
    }
  }

  // retirement is guarded unless superseded_by resolves the references (d-cc3nilxq)
  for (const [id, claim] of tree.entries) {
    if ((claim.entry.status ?? 'active') === 'active') {
      continue
    }
    const resolved =
      claim.entry.superseded_by === undefined ? undefined : resolveScopeId(tree, claim.entry.superseded_by)
    if (resolved !== undefined) {
      continue
    }
    const scopedHere = scopedEntries(product, fold).filter(({ scope }) => scopeIds(scope).includes(id))
    const childrenOf = [...tree.live].filter((live) => tree.entries.get(live)?.entry.parent === id)
    const users = [...scopedHere.map((entry) => entry.id), ...childrenOf.map((child) => `component ${child}`)]
    if (users.length > 0) {
      findings.push({
        rule: 'component-retirement-guarded',
        claims: ['d-cc3nilxq'],
        path: sourcePathOf(product, claim.increment),
        message:
          `component ${id} is retired while still referenced by ${users.join(', ')}; ` +
          'name a superseded_by the references resolve through',
        product: product.id,
      })
    }
  }

  // every scope resolves to a live component, superseded_by chains included (d-hl3l8df0, d-ue31prqs)
  for (const entry of scopedEntries(product, fold)) {
    for (const id of scopeIds(entry.scope)) {
      if (resolveScopeId(tree, id) === undefined) {
        findings.push({
          rule: 'scope-resolves',
          claims: ['d-hl3l8df0', 'd-ue31prqs'],
          path: entry.path,
          message: `${entry.id} is scoped to ${JSON.stringify(id)}, which resolves to no live component`,
          product: product.id,
        })
      }
    }
  }

  return findings
}

/**
 * The re-parenting report (d-uw3ilu6d): where the latest declaration of a component moved it, name
 * — as a `report`, never a gate — the in-force claims whose reach the move changed.
 */
export const reparentingReports = (product: Product, fold: Fold): Finding[] => {
  const findings: Finding[] = []
  const current = componentTree(fold)
  const refs: IncrementRef[] = [
    ...product.increments.filter((increment) => increment.number <= fold.at).map((increment) => increment.number),
    ...fold.drafts,
  ]
  for (const [id, claim] of fold.components) {
    const at = refs.indexOf(claim.increment)
    if (at <= 0) {
      continue // first increment declares, and a declaration is not a move
    }
    const before = componentTree(foldAtRef(product, refs[at - 1]))
    if (!before.entries.has(id) || before.entries.get(id)?.entry.parent === claim.entry.parent) {
      continue
    }
    const changed = [
      ...[...fold.requirements.values()].map(({ entry }) => entry),
      ...[...fold.decisions.values()].map(({ entry }) => entry),
    ]
      .filter((entry) => entry.scope !== undefined)
      .filter((entry) => {
        const reachBefore = reach(before, entry.scope)
        const reachAfter = reach(current, entry.scope)
        return !sameSet(reachBefore, reachAfter)
      })
      .map((entry) => entry.id)
    if (changed.length > 0) {
      findings.push({
        rule: 'component-reparented',
        claims: ['d-uw3ilu6d'],
        path: sourcePathOf(product, claim.increment),
        message: `re-parenting ${id} changes the reach of ${changed.join(', ')}; the owner rules with that in view`,
        severity: 'report',
        product: product.id,
      })
    }
  }
  return findings
}

const foldAtRef = (product: Product, ref: IncrementRef): Fold => {
  if (typeof ref === 'number') {
    return foldProduct(product, ref)
  }
  // fold up to and including the named draft, in ordinal order
  const drafts = []
  for (const draft of product.drafts) {
    drafts.push(draft)
    if (draft.name === ref) {
      break
    }
  }
  const trimmed: Product = { ...product, drafts }
  return foldProduct(trimmed, undefined, true)
}

const reach = (tree: ComponentTree, scope: Scope | undefined): Set<string> => {
  const reached = new Set<string>()
  for (const id of scopeIds(scope)) {
    const resolved = resolveScopeId(tree, id)
    if (resolved !== undefined) {
      for (const member of subtree(tree, resolved)) {
        reached.add(member)
      }
    }
  }
  return reached
}

const sameSet = (a: Set<string>, b: Set<string>): boolean =>
  a.size === b.size && [...a].every((member) => b.has(member))
