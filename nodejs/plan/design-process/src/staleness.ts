import type { ProductsTree } from './load.js'
import type { Pool } from './pools.js'
import type { FileTree } from './tree.js'
import type { Finding } from './types.js'

/** What the fact-retirement gate reads of a backlog item (d-hxxlgaw9). */
export interface BacklogView {
  id: string
  product: string
  content: string
}

/**
 * A merged fact or run is frozen (r-wgtyrh2r, d-vkudjo4x): any base→head edit to a pool entry
 * beyond marking it retired — with its reason and its `superseded_by` where one exists — is a
 * finding. Removing an entry is the same finding.
 */
export const checkPoolFrozen = (head: FileTree, base: FileTree): Finding[] => {
  void head
  void base
  throw new Error('not implemented until the Code wave')
}

/**
 * Retiring a cited fact is never refused, and the debt is captured (d-hxxlgaw9, r-ajpjx5w0): a
 * change retiring a fact that in-force foundations cite must carry a backlog item per citing
 * product, naming the retired fact, its replacement, and the citing entries.
 */
export const checkFactRetirementDebt = (head: FileTree, base: FileTree, backlog: () => BacklogView[]): Finding[] => {
  void head
  void base
  void backlog
  throw new Error('not implemented until the Code wave')
}

/**
 * The staleness model (d-hxxlgaw9, d-8y5vmff8): an in-force foundation in a published increment
 * resting on a retired fact is a `report` naming its product, enforced by that product's own next
 * landing; a draft entry citing an already-retired fact is an ordinary finding.
 */
export const checkFactStaleness = (tree: FileTree, productsTree: ProductsTree, pool: Pool): Finding[] => {
  void tree
  void productsTree
  void pool
  throw new Error('not implemented until the Code wave')
}
