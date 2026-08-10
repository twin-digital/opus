import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { openSession, reduce } from '../src/session/model.js'
import { renderSecret, renderSelectDraft, renderSession, renderTextEntry } from '../src/session/render.js'

import type { Citations } from '../src/session/citations.js'
import type { OpenEntry } from '../src/session/entries.js'
import type { SessionHeader, SessionState } from '../src/session/model.js'

/**
 * The render is diffed against `/design-process/ratify-screen@4`, the version the product's model
 * binds; every version of that surface is read the same way (d-smnssz39, d-q50z7iq1).
 * `test/fixtures` carries a copy of the pool's file, its `mock:` frames verbatim. What the surface
 * commits to is arrangement, the order of things within a region, and the form of each field; what
 * it leaves to the implementer — column widths, the rule and separator glyphs, the selection
 * marker, the truncation width, where a block wraps, colour — is what this comparison normalises
 * away.
 */
const SURFACE = parse(
  readFileSync(join(import.meta.dirname, 'fixtures/surfaces/design-process/ratify-screen.4.yaml'), 'utf8'),
) as { mock: Record<string, string> }

// wide enough to hold the mocks, whose rows run past the 95 their own rules declare
const VIEWPORT = { rows: 40, columns: 100 }

const squeeze = (line: string): string => line.trim().replace(/\s+/g, ' ')

/** A rule with its glyph run collapsed, since the frame's width is the implementer's. */
const collapsed = (line: string): string => squeeze(line.replace(/─+/g, '─'))

const isPaneRule = (line: string): boolean => /^─+$/.test(line.trim()) && line.trim().length > 2

/** The ids a closure names are the draft's; the field's form is what the surface fixes. */
const closure = (row: string): string => row.replace(/ {2}(closes|closed by) \S+/, '  $1 <id>')

/**
 * A pane row with its edge marker taken off. The surface's `more-follows` notes make a render at a
 * viewport other than a mock's differ from that mock in this field alone and stay conformant.
 */
const unmarked = (row: string): string => row.replace(/\s[⌃⌄]\s*$/, '')

/** The labels that begin a logical line of the pane; anything else continues the one above. */
const STARTS =
  /^(?:- |why it matters:|verification:|because:|supersedes:|amends:|answers:|note:|contract:|status:|retired:|pinned\()/

/** Fold a block back to its logical lines, since where the pane wraps follows its width. */
const unwrap = (rows: string[]): string[] =>
  rows.reduce<string[]>((lines, row) => {
    if (lines.length === 0 || STARTS.test(row)) {
      lines.push(row)
    } else {
      lines[lines.length - 1] += ` ${row}`
    }
    return lines
  }, [])

/** The two panes, the header, and the rule that names the open list, with the widths taken out. */
const shape = (lines: string[]) => {
  const rule = lines.findIndex((line) => line.startsWith('─'))
  const left: string[] = []
  const right: string[] = []
  for (const line of lines.slice(rule + 1)) {
    const bar = line.indexOf('│')
    const inList = bar === -1 ? line : line.slice(0, bar)
    const inPane = bar === -1 ? '' : line.slice(bar + 1)
    if (inList.trim() !== '') {
      left.push(squeeze(closure(inList)))
    }
    if (inPane.trim() !== '') {
      right.push(squeeze(unmarked(inPane)))
    }
  }
  // the heading runs on where the pane cannot hold the id beside the title
  const heading = /^\[.+\]$/.test(right[1] ?? '') ? `${right[0]} ${right[1]}` : right[0]
  const rest = right.slice(/^\[.+\]$/.test(right[1] ?? '') ? 2 : 1)
  const paneRule = rest.findIndex(isPaneRule)
  return {
    header: lines
      .slice(0, rule)
      .filter((line) => line.trim() !== '')
      .map(squeeze),
    rule: collapsed(lines[rule]),
    list: left,
    heading,
    body: unwrap(paneRule === -1 ? rest : rest.slice(0, paneRule)),
    metadata: paneRule === -1 ? [] : unwrap(rest.slice(paneRule + 1)),
  }
}

const HEADER: SessionHeader = {
  product: 'increment-process',
  increment: 'wip-001-the-review-session',
  branch: 'plan/increment-process/the-review-session',
  pullRequest: 214,
  alsoChanged: [{ kind: 'surfaces', count: 1 }],
  unresolved: 1,
}

const DRAFT = 'wip-001-the-review-session'
const DECISIONS = `products/increment-process/increments/${DRAFT}/decisions.yaml`
const REQUIREMENTS = `products/increment-process/increments/${DRAFT}/requirements.yaml`

const decision = (id: string, title: string, over: Partial<OpenEntry> = {}): OpenEntry => ({
  kind: 'decision',
  id,
  title,
  text: 'a statement the frame does not show.',
  increment: DRAFT,
  path: DECISIONS,
  status: 'proposed',
  ...over,
})

const requirement = (id: string, title: string, over: Partial<OpenEntry> = {}): OpenEntry => ({
  kind: 'requirement',
  id,
  title,
  text: 'a statement the frame does not show.',
  increment: DRAFT,
  path: REQUIREMENTS,
  ...over,
})

const retirement = (id: string, title: string, reason: string, path: string): OpenEntry => ({
  kind: 'retirement',
  id,
  title,
  text: 'the statement the fold at head holds for it.',
  increment: DRAFT,
  path,
  reason,
})

/**
 * The five entries the mock's rule counts: four decisions and the decision the draft retires, which
 * follows them. `d-ufuosc77` is another entry of the same draft, and is what closes `d-3n1kq8lp` —
 * the mark the second entry carries.
 */
const ENTRIES: OpenEntry[] = [
  decision('d-x1jlr7jc', 'a refused push pulls, reapplies by id, and tries again', {
    text: [
      'the commit a submit writes carries a body naming each',
      'status the set took and how many entries took it — `3',
      'accepted, 1 rejected` — in a fixed status order.',
    ].join('\n'),
    pinned: { reason: 'public-api', notes: 'the commit body every later reader of the branch sees' },
    because: ['r-clty5lqd'],
    supersedes: 'd-lqmwczg3',
  }),
  decision('d-3n1kq8lp', 'the submit reports and stops', { closedBy: 'd-ufuosc77' }),
  decision('d-nb5yg1w1', 'a submit does not end the sitting', { status: 'deferred' }),
  decision('d-26vs308h', "the draft's requirements are a second list", { status: 'accepted' }),
  retirement('d-4xkyfjzu', 'deferring is offered beside the four rulings', 'the sitting no longer defers', DECISIONS),
]

const REQUIREMENT_ENTRIES: OpenEntry[] = [
  requirement('r-0h5q1lfl', 'a settled draft is reviewed, not only a proposed one', {
    text: [
      'the ratify session opens on any draft its pull request',
      "carries, whatever statuses that draft's entries hold,",
      'and the owner reads and re-rules each of them there.',
    ].join('\n'),
    rationale: [
      "an implementation's companion carries its whole",
      'design set as delegated, so a session that opens',
      'only on proposed entries has nothing to show.',
    ].join('\n'),
    verification: [
      { do: 'open a session on a draft whose every decision carries a ruling' },
      { verify: "the draft's decisions are listed" },
    ],
    because: ['r-ax84j1s2'],
  }),
  requirement('r-n86ssoew', 'what a draft closes is legible from the list'),
  requirement('r-8s0dd2wq', "the pull request carries the owner's rulings", { amends: 'r-y9eux47d' }),
  {
    kind: 'binding',
    id: '/design-process/ratify-screen@4',
    title: 'ratify-screen',
    text: 'what the session renders',
    increment: DRAFT,
    path: REQUIREMENTS,
    reference: '/design-process/ratify-screen@4',
  },
  retirement(
    'r-pe4j25wq',
    'the model is a block of the requirements source',
    'the model moved to its own source',
    REQUIREMENTS,
  ),
]

const TITLES: Record<string, string> = {
  'r-clty5lqd': 'a submitted set of rulings leaves the remote current and says what it did',
  'd-lqmwczg3': 'the submit tallies what it ruled and pushes',
  'r-ax84j1s2': 'ruling a draft is one sitting in one place',
}

const resolve: Citations = (citation) => TITLES[citation]

const session = (): SessionState => openSession(ENTRIES, HEADER, REQUIREMENT_ENTRIES)

const mock = (name: string): string[] => SURFACE.mock[name].split('\n').filter((line) => line.trim() !== '')

const rendered = (state: SessionState) => shape(renderSession(state, VIEWPORT, resolve).slice(0, -1))

describe('the decisions frame conforms to /design-process/ratify-screen@4', () => {
  const shown = rendered(session())
  const authored = shape(mock('ratify'))

  it('carries the header the surface names: the draft, the other inputs, and the unresolved threads', () => {
    expect(shown.header).toEqual(authored.header)
  })

  it('names the open list and its count on the rule between the header and the body', () => {
    expect(shown.rule).toBe(authored.rule)
  })

  it('lists each entry as its title over its id, with its closure field and its ruling beside it', () => {
    expect(shown.list).toEqual(authored.list)
  })

  it('heads the detail pane with the title and the id, and follows it with the statement', () => {
    expect(shown.heading).toBe(authored.heading)
    expect(shown.body).toEqual(authored.body)
  })

  it('carries the pinning and the citations below the rule, each cited id shown as its title', () => {
    expect(shown.metadata).toEqual(authored.metadata)
  })
})

describe('the requirements frame conforms to /design-process/ratify-screen@4', () => {
  const shown = rendered(reduce(session(), { name: 'tab' }))
  const authored = shape(mock('requirements'))

  it('names the requirements list and its count on the rule', () => {
    expect(shown.rule).toBe(authored.rule)
  })

  it('lists the declared requirements, then the model bindings under the contracts they name', () => {
    expect(shown.list).toEqual(authored.list)
  })

  it("carries the requirement's rationale and verification between its statement and the rule", () => {
    expect(shown.heading).toBe(authored.heading)
    expect(shown.body).toEqual(authored.body)
  })

  it('carries the citations below the rule', () => {
    expect(shown.metadata).toEqual(authored.metadata)
  })
})

describe('the one-field overlays conform to the surface', () => {
  it('renders the text-entry field as its label, a rule, and the text with the cursor at the insertion point', () => {
    const authored = mock('text-entry')
    const typed = authored[1].replace(/█$/, '')
    expect(shapeLines(renderTextEntry('note', typed, VIEWPORT))).toEqual(shapeLines(authored))
  })

  it('renders the token field with the cursor present and nothing echoed', () => {
    expect(shapeLines(renderSecret('github token', VIEWPORT))).toEqual(shapeLines(mock('secret')))
  })
})

describe('the select-draft screen conforms to the surface', () => {
  const authored = mock('select-draft')

  it('names the branch and the pull request, then one line per draft', () => {
    const shown = renderSelectDraft(
      [
        { product: 'increment-process', increment: DRAFT },
        { product: 'minecraft-addon', increment: 'wip-002-dev-loop' },
      ],
      0,
      { branch: 'plan/increment-process/the-review-session', pullRequest: 214 },
      VIEWPORT,
    ).filter((line) => line.trim() !== '')
    expect(shown[0]).toBe(authored[0])
    // the sentence above the list is not a field the surface names; the entries are
    expect(shown.slice(-2).map(squeeze)).toEqual(authored.slice(-2).map(squeeze))
  })
})

/** A one-field overlay compared with the label's rule collapsed to the word before it. */
const shapeLines = (lines: string[]): string[] => lines.filter((line) => line.trim() !== '').map(collapsed)
