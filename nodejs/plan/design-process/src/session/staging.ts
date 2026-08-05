import { parse, stringify } from 'yaml'

import type { OpenEntry, QuestionRoute } from './entries.js'
import type { DecisionEntry, DecisionsSource, QuestionsSource, RequirementsSource } from '../types.js'

/** The four rulings a decision admits (d-9s4d3ww2). */
export type DecisionStatus = 'accepted' | 'tolerated' | 'delegated' | 'rejected'

export interface DecisionRuling {
  kind: 'decision'
  id: string
  status: DecisionStatus
  /** The owner's reason; a rejection without one cannot be staged. */
  rejectionReason?: string
}

export interface QuestionRuling {
  kind: 'question'
  id: string
  /** The owner's answer, which closes the question. */
  answer: string
  route: QuestionRoute
  /** The id generated for the entry a requirement- or decision-routed answer writes into the draft. */
  entryId?: string
}

export type Ruling = DecisionRuling | QuestionRuling

/** The rulings taken in a session and not yet written: keyed by entry id, in the order taken. */
export interface Staged {
  rulings: Map<string, Ruling>
}

export interface SourceEdit {
  path: string
  /** The file's whole new content; an empty string deletes it. */
  content: string
}

export const emptyStaging = (): Staged => ({ rulings: new Map() })

/** Stage one ruling, replacing whatever was staged for that entry. Writes nothing (d-ovlyaoht). */
export const stageRuling = (staged: Staged, ruling: Ruling): Staged => {
  const rulings = new Map(staged.rulings)
  rulings.set(ruling.id, ruling)
  return { rulings }
}

/**
 * The bulk action: stage `status` on every decision still unruled, leaving the rulings already
 * taken and every question alone. It is the secondary path beside the per-entry ruling.
 */
export const setRemaining = (staged: Staged, entries: OpenEntry[], status: DecisionStatus): Staged => {
  const rulings = new Map(staged.rulings)
  for (const entry of entries) {
    // a question needs an answer, which is not a status (d-ol4v00nl)
    if (entry.kind === 'decision' && !rulings.has(entry.id)) {
      rulings.set(entry.id, { kind: 'decision', id: entry.id, status })
    }
  }
  return { rulings }
}

/** A routed answer the sources carry as an entry of their own (d-octrdz0j). */
const WRITES_ENTRY: QuestionRoute[] = ['requirement', 'decision']

/**
 * What the sources could not carry — a rejection with no reason, a routed answer with no entry.
 * Staging refuses these, so a submitted set validates.
 */
export const stagingProblems = (staged: Staged, entries: OpenEntry[]): string[] => {
  const known = new Set(entries.map((entry) => entry.id))
  const problems: string[] = []
  for (const ruling of staged.rulings.values()) {
    if (!known.has(ruling.id)) {
      problems.push(`${ruling.id} is not an open entry of this draft`)
      continue
    }
    if (ruling.kind === 'decision' && ruling.status === 'rejected' && !ruling.rejectionReason?.trim()) {
      problems.push(`${ruling.id} is rejected and carries no reason`)
    }
    if (ruling.kind === 'question') {
      if (!ruling.answer.trim()) {
        problems.push(`${ruling.id} is answered with nothing`)
      }
      if (WRITES_ENTRY.includes(ruling.route) && !ruling.entryId) {
        problems.push(`${ruling.id} routes to a ${ruling.route} and carries no entry`)
      }
    }
  }
  return problems
}

/** Read a source, treating one the draft does not yet carry as absent. */
const readSource = (read: (path: string) => string, path: string): unknown => {
  let raw: string
  try {
    raw = read(path)
  } catch {
    return undefined
  }
  const parsed: unknown = parse(raw)
  return parsed === null ? undefined : parsed
}

const dirOf = (path: string): string => path.slice(0, path.lastIndexOf('/'))

/**
 * The edits the staged set makes to the draft's own sources: each ruled decision takes its status,
 * each answered question leaves the questions source, and a requirement- or decision-routed answer
 * enters the draft as a new entry carrying its generated id. The caller writes and commits them in
 * one write.
 */
export const applyStaged = (read: (path: string) => string, entries: OpenEntry[], staged: Staged): SourceEdit[] => {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const edits = new Map<string, string>()
  /** Sources rewritten more than once — a routed answer may add to a file a ruling already changed. */
  const sourceOf = (path: string): unknown => {
    const pending = edits.get(path)
    return pending === undefined ? readSource(read, path) : parse(pending)
  }

  for (const ruling of staged.rulings.values()) {
    const entry = byId.get(ruling.id)
    if (entry === undefined) {
      continue
    }
    if (ruling.kind === 'decision') {
      const source = sourceOf(entry.path) as DecisionsSource | undefined
      if (source === undefined) {
        continue
      }
      source.decisions = (source.decisions ?? []).map((decision) =>
        decision.id === ruling.id ? ruled(decision, ruling) : decision,
      )
      edits.set(entry.path, stringify(source))
      continue
    }

    const questions = sourceOf(entry.path) as QuestionsSource | undefined
    if (questions !== undefined) {
      const remaining = (questions.questions ?? []).filter((question) => question.id !== ruling.id)
      // the source cannot carry an empty question list; a draft with none answered drops the file
      edits.set(entry.path, remaining.length === 0 ? '' : stringify({ ...questions, questions: remaining }))
    }
    if (ruling.entryId === undefined || !WRITES_ENTRY.includes(ruling.route)) {
      continue
    }
    const dir = dirOf(entry.path)
    if (ruling.route === 'requirement') {
      const path = `${dir}/requirements.yaml`
      const source = (sourceOf(path) as RequirementsSource | undefined) ?? { version: '1' }
      source.requirements = [...(source.requirements ?? []), statedFromAnswer(ruling.entryId, entry, ruling.answer)]
      edits.set(path, stringify(source))
      continue
    }
    const path = `${dir}/decisions.yaml`
    const source = (sourceOf(path) as DecisionsSource | undefined) ?? { version: '2' }
    source.decisions = [
      ...(source.decisions ?? []),
      { ...statedFromAnswer(ruling.entryId, entry, ruling.answer), status: 'accepted' },
    ]
    edits.set(path, stringify(source))
  }

  return [...edits].map(([path, content]) => ({ path, content }))
}

const ruled = (decision: DecisionEntry, ruling: DecisionRuling): DecisionEntry => {
  const next: DecisionEntry = { ...decision, status: ruling.status }
  if (ruling.status === 'rejected') {
    next.rejection_reason = ruling.rejectionReason
  } else {
    delete next.rejection_reason
  }
  return next
}

/** The placeholder a routed answer writes: the generated id, the question as its title, the answer as its text. */
const statedFromAnswer = (
  id: string,
  question: OpenEntry,
  answer: string,
): { id: string; title: string; statement: string } => ({
  id,
  title: question.text.trim().split('\n')[0],
  statement: answer.endsWith('\n') ? answer : `${answer}\n`,
})
