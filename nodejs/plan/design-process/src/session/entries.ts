import { loadProducts } from '../load.js'

import type { DraftIncrement } from '../load.js'
import type { FileTree } from '../tree.js'
import type { DecisionEntry, ModelEntry, RequirementEntry } from '../types.js'

/** What a question routes to — the kind of foundation that would answer it. */
export type QuestionRoute = 'fact' | 'requirement' | 'decision'

/** An entry of a draft one of the session's two lists holds (d-26vs308h). */
export interface OpenEntry {
  kind: 'decision' | 'question' | 'requirement' | 'binding'
  id: string
  title?: string
  /** The statement, the question's text, or a binding's description. */
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
  /** What a requirement closes. */
  amends?: string
  /** A decision's citations. */
  because?: string[]
  /** The route a question carries. */
  route?: QuestionRoute
  /** A requirement's rationale, as written. */
  rationale?: string
  /** A requirement's verification steps, in source order. */
  verification?: RequirementEntry['verification']
  /** The contract reference a model binding names. */
  reference?: string
  /** A binding's status, where the source carries one. */
  bindingStatus?: ModelEntry['status']
  /** Another entry of the same draft that supersedes or amends this one (d-g00ah4em). */
  closedBy?: string
}

/** What an entry closes, whichever field carries it (d-g00ah4em). */
export const closes = (entry: OpenEntry): string | undefined => entry.supersedes ?? entry.amends

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

/**
 * The two lists the session holds: every decision the draft carries in whatever status followed by
 * every question still open, and the requirements it declares followed by its model bindings, each
 * entry marked with what closes it (d-8abusqwe, d-26vs308h). A draft is worked over several
 * sittings, so a list holding only what is still open would hide the rulings already made.
 */
export const collectSessionEntries = (
  tree: FileTree,
  productId: string,
  increment?: string,
): { decisions: OpenEntry[]; requirements: OpenEntry[] } => {
  const found = drafts(tree, productId, increment)
  const decisions = found.flatMap((draft) => [...decisionEntries(draft), ...questionEntries(draft)])
  const requirements = found.flatMap((draft) => [...requirementEntries(draft), ...bindingEntries(draft)])
  const closers = new Map<string, string>()
  for (const entry of [...decisions, ...requirements]) {
    const closed = closes(entry)
    if (closed !== undefined) {
      closers.set(closed, entry.id)
    }
  }
  const marked = (entry: OpenEntry): OpenEntry => ({ ...entry, closedBy: closers.get(entry.id) })
  return { decisions: decisions.map(marked), requirements: requirements.map(marked) }
}

const requirementEntries = (draft: DraftIncrement): OpenEntry[] =>
  (draft.requirements?.data.requirements ?? []).map((entry): OpenEntry => ({
    kind: 'requirement',
    id: entry.id,
    title: entry.title,
    text: entry.statement,
    increment: draft.name,
    path: draft.requirements?.path ?? `${draft.dir}/requirements.yaml`,
    amends: entry.amends,
    rationale: entry.rationale,
    verification: entry.verification,
  }))

/** A binding is named by the contract it references, which is what the list shows in place of an id. */
const bindingEntries = (draft: DraftIncrement): OpenEntry[] =>
  (draft.requirements?.data.model ?? []).map((entry): OpenEntry => {
    const reference = entry.surface ?? entry.schema ?? entry.api ?? ''
    return {
      kind: 'binding',
      id: reference === '' ? entry.name : reference,
      title: entry.name,
      text: entry.description ?? '',
      increment: draft.name,
      path: draft.requirements?.path ?? `${draft.dir}/requirements.yaml`,
      reference,
      bindingStatus: entry.status,
    }
  })

const questionEntries = (draft: DraftIncrement): OpenEntry[] =>
  (draft.questions?.data.questions ?? []).map((entry): OpenEntry => ({
    kind: 'question',
    id: entry.id,
    text: entry.question,
    increment: draft.name,
    path: draft.questions?.path ?? `${draft.dir}/questions.yaml`,
    route: entry.answer,
  }))
