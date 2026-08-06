import { citationLine } from './citations.js'
import { effectiveStatus } from './staging.js'

import type { Citations } from './citations.js'
import type { OpenEntry } from './entries.js'
import type { SessionHeader, SessionState } from './model.js'
import type { DraftChoice } from './target.js'

export interface Viewport {
  rows: number
  columns: number
}

/** How wide the entry list runs; the detail pane takes what is left. The width is the implementer's. */
const LIST_WIDTH = 35
const GUTTER = '  │ '
const RULE = '─'
/** The block the text-entry field puts at the insertion point. */
const CURSOR = '█'

/** The prompt each input mode puts above its field. */
const PROMPTS: Partial<Record<SessionState['mode'], string>> = {
  reason: 'rejection reason',
  answer: 'answer',
  note: 'note',
  route: 'route to: (f)act  (r)equirement  (d)ecision',
  bulk: 'set every unruled decision to: (a)ccepted  (t)olerated  (g) delegated  (r)ejected  (d)eferred',
}

/** A rule spanning the width, after whatever label precedes it. */
const ruled = (label: string, columns: number): string =>
  label === '' ? RULE.repeat(columns) : `${label} ${RULE.repeat(Math.max(columns - label.length - 1, 1))}`

/**
 * The frame the session draws, by mode: the ratify screen, the select-draft screen, and the
 * one-field overlay the input modes share. Returns one string per row, unpadded
 * (`/design-process/ratify-screen@1`).
 */
export const renderSession = (state: SessionState, viewport: Viewport, resolve: Citations): string[] => {
  const prompt = PROMPTS[state.mode]
  if (prompt !== undefined) {
    return renderTextEntry(prompt, state.mode === 'route' || state.mode === 'bulk' ? undefined : state.input, viewport)
  }
  return renderRatify(state, viewport, resolve)
}

/** The header every mode carries: the draft, and what the list does not hold (d-kjwswmro). */
export const renderHeader = (header: SessionHeader): string[] => {
  const lines = [
    [header.product, header.increment, header.branch, `#${header.pullRequest}`].join(' · '),
    [
      header.alsoChanged.length === 0 ?
        ''
      : `also changed: ${header.alsoChanged.map((input) => `${input.kind} (${input.count})`).join(', ')}`,
      header.unresolved === 0 ? '' : `${header.unresolved} unresolved`,
    ]
      .filter((part) => part !== '')
      .join('    '),
  ]
  return lines.filter((line) => line !== '')
}

/** Rows one entry takes in the list: the title, the id, and the blank that separates it. */
const ENTRY_ROWS = 3

/** The first list row to show, so the selected entry sits inside the pane. */
const listTop = (selected: number, bodyRows: number): number =>
  Math.max(Math.min(selected * ENTRY_ROWS, (selected + 1) * ENTRY_ROWS - bodyRows), 0)

const renderRatify = (state: SessionState, viewport: Viewport, resolve: Citations): string[] => {
  const header = renderHeader(state.header)
  const bodyRows = Math.max(viewport.rows - header.length - 2, 1)
  const detailWidth = Math.max(viewport.columns - LIST_WIDTH - GUTTER.length, 20)
  const top = listTop(state.selected, bodyRows)
  const list = listRows(state).slice(top, top + bodyRows)
  const rows = detailRows(state, detailWidth, resolve)
  const scroll = Math.min(state.scroll, Math.max(rows.length - bodyRows, 0))
  const detail = rows.slice(scroll, scroll + bodyRows)
  const body = Array.from({ length: bodyRows }, (_, row) =>
    `${(list[row] ?? '').padEnd(LIST_WIDTH)}${GUTTER}${detail[row] ?? ''}`.trimEnd(),
  )
  return [...header, RULE.repeat(viewport.columns), ...body, footer(state)].map((row) =>
    truncate(row, viewport.columns),
  )
}

/** The last row: what the last refused action said, or the keys the mode takes. */
const footer = (state: SessionState): string =>
  state.message ?? '(a)ccept (t)olerate (g) delegate (r)eject (d)efer · (n)ote (b)ulk · (w)rite (l)and (q)uit'

/** The one-field overlay a rejection reason, an answer, a note, and the token all use. */
export const renderTextEntry = (label: string, text: string | undefined, viewport: Viewport): string[] => [
  ruled(label, viewport.columns),
  text === undefined ? '' : `${text}${CURSOR}`,
]

/** The token field: the cursor is present and what is typed is not echoed. */
export const renderSecret = (label: string, viewport: Viewport): string[] => [ruled(label, viewport.columns), CURSOR]

/** The screen a pull request carrying more than one draft opens on (d-pm6a29v6). */
export const renderSelectDraft = (
  choices: DraftChoice[],
  selected: number,
  header: { branch: string; pullRequest: number },
  viewport: Viewport,
): string[] => [
  `${header.branch} · #${header.pullRequest}`,
  RULE.repeat(viewport.columns),
  `${choices.length} drafts on this pull request:`,
  '',
  ...choices.map((choice, index) => ` ${index === selected ? '›' : ' '}${choice.product} · ${choice.increment}`),
]

const truncate = (text: string, width: number): string => (text.length <= width ? text : `${text.slice(0, width - 1)}…`)

/** Two lines per entry: the title, then the id with whatever ruling it holds beside it. */
const listRows = (state: SessionState): string[] =>
  state.entries.flatMap((entry, index) => {
    const marker = index === state.selected ? '›' : ' '
    const ruling = stagedLabel(state, entry)
    return [
      `${marker}${truncate(entry.title ?? entry.id, LIST_WIDTH - 1)}`,
      `${` ${entry.id}`.padEnd(LIST_WIDTH - ruling.length)}${ruling}`,
      '',
    ]
  })

const stagedLabel = (state: SessionState, entry: OpenEntry): string => {
  if (entry.kind === 'question') {
    const ruling = state.staged.rulings.get(entry.id)
    return ruling?.kind === 'question' ? `answered → ${ruling.route}` : ''
  }
  const status = effectiveStatus(state.staged, entry)
  return status === undefined || status === 'proposed' ? '' : status
}

const detailRows = (state: SessionState, width: number, resolve: Citations): string[] => {
  const entry = state.entries.at(state.selected)
  if (entry === undefined) {
    return ['this draft holds no entry']
  }
  const metadata = metadataRows(state, entry, resolve)
  return [
    `${(entry.title ?? entry.id).toUpperCase()} [${entry.id}]`,
    '',
    ...entry.text
      .trim()
      .split('\n')
      .flatMap((line) => wrap(line, width)),
    ...(metadata.length === 0 ? [] : ['', RULE.repeat(width), ...metadata]),
  ].map((row) => truncate(row, width))
}

/** The pinning proposal, then the citations, each cited id shown as the title it resolves to (d-mhlya385). */
const metadataRows = (state: SessionState, entry: OpenEntry, resolve: Citations): string[] => {
  const rows: string[] = []
  if (entry.pinned !== undefined && entry.pinned !== false) {
    rows.push(`pinned(${entry.pinned.reason})${entry.pinned.notes === undefined ? '' : `: ${entry.pinned.notes}`}`)
  }
  const group = (label: string, lines: string[]) => {
    if (lines.length > 0) {
      rows.push(...(rows.length > 0 ? [''] : []), `${label}:`, ...lines.map((line) => `  - ${line}`))
    }
  }
  group(
    'because',
    (entry.because ?? []).map((citation) => citationLine(citation, resolve)),
  )
  group('supersedes', entry.supersedes === undefined ? [] : [citationLine(entry.supersedes, resolve)])
  // a question's answer names the kind it routes to rather than an entry, so it is not resolved
  group('answers', entry.route === undefined ? [] : [entry.route])
  group(
    'note',
    [state.staged.notes.get(entry.id) ?? ''].filter((note) => note !== ''),
  )
  return rows
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
