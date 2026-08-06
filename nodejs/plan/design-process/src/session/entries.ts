import { loadProducts } from '../load.js'

import type { DraftIncrement } from '../load.js'
import type { FileTree } from '../tree.js'
import type { DecisionEntry } from '../types.js'

/** What a question routes to — the kind of foundation that would answer it. */
export type QuestionRoute = 'fact' | 'requirement' | 'decision'

/** An entry of a draft the ratify list holds: a decision in any status, or an open question. */
export interface OpenEntry {
  kind: 'decision' | 'question'
  id: string
  title?: string
  /** The decision's statement, or the question's text. */
  text: string
  /** The draft increment directory the entry lives in. */
  increment: string
  /** The source file it was read from. */
  path: string
  /** The status the source carries for a decision; the sitting's ruling replaces it. */
  status?: DecisionEntry['status']
  /** A decision's pinning proposal, as written. */
  pinned?: false | { reason: string; notes?: string }
  /** What a decision closes. */
  supersedes?: string
  /** A decision's citations. */
  because?: string[]
  /** The route a question carries. */
  route?: QuestionRoute
}

/**
 * The entries of the draft the ratify list holds: every decision it carries in whatever status,
 * then every question still open, in source order (d-8abusqwe). A draft is worked over several
 * sittings, so a list holding only what is still open would hide the rulings already made.
 */
export const collectRatifyEntries = (tree: FileTree, productId: string, increment?: string): OpenEntry[] =>
  drafts(tree, productId, increment).flatMap((draft) => [...decisionEntries(draft), ...questionEntries(draft)])

/**
 * Every entry the product's drafts leave unsettled: a decision still proposed, and every question
 * still open. This is what refuses a landing.
 */
export const collectOpenEntries = (tree: FileTree, productId: string): OpenEntry[] =>
  drafts(tree, productId).flatMap((draft) => [
    ...decisionEntries(draft).filter((entry) => entry.status === 'proposed'),
    ...questionEntries(draft),
  ])

const drafts = (tree: FileTree, productId: string, increment?: string): DraftIncrement[] => {
  const product = loadProducts(tree).products.get(productId)
  if (product === undefined) {
    throw new Error(`no product ${JSON.stringify(productId)} in this tree`)
  }
  return increment === undefined ? product.drafts : product.drafts.filter((draft) => draft.name === increment)
}

const decisionEntries = (draft: DraftIncrement): OpenEntry[] =>
  (draft.decisions?.data.decisions ?? []).map((entry): OpenEntry => ({
    kind: 'decision',
    id: entry.id,
    title: entry.title,
    text: entry.statement,
    increment: draft.name,
    path: draft.decisions?.path ?? `${draft.dir}/decisions.yaml`,
    status: entry.status,
    pinned: entry.pinned,
    supersedes: entry.supersedes,
    because: entry.because,
  }))

const questionEntries = (draft: DraftIncrement): OpenEntry[] =>
  (draft.questions?.data.questions ?? []).map((entry): OpenEntry => ({
    kind: 'question',
    id: entry.id,
    text: entry.question,
    increment: draft.name,
    path: draft.questions?.path ?? `${draft.dir}/questions.yaml`,
    route: entry.answer,
  }))
