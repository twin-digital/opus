import { FACT_ID } from '../ids.js'
import { loadProducts } from '../load.js'
import { factLabel, loadPool } from '../pools.js'

import type { FileTree } from '../tree.js'

/** What a cited id resolves to: its title, or nothing where the citation reaches outside (d-mhlya385). */
export type Citations = (citation: string) => string | undefined

/**
 * Resolve cited ids against the product's own entries and the repo-wide facts pool. The kind is
 * read from the id's prefix and nothing stores it; a fact shows its title, or the first line of
 * its claim where it has none. An id resolving to nothing is shown as the id alone, since a
 * dangling citation is a merge-gate finding rather than the session's to report.
 */
export const resolveCitations = (tree: FileTree, productId: string): Citations => {
  const titles = new Map<string, string>()
  const product = loadProducts(tree).products.get(productId)
  for (const increment of [...(product?.increments ?? []), ...(product?.drafts ?? [])]) {
    for (const entry of increment.requirements?.data.requirements ?? []) {
      titles.set(entry.id, entry.title ?? entry.statement.trim().split('\n')[0])
    }
    for (const entry of increment.decisions?.data.decisions ?? []) {
      titles.set(entry.id, entry.title ?? entry.statement.trim().split('\n')[0])
    }
  }
  for (const fact of loadPool(tree).facts) {
    if (fact.id !== '') {
      titles.set(`f:${fact.id}`, factLabel(fact))
      if (FACT_ID.test(fact.id)) {
        titles.set(fact.id, factLabel(fact)) // an opaque-id fact is cited bare too
      }
    }
  }
  return (citation) => titles.get(citation)
}

/** A citation rendered for the detail pane: the title with the id beside it, or the id alone. */
export const citationLine = (citation: string, resolve: Citations): string => {
  const title = resolve(citation)
  return title === undefined || title === '' ? citation : `${title} [${citation}]`
}
