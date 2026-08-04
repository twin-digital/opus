import { foldProduct } from './fold.js'
import { loadProducts } from './load.js'
import { DirTree, GitTree } from './tree.js'

import type { Fold } from './fold.js'
import type { FileTree } from './tree.js'

/**
 * A fold version as the tooling accepts it: exactly three digits name an increment number,
 * anything else names a git ref.
 */
export type FoldVersion = { kind: 'increment'; number: number } | { kind: 'ref'; ref: string }

const THREE_DIGITS = /^\d{3}$/

export const parseFoldVersion = (value: string): FoldVersion =>
  THREE_DIGITS.test(value) ? { kind: 'increment', number: Number(value) } : { kind: 'ref', ref: value }

/** Format an increment number the way directories and the tooling's output name it. */
export const formatIncrement = (number: number): string => String(number).padStart(3, '0')

/** The highest increment number the product declares in `tree`; undefined when it declares none. */
export const latestPublished = (tree: FileTree, productId: string): number | undefined => {
  const product = loadProducts(tree).products.get(productId)
  if (product === undefined) {
    throw new Error(`no product ${JSON.stringify(productId)} in this tree`)
  }
  return product.increments.at(-1)?.number
}

export interface ResolvedFold {
  /** The increment the fold is taken at. */
  at: number
  /** The tree the fold was read from — the working tree, or the tree at a git ref. */
  tree: FileTree
  fold: Fold
}

/**
 * Resolve a fold version against a repository: an increment number folds the working tree at
 * that number, a ref folds that ref's tree at the newest increment published there. An omitted
 * version folds the working tree at its newest.
 */
export const resolveFold = (root: string, productId: string, version?: FoldVersion): ResolvedFold => {
  const tree: FileTree = version?.kind === 'ref' ? new GitTree(root, version.ref) : new DirTree(root)
  const product = loadProducts(tree).products.get(productId)
  if (product === undefined) {
    throw new Error(
      version?.kind === 'ref' ?
        `no product ${JSON.stringify(productId)} at ref ${JSON.stringify(version.ref)}`
      : `no product ${JSON.stringify(productId)} in this tree`,
    )
  }
  const at = version?.kind === 'increment' ? version.number : (product.increments.at(-1)?.number ?? 0)
  return { at, tree, fold: foldProduct(product, at) }
}
