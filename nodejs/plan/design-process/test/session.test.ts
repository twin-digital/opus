import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { collectOpenEntries } from '../src/session/entries.js'
import { canLand, openSession, reduce } from '../src/session/model.js'
import { renderSession } from '../src/session/render.js'
import { applyStaged, emptyStaging, setRemaining, stageRuling, stagingProblems } from '../src/session/staging.js'
import { DirTree } from '../src/tree.js'

import { demoProduct, makeRepo, removeRepo, yaml } from './helpers.js'

import type { OpenEntry } from '../src/session/entries.js'
import type { SessionState } from '../src/session/model.js'
import type { Files } from './helpers.js'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    removeRepo(root)
  }
})

const DRAFT = 'products/demo/increments/wip-001-a-draft'
const LONG = Array.from({ length: 40 }, (_, line) => `statement line ${line}`).join('\n')

const draftFiles = (): Files => {
  const files = demoProduct()
  files[`${DRAFT}/decisions.yaml`] = yaml({
    version: '2',
    decisions: [
      {
        id: 'd-11111111',
        title: 'first choice',
        statement: `${LONG}\n`,
        status: 'proposed',
        pinned: { reason: 'public-api', notes: 'the shape a consumer resolves' },
        because: ['r-aaaaaaaa', 'd-bbbbbbbb'],
        supersedes: 'd-bbbbbbbb',
      },
      { id: 'd-22222222', title: 'second choice', statement: 'the second way.\n', status: 'proposed' },
      { id: 'd-33333333', title: 'already ruled', statement: 'the settled way.\n', status: 'accepted' },
    ],
  })
  files[`${DRAFT}/questions.yaml`] = yaml({
    version: '1',
    questions: [{ id: 'q-11111111', question: 'how fast is fast enough?\n', answer: 'fact' }],
  })
  return files
}

const draftRepo = (): { root: string; tree: DirTree } => {
  const made = makeRepo(draftFiles())
  roots.push(made.root)
  return made
}

const entries = (): OpenEntry[] => collectOpenEntries(draftRepo().tree, 'demo')

const press = (state: SessionState, ...keys: string[]): SessionState =>
  keys.reduce((current, name) => reduce(current, { name }), state)

const frame = (state: SessionState): string => renderSession(state, { rows: 24, columns: 100 }).join('\n')

describe('the master list carries every open entry — r-ax84j1s2, d-9g0poz7v', () => {
  it('collects the proposed decisions and the open questions, and nothing settled', () => {
    expect(entries().map((entry) => entry.id)).toEqual(['d-11111111', 'd-22222222', 'q-11111111'])
  })

  it("carries each entry's detail: statement, pinning, closure, and citations", () => {
    const first = entries()[0]
    expect(first.text).toContain('statement line 39')
    expect(first.pinned).toEqual({ reason: 'public-api', notes: 'the shape a consumer resolves' })
    expect(first.supersedes).toBe('d-bbbbbbbb')
    expect(first.because).toEqual(['r-aaaaaaaa', 'd-bbbbbbbb'])
    expect(entries()[2].route).toBe('fact')
  })

  it('lists every entry beside the selected one in full', () => {
    const rendered = frame(openSession(entries()))
    for (const id of ['d-11111111', 'd-22222222', 'q-11111111']) {
      expect(rendered).toContain(id)
    }
    expect(rendered).toContain('public-api')
    expect(rendered).toContain('supersedes d-bbbbbbbb')
  })

  it('moves the pane with the selection', () => {
    const moved = press(openSession(entries()), 'down')
    expect(moved.selected).toBe(1)
    expect(frame(moved)).toContain('the second way.')
  })

  it('scrolls an entry taller than the pane rather than truncating it', () => {
    const short = renderSession(openSession(entries()), { rows: 12, columns: 100 }).join('\n')
    expect(short).toContain('statement line 0')
    expect(short).not.toContain('statement line 39')
    const scrolled = renderSession(press(openSession(entries()), 'pagedown'), { rows: 12, columns: 100 }).join('\n')
    expect(scrolled).not.toContain('statement line 0')
  })

  it('shows each staged ruling beside its entry in the list', () => {
    const ruled = reduce(openSession(entries()), { name: 'a' })
    expect(frame(ruled)).toMatch(/d-11111111.*accepted/)
  })
})

describe('rulings stage and write nothing — d-ovlyaoht', () => {
  it('leaves the sources untouched while rulings are taken', () => {
    const { root, tree } = draftRepo()
    const before = readFileSync(join(root, `${DRAFT}/decisions.yaml`), 'utf8')
    const open = collectOpenEntries(tree, 'demo')
    stageRuling(emptyStaging(), { kind: 'decision', id: open[0].id, status: 'accepted' })
    expect(readFileSync(join(root, `${DRAFT}/decisions.yaml`), 'utf8')).toBe(before)
  })

  it('refuses a rejection with no reason', () => {
    const open = entries()
    const staged = stageRuling(emptyStaging(), { kind: 'decision', id: 'd-11111111', status: 'rejected' })
    expect(stagingProblems(staged, open).join(' ')).toContain('d-11111111')
  })

  it('refuses a routed answer with no entry', () => {
    const open = entries()
    const staged = stageRuling(emptyStaging(), {
      kind: 'question',
      id: 'q-11111111',
      answer: 'it is a decision.',
      route: 'decision',
    })
    expect(stagingProblems(staged, open).join(' ')).toContain('q-11111111')
  })

  it('accepts a rejection carrying its reason and a fact-routed answer', () => {
    const open = entries()
    let staged = stageRuling(emptyStaging(), {
      kind: 'decision',
      id: 'd-11111111',
      status: 'rejected',
      rejectionReason: 'it costs more than it buys.',
    })
    staged = stageRuling(staged, { kind: 'question', id: 'q-11111111', answer: 'measured at 12ms.', route: 'fact' })
    expect(stagingProblems(staged, open)).toEqual([])
  })

  it('applies the staged set to the draft sources in one pass', () => {
    const { root, tree } = draftRepo()
    const open = collectOpenEntries(tree, 'demo')
    let staged = stageRuling(emptyStaging(), { kind: 'decision', id: 'd-11111111', status: 'accepted' })
    staged = stageRuling(staged, {
      kind: 'decision',
      id: 'd-22222222',
      status: 'rejected',
      rejectionReason: 'the simpler way wins.',
    })
    staged = stageRuling(staged, {
      kind: 'question',
      id: 'q-11111111',
      answer: 'the owner rules the limit.',
      route: 'requirement',
      entryId: 'r-99999999',
    })
    const edits = applyStaged((path) => readFileSync(join(root, path), 'utf8'), open, staged)
    const byPath = new Map(edits.map((edit) => [edit.path, edit.content]))
    expect(byPath.get(`${DRAFT}/decisions.yaml`)).toContain('status: accepted')
    expect(byPath.get(`${DRAFT}/decisions.yaml`)).toContain('the simpler way wins.')
    expect(byPath.get(`${DRAFT}/requirements.yaml`)).toContain('r-99999999')
    expect(byPath.get(`${DRAFT}/questions.yaml`)).not.toContain('q-11111111')
  })
})

describe('the bulk action is the secondary path — d-9g0poz7v', () => {
  it('sets every unruled decision and leaves the rulings already taken', () => {
    const open = entries()
    const staged = setRemaining(
      stageRuling(emptyStaging(), { kind: 'decision', id: 'd-11111111', status: 'accepted' }),
      open,
      'delegated',
    )
    expect(staged.rulings.get('d-11111111')).toMatchObject({ status: 'accepted' })
    expect(staged.rulings.get('d-22222222')).toMatchObject({ status: 'delegated' })
  })

  it('leaves questions alone, since an answer is not a status', () => {
    const staged = setRemaining(emptyStaging(), entries(), 'delegated')
    expect(staged.rulings.has('q-11111111')).toBe(false)
  })
})

describe('landing is offered only when nothing is open — d-gf6x5jzy', () => {
  it('withholds it while an entry is unruled', () => {
    expect(canLand(openSession(entries()))).toBe(false)
  })

  it('offers it once every entry is ruled', () => {
    const open = entries()
    let state = openSession(open)
    state = { ...state, staged: setRemaining(state.staged, open, 'accepted') }
    state = {
      ...state,
      staged: stageRuling(state.staged, {
        kind: 'question',
        id: 'q-11111111',
        answer: 'measured at 12ms.',
        route: 'fact',
      }),
    }
    expect(canLand(state)).toBe(true)
  })

  it('opens on ratify when a draft carries anything proposed or unanswered', () => {
    expect(openSession(entries()).mode).toBe('ratify')
  })
})
