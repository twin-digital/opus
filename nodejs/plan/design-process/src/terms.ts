import type { Fold } from './fold.js'
import type { Product, ProductsTree } from './load.js'
import type { Finding, TermEntry } from './types.js'

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

/**
 * The term declaration gates (d-lb99q03v): slug collisions across the product's closure, adopted
 * terms included (d-bgoclt56); an unresolved `superseded_by`; retirement while an in-force
 * foundation uses the term, unless `superseded_by` resolves it (d-2t3fbn09); one increment
 * declaring one term twice (d-3kow7q0r).
 */
export const checkTerms = (product: Product, productsTree: ProductsTree, fold: Fold): Finding[] => {
  void product
  void productsTree
  void fold
  throw new Error('not implemented until the Code wave')
}

/**
 * The heuristic usage reports (d-lb99q03v), severity `report`: a redefinition's reach, a
 * retirement's apparent users, and orphan terms no in-force foundation uses.
 */
export const termReports = (product: Product, fold: Fold): Finding[] => {
  void product
  void fold
  throw new Error('not implemented until the Code wave')
}
