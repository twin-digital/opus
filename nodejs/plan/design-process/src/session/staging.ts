import { appendItem, removeItem, setField, setPlainField } from '../yaml-edit.js'

import type { OpenEntry, QuestionRoute } from './entries.js'

/** The four rulings a decision admits (d-9s4d3ww2), and the deferral the session also writes (d-4xkyfjzu). */
export type DecisionStatus = 'accepted' | 'tolerated' | 'delegated' | 'rejected' | 'deferred'

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

/**
 * What a sitting has taken and not yet written: the rulings keyed by entry id in the order taken,
 * and the notes the owner left, which settle nothing and gate nothing (d-f1b5r2f8).
 */
export interface Staged {
  rulings: Map<string, Ruling>
  notes: Map<string, string>
}

export interface SourceEdit {
  path: string
  /** The file's whole new content; an empty string deletes it. */
  content: string
}

export const emptyStaging = (): Staged => ({ rulings: new Map(), notes: new Map() })

/** Stage one ruling, replacing whatever was staged for that entry. Writes nothing (d-ovlyaoht). */
export const stageRuling = (staged: Staged, ruling: Ruling): Staged => {
  const rulings = new Map(staged.rulings)
  rulings.set(ruling.id, ruling)
  return { ...staged, rulings }
}

/** Leave a note against an entry; an empty note removes the one it carried. */
export const stageNote = (staged: Staged, id: string, note: string): Staged => {
  const notes = new Map(staged.notes)
  if (note.trim() === '') {
    notes.delete(id)
  } else {
    notes.set(id, note.trim())
  }
  return { ...staged, notes }
}

/** The status a decision stands at once the sitting's rulings are counted. */
export const effectiveStatus = (staged: Staged, entry: OpenEntry): string | undefined => {
  const ruling = staged.rulings.get(entry.id)
  if (ruling?.kind === 'decision') {
    return ruling.status
  }
  return entry.kind === 'decision' ? entry.status : undefined
}

/** A decision the sitting has not ruled and the source leaves proposed — what the bulk action sets. */
const unruled = (staged: Staged, entry: OpenEntry): boolean =>
  entry.kind === 'decision' && !staged.rulings.has(entry.id) && entry.status === 'proposed'

/**
 * The bulk action: stage `status` on every decision still unruled, leaving the rulings already
 * taken and every question alone. It is the secondary path beside the per-entry ruling.
 */
export const setRemaining = (staged: Staged, entries: OpenEntry[], status: DecisionStatus): Staged => {
  const rulings = new Map(staged.rulings)
  for (const entry of entries) {
    // a question needs an answer, which is not a status (d-ol4v00nl)
    if (unruled(staged, entry)) {
      rulings.set(entry.id, { kind: 'decision', id: entry.id, status })
    }
  }
  return { ...staged, rulings }
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

/** The order a commit body names the statuses in; a status no entry took is omitted (d-lqmwczg3). */
const STATUS_ORDER: DecisionStatus[] = ['accepted', 'tolerated', 'delegated', 'rejected', 'deferred']

/**
 * What the commit says the sitting did: each status the set took and how many entries took it, in
 * a fixed order, with answered questions as their own clause since an answer is not a status.
 * Returns undefined for a sitting that changed nothing, which writes no commit.
 */
export const commitBody = (staged: Staged): string | undefined => {
  const counts = new Map<DecisionStatus, number>()
  let answered = 0
  for (const ruling of staged.rulings.values()) {
    if (ruling.kind === 'question') {
      answered += 1
    } else {
      counts.set(ruling.status, (counts.get(ruling.status) ?? 0) + 1)
    }
  }
  const clauses = STATUS_ORDER.filter((status) => counts.has(status)).map((status) => `${counts.get(status)} ${status}`)
  if (answered > 0) {
    clauses.push(`${answered} answered`)
  }
  return clauses.length === 0 ? undefined : clauses.join(', ')
}

/** Read a source, treating one the draft does not yet carry as absent. */
const readSource = (read: (path: string) => string, path: string): string | undefined => {
  try {
    return read(path)
  } catch {
    return undefined
  }
}

const dirOf = (path: string): string => path.slice(0, path.lastIndexOf('/'))

/**
 * The edits the staged set makes to the draft's own sources: each ruled decision takes its status,
 * each answered question leaves the questions source, and a requirement- or decision-routed answer
 * enters the draft as a new entry carrying its generated id. Every edit is a span rewrite, so the
 * bytes the sitting did not rule are the bytes the file already had (d-yfxziwwg).
 */
export const applyStaged = (read: (path: string) => string, entries: OpenEntry[], staged: Staged): SourceEdit[] => {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const edits = new Map<string, string>()
  const sourceOf = (path: string): string | undefined => edits.get(path) ?? readSource(read, path)

  for (const ruling of staged.rulings.values()) {
    const entry = byId.get(ruling.id)
    if (entry === undefined) {
      continue
    }
    if (ruling.kind === 'decision') {
      const source = sourceOf(entry.path)
      if (source === undefined) {
        continue
      }
      const ruled = setPlainField(source, 'decisions', ruling.id, 'status', ruling.status)
      edits.set(
        entry.path,
        ruling.status === 'rejected' ?
          setField(ruled, 'decisions', ruling.id, 'rejection_reason', ruling.rejectionReason)
        : setField(ruled, 'decisions', ruling.id, 'rejection_reason', undefined),
      )
      continue
    }

    const questions = sourceOf(entry.path)
    if (questions !== undefined) {
      const remaining = removeItem(questions, 'questions', ruling.id)
      // the source cannot carry an empty question list; a draft with none answered drops the file
      edits.set(entry.path, /^\s*questions:/m.test(remaining) ? remaining : '')
    }
    if (ruling.entryId === undefined || !WRITES_ENTRY.includes(ruling.route)) {
      continue
    }
    const dir = dirOf(entry.path)
    const path = `${dir}/${ruling.route === 'requirement' ? 'requirements' : 'decisions'}.yaml`
    const source = sourceOf(path) ?? `version: "${ruling.route === 'requirement' ? 1 : 2}"\n`
    // the session is the only caller, so the owner authored the answer and the entry is ruled;
    // an autonomous agent's answer would enter delegated (d-k85itgcv)
    edits.set(
      path,
      appendItem(source, ruling.route === 'requirement' ? 'requirements' : 'decisions', [
        { key: 'id', value: ruling.entryId, plain: true },
        { key: 'title', value: entry.text.trim().split('\n')[0] },
        { key: 'statement', value: ruling.answer.endsWith('\n') ? ruling.answer : `${ruling.answer}\n` },
        ...(ruling.route === 'decision' ? [{ key: 'status', value: 'accepted', plain: true }] : []),
      ]),
    )
  }

  return [...edits].map(([path, content]) => ({ path, content }))
}
