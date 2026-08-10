import { foldProduct } from './fold.js'
import { resolvePresetClosure } from './presets.js'

import type { Fold, IncrementRef } from './fold.js'
import type { Product, ProductsTree } from './load.js'
import type { DecisionEntry, Finding, RequirementEntry, TermEntry } from './types.js'

/**
 * The normal form prose resolution compares in: case-insensitive, hyphen and space
 * interchangeable, runs of whitespace collapsed (d-bgoclt56).
 */
export const normalizeTerm = (text: string): string => text.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim()

/** Whether `prose` uses the term — its slug or its declared `display` — on word boundaries. */
export const termUsedIn = (prose: string, term: TermEntry): boolean => {
  const forms = [term.id, ...(term.display === undefined ? [] : [term.display])].map(normalizeTerm)
  const normalized = ` ${normalizeTerm(prose).replace(/[^a-z0-9 ]/g, ' ')} `
  return forms.some((form) => normalized.includes(` ${form} `))
}

/** The normative prose of an in-force foundation: its statement, and a decision's cases. */
const proseOf = (entry: RequirementEntry | DecisionEntry): string => {
  const cases =
    'cases' in entry ?
      (entry.cases ?? []).map((branch) => ('otherwise' in branch ? branch.otherwise : `${branch.when} ${branch.then}`))
    : []
  return [entry.statement, ...cases].join('\n')
}

/** In-force foundations of the fold whose normative prose uses the term. */
const usersOf = (fold: Fold, term: TermEntry): string[] =>
  [
    ...[...fold.requirements.values()].map(({ entry }) => entry as RequirementEntry | DecisionEntry),
    ...[...fold.decisions.values()].map(({ entry }) => entry as RequirementEntry | DecisionEntry),
  ]
    .filter((entry) => termUsedIn(proseOf(entry), term))
    .map((entry) => entry.id)

const sourcePathOf = (product: Product, ref: IncrementRef): string =>
  (typeof ref === 'number' ?
    product.increments.find((increment) => increment.number === ref)
  : product.drafts.find((draft) => draft.name === ref)
  )?.requirements?.path ?? product.dir

/**
 * The term declaration gates (d-lb99q03v): slug collisions across the product's closure, adopted
 * terms included (d-bgoclt56); an unresolved `superseded_by` on a retirement; and retirement while
 * an in-force foundation uses the term, unless `superseded_by` resolves it (d-2t3fbn09).
 */
export const checkTerms = (product: Product, productsTree: ProductsTree, fold: Fold): Finding[] => {
  const findings: Finding[] = []
  const active = (entry: TermEntry): boolean => (entry.status ?? 'active') === 'active'

  // the closure's terms: each adopted preset's, folded at its pinned version (d-x9x3fxp4)
  const adopted = new Map<string, string>()
  for (const preset of resolvePresetClosure(product, productsTree, fold).presets) {
    const presetProduct = productsTree.products.get(preset.name)
    if (presetProduct === undefined) {
      continue
    }
    const presetFold = foldProduct(presetProduct, preset.version)
    for (const [id, { entry }] of presetFold.terms) {
      if (active(entry) && !adopted.has(id)) {
        adopted.set(id, `${preset.name}@${preset.version}`)
      }
    }
  }

  for (const [id, claim] of fold.terms) {
    if (active(claim.entry) && adopted.has(id)) {
      findings.push({
        rule: 'term-slug-unique',
        claims: ['d-bgoclt56'],
        path: sourcePathOf(product, claim.increment),
        message: `term ${JSON.stringify(id)} collides with the term adopted from ${adopted.get(id)}`,
        product: product.id,
      })
    }
    if (claim.entry.superseded_by !== undefined) {
      const target = fold.terms.get(claim.entry.superseded_by)?.entry
      if (target === undefined || !active(target)) {
        findings.push({
          rule: 'term-superseded-by-resolves',
          claims: ['d-lb99q03v', 'd-2t3fbn09'],
          path: sourcePathOf(product, claim.increment),
          message: `term ${id} names superseded_by ${JSON.stringify(claim.entry.superseded_by)}, which is no active term`,
          product: product.id,
        })
      }
    }
    if (!active(claim.entry) && claim.entry.superseded_by === undefined) {
      const users = usersOf(fold, claim.entry)
      if (users.length > 0) {
        findings.push({
          rule: 'term-retirement-guarded',
          claims: ['d-2t3fbn09', 'd-lb99q03v'],
          path: sourcePathOf(product, claim.increment),
          message:
            `term ${id} is retired while ${users.join(', ')} still use it; ` +
            'name a superseded_by, or revise the statements first',
          product: product.id,
        })
      }
    }
  }
  return findings
}

/**
 * The heuristic usage reports (d-lb99q03v), severity `report`: a redefinition's reach, a
 * retirement's apparent users, and orphan terms no in-force foundation uses. Usage detection in
 * unmarked prose is heuristic, so these inform and never gate.
 */
export const termReports = (product: Product, fold: Fold): Finding[] => {
  const findings: Finding[] = []
  const refs: IncrementRef[] = [
    ...product.increments.filter((increment) => increment.number <= fold.at).map((increment) => increment.number),
    ...fold.drafts,
  ]
  for (const [id, claim] of fold.terms) {
    const path = sourcePathOf(product, claim.increment)
    const active = (claim.entry.status ?? 'active') === 'active'
    const users = usersOf(fold, claim.entry)

    if (active && users.length === 0) {
      findings.push({
        rule: 'term-orphan',
        claims: ['d-lb99q03v'],
        path,
        message: `term ${id} is defined but no in-force foundation appears to use it`,
        severity: 'report',
        product: product.id,
      })
    }
    if (!active && users.length > 0 && claim.entry.superseded_by !== undefined) {
      findings.push({
        rule: 'term-retirement-users',
        claims: ['d-lb99q03v'],
        path,
        message: `retired term ${id} still appears in ${users.join(', ')}; their statements read through ${claim.entry.superseded_by}`,
        severity: 'report',
        product: product.id,
      })
    }

    // a redefinition in the latest declaration reports the foundations it reaches
    const at = refs.indexOf(claim.increment)
    if (at > 0) {
      const before = foldUpTo(product, refs, at - 1).terms.get(id)?.entry
      if (before !== undefined && before.definition !== claim.entry.definition && users.length > 0) {
        findings.push({
          rule: 'term-redefinition-reach',
          claims: ['d-lb99q03v', 'd-2t3fbn09'],
          path,
          message: `redefining ${id} reaches ${users.join(', ')}, whose statements import the definition`,
          severity: 'report',
          product: product.id,
        })
      }
    }
  }
  return findings
}

const foldUpTo = (product: Product, refs: IncrementRef[], index: number): Fold => {
  const ref = refs[index]
  if (typeof ref === 'number') {
    return foldProduct(product, ref)
  }
  const drafts = []
  for (const draft of product.drafts) {
    drafts.push(draft)
    if (draft.name === ref) {
      break
    }
  }
  return foldProduct({ ...product, drafts }, undefined, true)
}
