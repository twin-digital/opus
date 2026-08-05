import type { SessionState } from './model.js'
import type { Ruling } from './staging.js'

export interface Viewport {
  rows: number
  columns: number
}

/** How wide the master list runs; the detail pane takes what is left. */
const LIST_WIDTH = 34
const GUTTER = ' │ '

/** The prompt each input mode puts in the footer. */
const PROMPTS: Partial<Record<SessionState['mode'], string>> = {
  reason: 'reason for rejecting: ',
  answer: 'answer: ',
  route: 'route to: (f)act  (r)equirement  (d)ecision',
  bulk: 'set every unruled decision to: (a)ccepted  (t)olerated  (g) delegated  (r)ejected',
}

const KEYS = 'j/k move · a/t/g/r rule · enter answer · b bulk · w write · l land · q quit'

/**
 * The full-screen frame: the master list of open entries down the left, each with its staged
 * ruling beside it, and the selected entry in full down the right — statement, pinning proposal,
 * what it supersedes or amends, and what it cites. Returns one string per row, unpadded.
 */
export const renderSession = (state: SessionState, viewport: Viewport): string[] => {
  const bodyRows = Math.max(viewport.rows - 4, 1)
  const detailWidth = Math.max(viewport.columns - LIST_WIDTH - GUTTER.length, 20)
  const ruled = state.entries.filter((entry) => state.staged.rulings.has(entry.id)).length
  const list = listRows(state).slice(0, bodyRows)
  const detail = detailRows(state, detailWidth).slice(state.scroll, state.scroll + bodyRows)

  const body = Array.from({ length: bodyRows }, (_, row) =>
    `${(list[row] ?? '').padEnd(LIST_WIDTH)}${GUTTER}${detail[row] ?? ''}`.trimEnd(),
  )
  return [
    `design-process increment — ${state.entries.length} open, ${ruled} ruled`,
    '─'.repeat(viewport.columns),
    ...body,
    '─'.repeat(viewport.columns),
    footer(state),
  ]
}

const footer = (state: SessionState): string => {
  const prompt = PROMPTS[state.mode]
  if (state.message !== undefined) {
    return `! ${state.message}`
  }
  if (prompt === undefined) {
    return KEYS
  }
  return state.mode === 'route' || state.mode === 'bulk' ? prompt : `${prompt}${state.input}`
}

/** One row per open entry, its staged ruling beside it (d-9g0poz7v). */
const listRows = (state: SessionState): string[] =>
  state.entries.map((entry, index) => {
    const marker = index === state.selected ? '›' : ' '
    return `${marker} ${entry.id}  ${stagedLabel(state.staged.rulings.get(entry.id))}`
  })

const stagedLabel = (ruling: Ruling | undefined): string => {
  if (ruling === undefined) {
    return '—'
  }
  return ruling.kind === 'decision' ? ruling.status : `answered → ${ruling.route}`
}

const detailRows = (state: SessionState, width: number): string[] => {
  const entry = state.entries.at(state.selected)
  if (entry === undefined) {
    return ['nothing is open in this draft']
  }
  const head = [`${entry.id} — ${entry.title ?? '(untitled)'}`, `${entry.kind} · ${entry.increment}`]
  if (entry.pinned !== undefined && entry.pinned !== false) {
    head.push(`pinned: ${entry.pinned.reason}${entry.pinned.notes ? ` — ${entry.pinned.notes}` : ''}`)
  }
  if (entry.pinned === false) {
    head.push('pinned: no')
  }
  if (entry.supersedes !== undefined) {
    head.push(`supersedes ${entry.supersedes}`)
  }
  if (entry.because && entry.because.length > 0) {
    head.push(`because ${entry.because.join(', ')}`)
  }
  if (entry.route !== undefined) {
    head.push(`answers to a ${entry.route}`)
  }
  return [...head, '', ...entry.text.split('\n')].flatMap((line) => wrap(line, width))
}

/** Wrap one source line to the pane, breaking on spaces where it can. */
const wrap = (line: string, width: number): string[] => {
  if (line.length <= width) {
    return [line]
  }
  const rows: string[] = []
  let rest = line
  while (rest.length > width) {
    const space = rest.lastIndexOf(' ', width)
    const cut = space > 0 ? space : width
    rows.push(rest.slice(0, cut))
    rest = rest.slice(space > 0 ? cut + 1 : cut)
  }
  rows.push(rest)
  return rows
}
