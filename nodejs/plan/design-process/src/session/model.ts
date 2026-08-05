import { emptyStaging, setRemaining, stageRuling } from './staging.js'

import type { OpenEntry, QuestionRoute } from './entries.js'
import type { DecisionStatus, Staged } from './staging.js'

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

/** The key each ruling is taken with, in ratify and in bulk alike. */
export const RULING_KEYS: Record<string, DecisionStatus | undefined> = {
  a: 'accepted',
  t: 'tolerated',
  g: 'delegated',
  r: 'rejected',
}

/** The key each route is answered with. */
const ROUTE_KEYS: Record<string, QuestionRoute | undefined> = { f: 'fact', r: 'requirement', d: 'decision' }

/** How far a page key moves; the driver's viewport is not the model's business. */
const PAGE = 8

export const openSession = (entries: OpenEntry[]): SessionState => ({
  entries,
  selected: 0,
  staged: emptyStaging(),
  mode: 'ratify',
  input: '',
  scroll: 0,
})

/** Landing is available exactly when nothing is proposed and no question is open. */
export const canLand = (state: SessionState): boolean =>
  state.entries.every((entry) => state.staged.rulings.has(entry.id))

const selected = (state: SessionState): OpenEntry | undefined => state.entries[state.selected]

const move = (state: SessionState, by: number): SessionState => {
  const selected = Math.min(Math.max(state.selected + by, 0), Math.max(state.entries.length - 1, 0))
  return { ...state, selected, scroll: 0, message: undefined }
}

const typed = (state: SessionState, key: Key): SessionState => {
  if (key.name === 'backspace') {
    return { ...state, input: state.input.slice(0, -1) }
  }
  const text = key.sequence ?? (key.name.length === 1 ? key.name : '')
  return text.length === 0 || key.ctrl ? state : { ...state, input: state.input + text }
}

/** Fold one keypress into the session. Pure — nothing here reaches the tree. */
export const reduce = (state: SessionState, key: Key): SessionState => {
  if (key.ctrl && key.name === 'c') {
    return { ...state, quit: true }
  }
  const entry = selected(state)
  switch (state.mode) {
    case 'ratify':
      return ratify(state, key, entry)
    case 'bulk':
      return bulk(state, key)
    case 'reason':
      return reason(state, key, entry)
    case 'answer':
      return answer(state, key)
    case 'route':
      return route(state, key, entry)
    default:
      return state
  }
}

const ratify = (state: SessionState, key: Key, entry: OpenEntry | undefined): SessionState => {
  switch (key.name) {
    case 'down':
    case 'j':
      return move(state, 1)
    case 'up':
    case 'k':
      return move(state, -1)
    case 'pagedown':
    case 'space':
      return { ...state, scroll: state.scroll + PAGE, message: undefined }
    case 'pageup':
      return { ...state, scroll: Math.max(state.scroll - PAGE, 0), message: undefined }
    case 'q':
    case 'escape':
      return { ...state, quit: true }
    case 'b':
      return { ...state, mode: 'bulk', message: undefined }
    case 'w':
      return { ...state, submit: 'write' }
    case 'l':
      return canLand(state) ?
          { ...state, mode: 'landing', submit: 'land' }
        : { ...state, message: 'landing waits on every entry being ruled' }
    default:
      break
  }
  if (entry === undefined) {
    return state
  }
  if (entry.kind === 'question') {
    return key.name === 'enter' || key.name === 'return' ?
        { ...state, mode: 'answer', input: '', message: undefined }
      : state
  }
  const status = RULING_KEYS[key.name]
  if (status === undefined) {
    return state
  }
  if (status === 'rejected') {
    return { ...state, mode: 'reason', input: '', message: undefined }
  }
  return {
    ...state,
    staged: stageRuling(state.staged, { kind: 'decision', id: entry.id, status }),
    message: undefined,
  }
}

const bulk = (state: SessionState, key: Key): SessionState => {
  const status = RULING_KEYS[key.name]
  if (status === undefined) {
    return { ...state, mode: 'ratify' }
  }
  return { ...state, mode: 'ratify', staged: setRemaining(state.staged, state.entries, status) }
}

const reason = (state: SessionState, key: Key, entry: OpenEntry | undefined): SessionState => {
  if (key.name === 'escape') {
    return { ...state, mode: 'ratify', input: '' }
  }
  if (key.name !== 'enter' && key.name !== 'return') {
    return typed(state, key)
  }
  if (entry === undefined || !state.input.trim()) {
    return { ...state, message: 'a rejection carries the owner’s reason' }
  }
  return {
    ...state,
    mode: 'ratify',
    input: '',
    staged: stageRuling(state.staged, {
      kind: 'decision',
      id: entry.id,
      status: 'rejected',
      rejectionReason: state.input.trim(),
    }),
  }
}

const answer = (state: SessionState, key: Key): SessionState => {
  if (key.name === 'escape') {
    return { ...state, mode: 'ratify', input: '' }
  }
  if (key.name !== 'enter' && key.name !== 'return') {
    return typed(state, key)
  }
  return state.input.trim() ?
      { ...state, mode: 'route' }
    : { ...state, message: 'an answer closes the question; type one' }
}

const route = (state: SessionState, key: Key, entry: OpenEntry | undefined): SessionState => {
  if (key.name === 'escape') {
    return { ...state, mode: 'answer' }
  }
  const chosen = ROUTE_KEYS[key.name]
  if (chosen === undefined || entry === undefined) {
    return state
  }
  return {
    ...state,
    mode: 'ratify',
    input: '',
    staged: stageRuling(state.staged, {
      kind: 'question',
      id: entry.id,
      answer: state.input.trim(),
      route: chosen,
      // a requirement- or decision-routed answer needs the id its entry will carry; the driver
      // generates it against the tree before the write, so the model leaves it unset
    }),
  }
}
