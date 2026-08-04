import { foldProduct } from './fold.js'
import { loadProducts } from './load.js'
import { DirTree, GitTree } from './tree.js'

import type { Fold } from './fold.js'
import type { FileTree } from './tree.js'

/** A fold version: an increment number, or a git ref. */
export type FoldVersion = { kind: 'increment'; number: number } | { kind: 'ref'; ref: string }

/**
 * The arguments of one fold-version flag pair — the bare flag takes an increment, its `-ref`
 * counterpart takes a git ref — with the flag names used in error messages.
 */
export interface FoldVersionFlags {
  /** The increment argument, as given: `9`, `09`, and `009` are the same increment. */
  increment?: string
  /** The git ref argument, as given. */
  ref?: string
  /** The pair's flag names, increment first: `['--at', '--at-ref']`. */
  names: [string, string]
}

const DIGITS = /^\d+$/

/**
 * Read one fold-version flag pair. Undefined when neither member was given; throws when both
 * were, or when the increment argument is not a number.
 */
export const parseFoldVersion = ({ increment, ref, names }: FoldVersionFlags): FoldVersion | undefined => {
  const [incrementFlag, refFlag] = names
  if (increment !== undefined && ref !== undefined) {
    throw new Error(`give ${incrementFlag} or ${refFlag}, not both`)
  }
  if (ref !== undefined) {
    return { kind: 'ref', ref }
  }
  if (increment === undefined) {
    return undefined
  }
  if (!DIGITS.test(increment)) {
    throw new Error(
      `${incrementFlag} takes an increment number; for a git ref use ${refFlag} ${JSON.stringify(increment)}`,
    )
  }
  return { kind: 'increment', number: Number(increment) }
}

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
