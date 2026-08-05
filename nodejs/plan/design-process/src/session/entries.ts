import { loadProducts } from '../load.js'

import type { DraftIncrement } from '../load.js'
import type { FileTree } from '../tree.js'

/** What a question routes to — the kind of foundation that would answer it. */
export type QuestionRoute = 'fact' | 'requirement' | 'decision'

/** An entry of a draft the owner has still to rule: a proposed decision, or an open question. */
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
 * Every open entry the product's draft increments carry, in ordinal order and then source order:
 * the proposed decisions first within an increment, then its open questions. This is the master
 * list the session opens on (d-9g0poz7v).
 */
export const collectOpenEntries = (tree: FileTree, productId: string): OpenEntry[] => {
  const product = loadProducts(tree).products.get(productId)
  if (product === undefined) {
    throw new Error(`no product ${JSON.stringify(productId)} in this tree`)
  }
  return product.drafts.flatMap(draftEntries)
}

/** A draft's proposed decisions in source order, then its open questions. */
const draftEntries = (draft: DraftIncrement): OpenEntry[] => {
  const decisions = (draft.decisions?.data.decisions ?? [])
    .filter((entry) => entry.status === 'proposed')
    .map(
      (entry): OpenEntry => ({
        kind: 'decision',
        id: entry.id,
        title: entry.title,
        text: entry.statement,
        increment: draft.name,
        path: draft.decisions?.path ?? `${draft.dir}/decisions.yaml`,
        pinned: entry.pinned,
        supersedes: entry.supersedes,
        because: entry.because,
      }),
    )
  const questions = (draft.questions?.data.questions ?? []).map(
    (entry): OpenEntry => ({
      kind: 'question',
      id: entry.id,
      text: entry.question,
      increment: draft.name,
      path: draft.questions?.path ?? `${draft.dir}/questions.yaml`,
      route: entry.answer,
    }),
  )
  return [...decisions, ...questions]
}
