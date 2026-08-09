import { describe, expect, it } from 'vitest'

import { openSession, reduce } from '../src/session/model.js'
import { measurePane, renderSession } from '../src/session/render.js'

import type { Citations } from '../src/session/citations.js'
import type { OpenEntry } from '../src/session/entries.js'
import type { SessionHeader, SessionState } from '../src/session/model.js'
import type { Viewport } from '../src/session/render.js'

/** Small enough that a defect shows in a handful of rows. */
const VIEW: Viewport = { rows: 12, columns: 60 }

const HEADER: SessionHeader = {
  product: 'demo',
  increment: 'wip-001-a-draft',
  branch: 'plan/demo/a-draft',
  pullRequest: 1,
  alsoChanged: [],
  unresolved: 0,
}

const decision = (id: string, over: Partial<OpenEntry> = {}): OpenEntry => ({
  kind: 'decision',
  id,
  title: 'a choice',
  text: 'the statement.\n',
  increment: 'wip-001-a-draft',
  path: 'products/demo/increments/wip-001-a-draft/decisions.yaml',
  status: 'proposed',
  ...over,
})

const NO_TITLES: Citations = () => undefined

const open = (entries: OpenEntry[], header: SessionHeader = HEADER): SessionState => openSession(entries, header)

const press = (state: SessionState, ...keys: string[]): SessionState =>
  keys.reduce((current, name) => reduce(current, { name }), state)

const frame = (state: SessionState, view: Viewport = VIEW, resolve: Citations = NO_TITLES): string[] =>
  renderSession(state, view, resolve)

/** Where the detail pane starts: the list column plus the gutter. */
const DETAIL_AT = 35 + '  │ '.length

/** The detail column of the body rows, with the header, its rule, and the footer dropped. */
const detail = (rows: string[]): string[] =>
  rows.slice(rows.findIndex((row) => row.startsWith('──')) + 1, -1).map((row) => row.slice(DETAIL_AT))

const widest = (rows: string[]): number => Math.max(...rows.map((row) => row.length))

describe('every row fits the viewport — /design-process/ratify-screen@4', () => {
  it('clips a citation the detail pane cannot hold', () => {
    const resolve: Citations = () => 'opus workspace members sit two levels under nodejs'
    const state = open([decision('d-11111111', { because: ['f:opus-workspace-members-sit-two-levels-under-nodejs'] })])
    expect(widest(frame(state, VIEW, resolve))).toBeLessThanOrEqual(VIEW.columns)
  })

  it('clips a header line the viewport cannot hold', () => {
    const header = { ...HEADER, branch: 'plan/demo/a-very-long-branch-name-that-runs-past-the-edge' }
    expect(widest(frame(open([decision('d-11111111')], header)))).toBeLessThanOrEqual(VIEW.columns)
  })

  it('clips a pinning note the detail pane cannot hold', () => {
    const pinned = { reason: 'other', notes: 'the deployment is one unit and the restart semantics assume it' }
    expect(widest(frame(open([decision('d-11111111', { pinned })])))).toBeLessThanOrEqual(VIEW.columns)
  })
})

describe('the frame fills the viewport exactly — /design-process/ratify-screen@4', () => {
  it('emits one row per viewport row whatever the header holds', () => {
    expect(frame(open([decision('d-11111111')])).length).toBe(VIEW.rows)
  })

  it('keeps the body in place whether or not the header carries its second line — d-ozagogc7', () => {
    const withSecond = { ...HEADER, unresolved: 3 }
    const bare = frame(open([decision('d-11111111')]))
    const full = frame(open([decision('d-11111111')], withSecond))
    expect(bare.indexOf('─'.repeat(VIEW.columns))).toBe(full.indexOf('─'.repeat(VIEW.columns)))
  })
})

describe('the footer — /design-process/ratify-screen@4', () => {
  it('shows what the last refused action said', () => {
    const state = press(open([decision('d-11111111')]), 'l')
    expect(state.message).toBe('landing waits on every entry being ruled')
    expect(frame(state).at(-1)).toContain('landing waits on every entry being ruled')
  })
})

describe('the list window follows the selection — /design-process/ratify-screen@4', () => {
  const many = Array.from({ length: 10 }, (_, index) => decision(`d-${index}0000000`, { title: `choice ${index}` }))

  it('holds the selected entry once the list runs past the pane', () => {
    const state = press(open(many), 'down', 'down', 'down', 'down', 'down', 'down')
    expect(state.selected).toBe(6)
    expect(frame(state).join('\n')).toContain('choice 6')
  })
})

describe('the detail pane’s scroll — /design-process/ratify-screen@4', () => {
  it('stops at the end of the entry rather than paging past it', () => {
    const state = press(open([decision('d-11111111')]), 'pagedown', 'pagedown')
    expect(detail(frame(state)).join('').trim()).not.toBe('')
  })
})

describe('text wraps to the pane — r-gzyfme0f, r-4xa4kazt', () => {
  it('wraps a citation with its list item’s hanging indent — r-gzyfme0f', () => {
    const resolve: Citations = () => 'opus workspace members sit two levels under nodejs'
    const state = open([decision('d-11111111', { because: ['f:opus-workspace-members'] })])
    const rows = detail(frame(state, VIEW, resolve)).filter((row) => row.trim() !== '')
    const first = rows.findIndex((row) => row.startsWith('  - '))
    expect(first).toBeGreaterThan(-1)
    expect(rows[first + 1]).toMatch(/^ {4}\S/)
  })

  it('reflows a statement across the line breaks its yaml carried — r-4xa4kazt', () => {
    const text = 'grinbox runs as a single long-running Node process owning\nthe HTTP server and the state store.\n'
    const state = open([decision('d-11111111', { text })])
    // wide enough that the pane holds the whole sentence, which is where the join shows
    const rows = detail(frame(state, { rows: 20, columns: 140 }, NO_TITLES))
    expect(rows.join('\n')).toContain('owning the HTTP server')
  })
})

describe('the whole of an entry’s detail is reachable — r-tb9nctcr', () => {
  /** Taller than the pane once the reflow wraps it to the pane's width. */
  const TALL = Array.from({ length: 40 }, (_, line) => `statement line ${line}`).join('\n')
  const tall = (): OpenEntry[] => [decision('d-11111111', { text: TALL })]

  /** The driver measures each frame it drew, which is what the next page reads (r-tb9nctcr). */
  const paging = (state: SessionState, ...keys: string[]): SessionState =>
    keys.reduce((current, name) => reduce({ ...current, pane: measurePane(current, VIEW, NO_TITLES) }, { name }), state)

  /** The pane's height at the test's viewport. */
  const PANE_ROWS = VIEW.rows - 2 - 2

  it('marks the pane while it holds content back', () => {
    expect(detail(frame(open(tall()))).at(-1)).toContain('⌄')
  })

  it('marks the content a page has left above the pane', () => {
    expect(detail(frame(paging(open(tall()), 'pagedown')))[0]).toContain('⌃')
  })

  it('moves by no more than the pane’s height', () => {
    expect(paging(open(tall()), 'pagedown').scroll).toBeLessThanOrEqual(PANE_ROWS)
  })

  it('brings the content’s last row into view and stops there', () => {
    const state = paging(open(tall()), ...Array.from({ length: 20 }, () => 'pagedown'))
    const rows = detail(frame(state))
    expect(rows.join('\n')).toContain('statement line 39')
    expect(rows.at(-1)).not.toContain('⌄')
  })

  it('moves the pane on the first press back', () => {
    const end = paging(open(tall()), ...Array.from({ length: 20 }, () => 'pagedown'))
    expect(detail(frame(paging(end, 'pageup')))).not.toEqual(detail(frame(end)))
  })
})
