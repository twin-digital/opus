import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { openSession } from '../src/session/model.js'
import { renderSecret, renderSelectDraft, renderSession, renderTextEntry } from '../src/session/render.js'

import type { Citations } from '../src/session/citations.js'
import type { OpenEntry } from '../src/session/entries.js'
import type { SessionHeader } from '../src/session/model.js'

/**
 * The render is diffed against `/design-process/ratify-screen@1`, the authored surface the model
 * binds (d-9zot40jn). `test/fixtures` carries a copy of the pool's file, its `mock:` frames
 * verbatim. What the surface commits to is arrangement, the order of things within a region, and
 * the form of each field; what it leaves to the implementer — column widths, the rule and
 * separator glyphs, the selection marker, the truncation width, colour — is what this comparison
 * normalises away (d-q50z7iq1).
 */
const SURFACE = parse(
  readFileSync(join(import.meta.dirname, 'fixtures/surfaces/design-process/ratify-screen.1.yaml'), 'utf8'),
) as { mock: Record<string, string> }

const VIEWPORT = { rows: 40, columns: 86 }

const squeeze = (line: string): string => line.trim().replace(/\s+/g, ' ')

const isRule = (line: string): boolean => /^─+$/.test(line.trim()) && line.trim().length > 2

/** The two panes and the header, with the widths and the glyphs taken out. */
const shape = (lines: string[]) => {
  const rule = lines.findIndex(isRule)
  const left: string[] = []
  const right: string[] = []
  for (const line of lines.slice(rule + 1)) {
    const bar = line.indexOf('│')
    const inList = bar === -1 ? line : line.slice(0, bar)
    const inPane = bar === -1 ? '' : line.slice(bar + 1)
    if (inList.trim() !== '') {
      left.push(squeeze(inList))
    }
    if (inPane.trim() !== '') {
      right.push(squeeze(inPane))
    }
  }
  const paneRule = right.findIndex(isRule)
  return {
    header: lines
      .slice(0, rule)
      .filter((line) => line.trim() !== '')
      .map(squeeze),
    list: left,
    heading: right[0],
    statement: squeeze((paneRule === -1 ? right.slice(1) : right.slice(1, paneRule)).join(' ')),
    metadata: paneRule === -1 ? [] : right.slice(paneRule + 1),
  }
}

const HEADER: SessionHeader = {
  product: 'increment-process',
  increment: 'wip-001-ratify-view',
  branch: 'plan/increment-process/ratify-view',
  pullRequest: 197,
  alsoChanged: [
    { kind: 'schemas', count: 1 },
    { kind: 'surfaces', count: 1 },
    { kind: 'drafts', count: 2 },
  ],
  unresolved: 3,
}

const STATEMENT = [
  'schemas live under `schemas/` and public surfaces under `surfaces/`, identity declared in-file:',
  'schemas as JSON Schema — draft 2020-12, authored as YAML — with `$id` root-relative.',
].join(' ')

const entry = (id: string, title: string, status: OpenEntry['status']): OpenEntry => ({
  kind: 'decision',
  id,
  title,
  text: 'a statement the frame does not show.',
  increment: 'wip-001-ratify-view',
  path: 'products/increment-process/increments/wip-001-ratify-view/decisions.yaml',
  status,
})

const ENTRIES: OpenEntry[] = [
  {
    ...entry('d-qwquvf78', 'the contract pools are schemas and surfaces', 'proposed'),
    text: STATEMENT,
    pinned: { reason: 'data-format' },
    because: ['r-j232vwp4', 'r-gq90gngs'],
    supersedes: 'd-3wjypyx6',
  },
  entry('d-0qrp80dx', 'surface identity is a per-tech header', 'accepted'),
  entry('d-pe4j25wq', 'the model is a block of the requirements source', 'deferred'),
  entry('d-9zot40jn', "the screen's shape is an authored contract, not prose", 'proposed'),
  entry('d-4xkyfjzu', 'deferring is offered beside the four rulings', 'rejected'),
]

const TITLES: Record<string, string> = {
  'r-j232vwp4': 'authored surfaces are shared and versioned',
  'r-gq90gngs': 'foundations have defined shapes and meanings',
  'd-3wjypyx6': 'the contract pools',
}

const resolve: Citations = (citation) => TITLES[citation]

const mock = (name: string): string[] => SURFACE.mock[name].split('\n').filter((line) => line.trim() !== '')

describe('the ratify render conforms to /design-process/ratify-screen@1', () => {
  const rendered = shape(renderSession(openSession(ENTRIES, HEADER), VIEWPORT, resolve))
  const authored = shape(mock('ratify'))

  it('carries the header the surface names: the draft, the other inputs, and the unresolved threads', () => {
    expect(rendered.header).toEqual(authored.header)
  })

  it('lists each entry as its title over its id, with the ruling it holds beside it', () => {
    expect(rendered.list).toEqual(authored.list)
  })

  it('heads the detail pane with the title and the id, and follows it with the statement', () => {
    expect(rendered.heading).toBe(authored.heading)
    expect(rendered.statement).toBe(authored.statement)
  })

  it('carries the pinning and the citations below the rule, each cited id shown as its title', () => {
    expect(rendered.metadata).toEqual(authored.metadata)
  })
})

describe('the one-field overlays conform to the surface', () => {
  it('renders the text-entry field as its label, a rule, and the text with the cursor at the insertion point', () => {
    const authored = mock('text-entry')
    const typed = authored[1].replace(/█$/, '')
    expect(shapeLines(renderTextEntry('rejection reason', typed, VIEWPORT))).toEqual(shapeLines(authored))
  })

  it('renders the token field with the cursor present and nothing echoed', () => {
    expect(shapeLines(renderSecret('github token', VIEWPORT))).toEqual(shapeLines(mock('secret')))
  })
})

describe('the select-draft screen conforms to the surface', () => {
  const authored = mock('select-draft')

  it('names the branch and the pull request, then one line per draft', () => {
    const rendered = renderSelectDraft(
      [
        { product: 'increment-process', increment: 'wip-001-ratify-view' },
        { product: 'minecraft-addon', increment: 'wip-002-dev-loop' },
      ],
      0,
      { branch: 'plan/increment-process/ratify-view', pullRequest: 197 },
      VIEWPORT,
    ).filter((line) => line.trim() !== '')
    expect(rendered[0]).toBe(authored[0])
    // the sentence above the list is not a field the surface names; the entries are
    expect(rendered.slice(-2).map(squeeze)).toEqual(authored.slice(-2).map(squeeze))
  })
})

/** A one-field overlay compared with the label's rule collapsed to the word before it. */
const shapeLines = (lines: string[]): string[] =>
  lines.filter((line) => line.trim() !== '').map((line) => squeeze(line.replace(/─+/g, '─')))
