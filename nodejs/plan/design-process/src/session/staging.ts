import type { OpenEntry, QuestionRoute } from './entries.js'

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
export const stageRuling = (_staged: Staged, _ruling: Ruling): Staged => {
  throw new Error('not implemented')
}

/**
 * The bulk action: stage `status` on every decision still unruled, leaving the rulings already
 * taken and every question alone. It is the secondary path beside the per-entry ruling.
 */
export const setRemaining = (_staged: Staged, _entries: OpenEntry[], _status: DecisionStatus): Staged => {
  throw new Error('not implemented')
}

/**
 * What the sources could not carry — a rejection with no reason, a routed answer with no entry.
 * Staging refuses these, so a submitted set validates.
 */
export const stagingProblems = (_staged: Staged, _entries: OpenEntry[]): string[] => {
  throw new Error('not implemented')
}

/**
 * The edits the staged set makes to the draft's own sources: each ruled decision takes its status,
 * each answered question leaves the questions source, and a requirement- or decision-routed answer
 * enters the draft as a new entry carrying its generated id. The caller writes and commits them in
 * one write.
 */
export const applyStaged = (_read: (path: string) => string, _entries: OpenEntry[], _staged: Staged): SourceEdit[] => {
  throw new Error('not implemented')
}
