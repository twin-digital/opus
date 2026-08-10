import { citationLine } from './citations.js'
import { closes } from './entries.js'
import { openList } from './model.js'
import { effectiveStatus } from './staging.js'

import type { Citations } from './citations.js'
import type { OpenEntry } from './entries.js'
import type { PaneExtent, SessionHeader, SessionState } from './model.js'
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
/** The pane's edge markers, standing for the content above and below what it shows. The glyphs are the implementer's. */
const MORE_ABOVE = '⌃'
const MORE_BELOW = '⌄'

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
 * (`/design-process/ratify-screen@4`).
 */
export const renderSession = (state: SessionState, viewport: Viewport, resolve: Citations): string[] => {
  const prompt = PROMPTS[state.mode]
  if (prompt !== undefined) {
    return renderTextEntry(prompt, state.mode === 'route' || state.mode === 'bulk' ? undefined : state.input, viewport)
  }
  return renderRatify(state, viewport, resolve)
}

/**
 * The header every mode carries: the draft, and what the list does not hold (d-kjwswmro). It holds
 * two rows whatever it carries, so the body below it sits at the same offset in every draft and on
 * every entry (d-ozagogc7).
 */
export const renderHeader = (header: SessionHeader): string[] => [
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

/** Rows one entry takes in the list: the title, the id, and the blank that separates it. */
const ENTRY_ROWS = 3

/** The first list row to show, so the selected entry sits inside the pane. */
const listTop = (selected: number, bodyRows: number): number =>
  Math.max(Math.min(selected * ENTRY_ROWS, (selected + 1) * ENTRY_ROWS - bodyRows), 0)

/** The rule between the header and the body, naming the open list and how many entries it holds. */
const bodyRule = (state: SessionState, columns: number): string => {
  const label = `${RULE.repeat(2)} ${state.list} (${openList(state).length}) `
  return `${label}${RULE.repeat(Math.max(columns - label.length, 1))}`
}

/** How tall the body runs and how wide the pane beside the list is, for one viewport. */
const geometry = (state: SessionState, viewport: Viewport) => ({
  bodyRows: Math.max(viewport.rows - renderHeader(state.header).length - 2, 1),
  detailWidth: Math.max(viewport.columns - LIST_WIDTH - GUTTER.length, 20),
})

/** What the pane and its content come to, so paging can stop at the content's last row (r-tb9nctcr). */
export const measurePane = (state: SessionState, viewport: Viewport, resolve: Citations): PaneExtent => {
  const { bodyRows, detailWidth } = geometry(state, viewport)
  return { rows: bodyRows, content: detailRows(state, detailWidth, resolve).length }
}

/** The pane's edge markers: content above sits on its first row, content below on its last (r-tb9nctcr). */
const withMarkers = (rows: string[], width: number, above: boolean, below: boolean): string[] => {
  const marked = [...rows]
  const put = (at: number, glyph: string) => {
    marked[at] = `${truncate(marked[at] ?? '', width - 1).padEnd(width - 1)}${glyph}`
  }
  if (above) {
    put(0, MORE_ABOVE)
  }
  if (below) {
    put(rows.length - 1, MORE_BELOW)
  }
  return marked
}

const renderRatify = (state: SessionState, viewport: Viewport, resolve: Citations): string[] => {
  const header = renderHeader(state.header)
  const { bodyRows, detailWidth } = geometry(state, viewport)
  const top = listTop(state.selected, bodyRows)
  const list = listRows(state).slice(top, top + bodyRows)
  const rows = detailRows(state, detailWidth, resolve)
  const scroll = Math.min(state.scroll, Math.max(rows.length - bodyRows, 0))
  const detail = withMarkers(
    rows.slice(scroll, scroll + bodyRows),
    detailWidth,
    scroll > 0,
    scroll + bodyRows < rows.length,
  )
  const body = Array.from({ length: bodyRows }, (_, row) =>
    `${(list[row] ?? '').padEnd(LIST_WIDTH)}${GUTTER}${detail[row] ?? ''}`.trimEnd(),
  )
  return [...header, bodyRule(state, viewport.columns), ...body, footer(state)].map((row) =>
    truncate(row, viewport.columns),
  )
}

/** The last row: what the last refused action said, or the keys the mode takes. */
const footer = (state: SessionState): string =>
  state.message ??
  (state.list === 'decisions' ?
    '(a)ccept (t)olerate (g) delegate (r)eject (d)efer · (n)ote (b)ulk · tab · (w)rite (l)and (q)uit'
  : '(n)ote · tab · (w)rite (l)and (q)uit')

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

/** Two lines per entry: the title, then the id with its closure field and whatever ruling it holds. */
const listRows = (state: SessionState): string[] =>
  openList(state).flatMap((entry, index) => {
    const marker = index === state.selected ? '›' : ' '
    const ruling = stagedLabel(state, entry)
    const room = Math.max(LIST_WIDTH - ruling.length, 1)
    // the closure id elides where a ruling shares the row, so the two never run together
    const left = truncate(` ${entry.id}${closureField(entry)}`, ruling === '' ? room : room - 1)
    return [`${marker}${truncate(entry.title ?? entry.id, LIST_WIDTH - 1)}`, `${left.padEnd(room)}${ruling}`, '']
  })

/** What the entry closes, or what closed it; an entry that is both carries the closing mark (d-g00ah4em). */
const closureField = (entry: OpenEntry): string => {
  // a retirement names no successor; "retired" is what marks it (d-ko3lggbr)
  if (entry.kind === 'retirement') {
    return ''
  }
  const closed = closes(entry)
  if (closed !== undefined) {
    return `  closes ${closed}`
  }
  return entry.closedBy === undefined ? '' : `  closed by ${entry.closedBy}`
}

const stagedLabel = (state: SessionState, entry: OpenEntry): string => {
  // "retired" stands where a staged ruling stands (d-ko3lggbr)
  if (entry.kind === 'retirement') {
    return 'retired'
  }
  if (entry.kind === 'question') {
    const ruling = state.staged.rulings.get(entry.id)
    return ruling?.kind === 'question' ? `answered → ${ruling.route}` : ''
  }
  // a requirement and a model binding have no status to leave (d-26vs308h)
  if (entry.kind !== 'decision') {
    return ''
  }
  const status = effectiveStatus(state.staged, entry)
  return status === undefined || status === 'proposed' ? '' : status
}

/** One logical line of the pane and the indent its continuations take (r-gzyfme0f). */
interface Block {
  text: string
  hang: number
}

const flow = (blocks: Block[], width: number): string[] =>
  blocks.flatMap((block) => (block.text === '' ? [''] : wrap(block.text, width, block.hang)))

const indent = (blocks: Block[], by: number): Block[] =>
  blocks.map((block) => (block.text === '' ? block : { text: `${' '.repeat(by)}${block.text}`, hang: block.hang + by }))

const detailRows = (state: SessionState, width: number, resolve: Citations): string[] => {
  const entry = openList(state).at(state.selected)
  if (entry === undefined) {
    return ['this list holds no entry']
  }
  const metadata = metadataBlocks(state, entry, resolve)
  return flow(
    [
      { text: `${(entry.title ?? entry.id).toUpperCase()} [${entry.id}]`, hang: 0 },
      { text: '', hang: 0 },
      ...reflow(entry.text),
      ...requirementBlocks(entry),
      ...(metadata.length === 0 ? [] : [{ text: '', hang: 0 }, { text: RULE.repeat(width), hang: 0 }, ...metadata]),
    ],
    width,
  ).map((row) => truncate(row, width))
}

/** The rationale and the verification a requirement carries and a decision does not. */
const requirementBlocks = (entry: OpenEntry): Block[] => {
  const blocks: Block[] = []
  if (entry.rationale !== undefined && entry.rationale.trim() !== '') {
    blocks.push({ text: '', hang: 0 }, { text: 'why it matters:', hang: 0 }, ...indent(reflow(entry.rationale), 2))
  }
  const steps = entry.verification ?? []
  if (steps.length > 0) {
    blocks.push(
      { text: '', hang: 0 },
      { text: 'verification:', hang: 0 },
      ...steps.map((step) => {
        const [key, value] = Object.entries(step)[0]
        return { text: `  - ${key}: ${value}`, hang: 4 }
      }),
    )
  }
  return blocks
}

/** The pinning proposal, then the citations, each cited id shown as the title it resolves to (d-mhlya385). */
const metadataBlocks = (state: SessionState, entry: OpenEntry, resolve: Citations): Block[] => {
  const blocks: Block[] = []
  if (entry.pinned !== undefined && entry.pinned !== false) {
    const notes = entry.pinned.notes === undefined ? '' : `: ${entry.pinned.notes.trim()}`
    blocks.push({ text: `pinned(${entry.pinned.reason})${notes}`, hang: 2 })
  }
  // the retirement's own reason, beside the statement it recovered from the fold (d-ko3lggbr)
  if (entry.kind === 'retirement' && entry.reason !== undefined) {
    blocks.push({ text: `retired: ${entry.reason.trim()}`, hang: 2 })
  }
  if (entry.kind === 'binding') {
    blocks.push({ text: `contract: ${entry.reference}`, hang: 2 })
    if (entry.bindingStatus !== undefined) {
      blocks.push({ text: `status: ${entry.bindingStatus}`, hang: 2 })
    }
  }
  const group = (label: string, lines: string[]) => {
    if (lines.length > 0) {
      blocks.push(
        ...(blocks.length > 0 ? [{ text: '', hang: 0 }] : []),
        { text: `${label}:`, hang: 0 },
        ...lines.map((line) => ({ text: `  - ${line}`, hang: 4 })),
      )
    }
  }
  group(
    'because',
    (entry.because ?? []).map((citation) => citationLine(citation, resolve)),
  )
  group('supersedes', entry.supersedes === undefined ? [] : [citationLine(entry.supersedes, resolve)])
  group('amends', entry.amends === undefined ? [] : [citationLine(entry.amends, resolve)])
  // a question's answer names the kind it routes to rather than an entry, so it is not resolved
  group('answers', entry.route === undefined ? [] : [entry.route])
  group(
    'note',
    [state.staged.notes.get(entry.id) ?? ''].filter((note) => note !== ''),
  )
  return blocks
}

/** A markdown-style list item, which begins its own block and keeps its marker (r-4xa4kazt). */
const LIST_ITEM = /^(\s*(?:[-*+]|\d+[.)])\s+)/

/**
 * A statement reflowed to the pane: the source's line breaks within a block are joined, so the
 * pane's width sets the line length. A blank line, a list item, and an indented block each begin a
 * block, and an indented block is held as written (r-4xa4kazt).
 */
const reflow = (text: string): Block[] => {
  const blocks: Block[] = []
  let paragraph: string[] = []
  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ text: paragraph.join(' '), hang: 0 })
      paragraph = []
    }
  }
  for (const line of text.trim().split('\n')) {
    const item = LIST_ITEM.exec(line)
    if (line.trim() === '') {
      flush()
      blocks.push({ text: '', hang: 0 })
    } else if (item !== null) {
      flush()
      blocks.push({ text: line, hang: item[1].length })
    } else if (/^\s/.test(line)) {
      flush()
      blocks.push({ text: line, hang: line.length - line.trimStart().length })
    } else {
      paragraph.push(line.trim())
    }
  }
  flush()
  return blocks
}

/** Wrap one logical line to the pane, breaking on spaces where it can; continuations hang (r-gzyfme0f). */
const wrap = (line: string, width: number, hang = 0): string[] => {
  const pad = ' '.repeat(hang)
  const rows: string[] = []
  let rest = line
  let limit = width
  while (rest.length > limit) {
    const space = rest.lastIndexOf(' ', limit)
    const cut = space > 0 ? space : limit
    rows.push(`${rows.length === 0 ? '' : pad}${rest.slice(0, cut)}`)
    rest = rest.slice(space > 0 ? cut + 1 : cut)
    limit = Math.max(width - hang, 8)
  }
  return [...rows, `${rows.length === 0 ? '' : pad}${rest}`]
}
