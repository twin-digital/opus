import type { OpenEntry } from './entries.js'
import type { Staged } from './staging.js'

/**
 * What the session is doing. `ratify` is the master list beside the detail pane, and is where a
 * draft carrying anything proposed or unanswered opens; the input modes are the ruling being
 * taken on the selected entry; `landing` runs the fixed sequence and is offered only when nothing
 * is proposed and no question is open (d-gf6x5jzy).
 */
export type SessionMode = 'ratify' | 'ruling' | 'reason' | 'answer' | 'route' | 'bulk' | 'landing'

export interface SessionState {
  entries: OpenEntry[]
  /** Index into `entries` of the selected row; the detail pane carries this one. */
  selected: number
  staged: Staged
  mode: SessionMode
  /** The text of the input mode in progress. */
  input: string
  /** First visible line of the detail pane, for an entry taller than the pane. */
  scroll: number
  /** Set when the session has asked to submit or to land; the driver acts on it. */
  submit?: 'write' | 'land'
  /** Set when the owner has asked to leave; an abandoned session leaves the tree untouched. */
  quit?: boolean
  /** What the last refused action said, shown in the footer. */
  message?: string
}

/** One decoded keypress. */
export interface Key {
  name: string
  ctrl?: boolean
  shift?: boolean
  sequence?: string
}

export const openSession = (_entries: OpenEntry[]): SessionState => {
  throw new Error('not implemented')
}

/** Fold one keypress into the session. Pure — nothing here reaches the tree. */
export const reduce = (_state: SessionState, _key: Key): SessionState => {
  throw new Error('not implemented')
}

/** Landing is available exactly when nothing is proposed and no question is open. */
export const canLand = (_state: SessionState): boolean => {
  throw new Error('not implemented')
}
