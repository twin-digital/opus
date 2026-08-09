import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

import { citationLine, resolveCitations } from '../src/session/citations.js'
import { collectOpenEntries, collectSessionEntries } from '../src/session/entries.js'
import { canLand, openSession, reduce } from '../src/session/model.js'
import { renderSession } from '../src/session/render.js'
import { diffRanges, draftReview, entryLine } from '../src/session/review.js'
import {
  applyStaged,
  commitBody,
  emptyStaging,
  setRemaining,
  stageNote,
  stageRuling,
  stagingProblems,
} from '../src/session/staging.js'
import { DirTree } from '../src/tree.js'

import { demoProduct, makeRepo, removeRepo, yaml } from './helpers.js'

import type { Citations } from '../src/session/citations.js'
import type { OpenEntry } from '../src/session/entries.js'
import type { SessionHeader, SessionState } from '../src/session/model.js'
import type { Files } from './helpers.js'

interface SourceEntry {
  id: string
  status?: string
  statement?: string
  rejection_reason?: string
}

const parsed = (source: string): { decisions?: SourceEntry[]; requirements?: SourceEntry[] } =>
  parseYaml(source) as { decisions?: SourceEntry[]; requirements?: SourceEntry[] }

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    removeRepo(root)
  }
})

const DRAFT = 'products/demo/increments/wip-001-a-draft'
const LONG = Array.from({ length: 40 }, (_, line) => `statement line ${line}`).join('\n')

const HEADER: SessionHeader = {
  product: 'demo',
  increment: 'wip-001-a-draft',
  branch: 'plan/demo/a-draft',
  pullRequest: 7,
  alsoChanged: [{ kind: 'facts', count: 2 }],
  unresolved: 1,
}

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
  files[`${DRAFT}/requirements.yaml`] = yaml({
    version: '1',
    requirements: [
      {
        id: 'r-11111111',
        title: 'the first rule',
        statement: 'the product does the new thing.\n',
        rationale: 'without it the owner reads yaml.\n',
        verification: [{ do: 'open a session' }, { verify: 'the requirement is listed' }],
      },
      { id: 'r-22222222', title: 'the amended rule', statement: 'the product does it faster.\n', amends: 'r-bbbbbbbb' },
    ],
    model: [{ name: 'a-screen', surface: '/demo/a-screen@1', description: 'what the screen renders' }],
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
const listed = (): OpenEntry[] => collectSessionEntries(draftRepo().tree, 'demo').decisions

const open = (list: OpenEntry[] = listed()): SessionState => openSession(list, HEADER)

const press = (state: SessionState, ...keys: string[]): SessionState =>
  keys.reduce((current, name) => reduce(current, { name }), state)

const NO_TITLES: Citations = () => undefined

const frame = (state: SessionState, resolve: Citations = NO_TITLES): string =>
  renderSession(state, { rows: 60, columns: 100 }, resolve).join('\n')

describe('the ratify list is the draft’s whole decision set — d-8abusqwe', () => {
  it('holds every decision in whatever status, and every question still open', () => {
    expect(listed().map((entry) => entry.id)).toEqual(['d-11111111', 'd-22222222', 'd-33333333', 'q-11111111'])
    expect(listed()[2].status).toBe('accepted')
  })

  it('leaves the landing’s own list to what is still unsettled', () => {
    expect(entries().map((entry) => entry.id)).toEqual(['d-11111111', 'd-22222222', 'q-11111111'])
  })

  it('re-rules an entry the draft already ruled', () => {
    const state = press(open(), 'down', 'down', 't')
    expect(state.staged.rulings.get('d-33333333')).toMatchObject({ status: 'tolerated' })
  })

  it("carries each entry's detail: statement, pinning, closure, and citations", () => {
    const first = listed()[0]
    expect(first.text).toContain('statement line 39')
    expect(first.pinned).toEqual({ reason: 'public-api', notes: 'the shape a consumer resolves' })
    expect(first.supersedes).toBe('d-bbbbbbbb')
    expect(first.because).toEqual(['r-aaaaaaaa', 'd-bbbbbbbb'])
    expect(listed()[3].route).toBe('fact')
  })

  it('lists every entry beside the selected one in full', () => {
    const rendered = frame(open())
    for (const id of ['d-11111111', 'd-22222222', 'd-33333333', 'q-11111111']) {
      expect(rendered).toContain(id)
    }
    expect(rendered).toContain('pinned(public-api): the shape a consumer resolves')
    expect(rendered).toContain('supersedes:')
  })

  it('moves the pane with the selection', () => {
    const moved = press(open(), 'down')
    expect(moved.selected).toBe(1)
    expect(frame(moved)).toContain('the second way.')
  })

  it('scrolls an entry taller than the pane rather than truncating it', () => {
    const short = renderSession(open(), { rows: 12, columns: 100 }, NO_TITLES).join('\n')
    expect(short).toContain('statement line 0')
    expect(short).not.toContain('statement line 39')
    const scrolled = renderSession(press(open(), 'pagedown'), { rows: 12, columns: 100 }, NO_TITLES).join('\n')
    expect(scrolled).not.toContain('statement line 0')
  })

  it('shows the ruling an entry stands at beside it, and nothing where it stands proposed', () => {
    expect(frame(press(open(), 'down', 'a'))).toMatch(/d-22222222\s+accepted/)
    expect(frame(open())).toMatch(/d-22222222 +│/)
    expect(frame(open())).toMatch(/d-33333333\s+accepted/)
  })
})

describe('deferring is offered beside the four rulings — d-4xkyfjzu', () => {
  it('stages a deferral from the ratify list', () => {
    expect(press(open(), 'd').staged.rulings.get('d-11111111')).toMatchObject({ status: 'deferred' })
  })

  it('treats a deferred decision as settled for the landing', () => {
    const list = listed()
    let state = open(list)
    state = { ...state, staged: setRemaining(state.staged, list, 'deferred') }
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
})

describe('a cited id is shown as the title it resolves to — d-mhlya385', () => {
  it('resolves a citation against the product’s own entries and the facts pool', () => {
    const files = draftFiles()
    files['facts/demo.yaml'] = yaml({
      version: '1',
      facts: [{ id: 'a1b2c3d4', claim: 'the login provider needs a connection\nand a second line', sources: [] }],
    })
    const made = makeRepo(files)
    roots.push(made.root)
    const resolve = resolveCitations(made.tree, 'demo')
    expect(citationLine('d-22222222', resolve)).toBe('second choice [d-22222222]')
    expect(citationLine('f:a1b2c3d4', resolve)).toBe('the login provider needs a connection [f:a1b2c3d4]')
  })

  it('shows an id that resolves to nothing as the id alone', () => {
    expect(citationLine('d-99999999', NO_TITLES)).toBe('d-99999999')
  })

  it('shows a question’s route as the word it names, unresolved', () => {
    const question = frame(press(open(), 'down', 'down', 'down'))
    expect(question).toContain('answers:')
    expect(question).toContain('- fact')
  })
})

describe('rulings stage and write nothing — d-ovlyaoht', () => {
  it('leaves the sources untouched while rulings are taken', () => {
    const { root, tree } = draftRepo()
    const before = readFileSync(join(root, `${DRAFT}/decisions.yaml`), 'utf8')
    const list = collectSessionEntries(tree, 'demo').decisions
    stageRuling(emptyStaging(), { kind: 'decision', id: list[0].id, status: 'accepted' })
    expect(readFileSync(join(root, `${DRAFT}/decisions.yaml`), 'utf8')).toBe(before)
  })

  it('refuses a rejection with no reason', () => {
    const staged = stageRuling(emptyStaging(), { kind: 'decision', id: 'd-11111111', status: 'rejected' })
    expect(stagingProblems(staged, listed()).join(' ')).toContain('d-11111111')
  })

  it('refuses a routed answer with no entry', () => {
    const staged = stageRuling(emptyStaging(), {
      kind: 'question',
      id: 'q-11111111',
      answer: 'it is a decision.',
      route: 'decision',
    })
    expect(stagingProblems(staged, listed()).join(' ')).toContain('q-11111111')
  })

  it('accepts a rejection carrying its reason and a fact-routed answer', () => {
    let staged = stageRuling(emptyStaging(), {
      kind: 'decision',
      id: 'd-11111111',
      status: 'rejected',
      rejectionReason: 'it costs more than it buys.',
    })
    staged = stageRuling(staged, { kind: 'question', id: 'q-11111111', answer: 'measured at 12ms.', route: 'fact' })
    expect(stagingProblems(staged, listed())).toEqual([])
  })

  it('applies the staged set to the draft sources, editing only the spans it ruled', () => {
    const { root, tree } = draftRepo()
    const list = collectSessionEntries(tree, 'demo').decisions
    const before = readFileSync(join(root, `${DRAFT}/decisions.yaml`), 'utf8')
    let staged = stageRuling(emptyStaging(), { kind: 'decision', id: 'd-11111111', status: 'accepted' })
    staged = stageRuling(staged, {
      kind: 'decision',
      id: 'd-22222222',
      status: 'rejected',
      rejectionReason: 'the simpler way wins: it costs less.',
    })
    staged = stageRuling(staged, {
      kind: 'question',
      id: 'q-11111111',
      answer: 'the owner rules the limit.',
      route: 'requirement',
      entryId: 'r-99999999',
    })
    const edits = applyStaged((path) => readFileSync(join(root, path), 'utf8'), list, staged)
    const byPath = new Map(edits.map((edit) => [edit.path, edit.content]))
    const decisions = byPath.get(`${DRAFT}/decisions.yaml`) ?? ''
    expect(parsed(decisions).decisions?.[0]).toMatchObject({ id: 'd-11111111', status: 'accepted' })
    expect(parsed(decisions).decisions?.[1]).toMatchObject({
      status: 'rejected',
      rejection_reason: 'the simpler way wins: it costs less.',
    })
    // the entry the sitting did not rule keeps every byte it had
    expect(decisions.split('\n').slice(-4)).toEqual(before.split('\n').slice(-4))
    expect(parsed(byPath.get(`${DRAFT}/requirements.yaml`) ?? '').requirements?.at(-1)).toMatchObject({
      id: 'r-99999999',
      statement: 'the owner rules the limit.\n',
    })
    expect(byPath.get(`${DRAFT}/questions.yaml`)).toBe('')
  })
})

describe('the submit tallies what it ruled — d-lqmwczg3', () => {
  it('names each status the set took and how many took it, in a fixed order', () => {
    let staged = setRemaining(emptyStaging(), listed(), 'accepted')
    staged = stageRuling(staged, {
      kind: 'decision',
      id: 'd-22222222',
      status: 'rejected',
      rejectionReason: 'no.',
    })
    staged = stageRuling(staged, { kind: 'question', id: 'q-11111111', answer: 'yes.', route: 'fact' })
    expect(commitBody(staged)).toBe('1 accepted, 1 rejected, 1 answered')
  })

  it('writes no commit for a sitting that changed nothing', () => {
    expect(commitBody(emptyStaging())).toBeUndefined()
  })
})

describe('a submit carrying notes posts one review — d-f1b5r2f8', () => {
  it('anchors a note to the lines of the entry it concerns', () => {
    const { root, tree } = draftRepo()
    const list = collectSessionEntries(tree, 'demo').decisions
    const source = readFileSync(join(root, `${DRAFT}/decisions.yaml`), 'utf8')
    const line = entryLine(source, 'd-22222222')
    expect(line).toBeGreaterThan(0)
    const review = draftReview(
      [{ entry: list[1], note: 'this one needs a carve-out' }],
      () => source,
      new Map([[`${DRAFT}/decisions.yaml`, [[1, 200]]]]),
    )
    expect(review?.comments).toEqual([
      { path: `${DRAFT}/decisions.yaml`, line, side: 'RIGHT', body: 'this one needs a carve-out' },
    ])
    expect(review?.body).toBe('')
  })

  it('puts a note the diff does not reach into the review body, naming the entry', () => {
    const { root, tree } = draftRepo()
    const list = collectSessionEntries(tree, 'demo').decisions
    const source = readFileSync(join(root, `${DRAFT}/decisions.yaml`), 'utf8')
    const review = draftReview([{ entry: list[1], note: 'out of the diff' }], () => source, new Map())
    expect(review?.comments).toEqual([])
    expect(review?.body).toContain('d-22222222')
  })

  it('posts nothing where the sitting left no note', () => {
    expect(draftReview([], () => '', new Map())).toBeUndefined()
  })

  it('reads the new-file line ranges the diff reaches', () => {
    const diff = [
      'diff --git a/a.yaml b/a.yaml',
      '--- a/a.yaml',
      '+++ b/a.yaml',
      '@@ -1,3 +4,5 @@ decisions:',
      ' x',
    ].join('\n')
    expect(diffRanges(diff).get('a.yaml')).toEqual([[4, 8]])
  })

  it('keeps a note against its entry, and drops it when the owner clears it', () => {
    expect(stageNote(emptyStaging(), 'd-11111111', ' a note ').notes.get('d-11111111')).toBe('a note')
    expect(stageNote(stageNote(emptyStaging(), 'd-11111111', 'x'), 'd-11111111', '  ').notes.size).toBe(0)
  })

  it('takes a note from the ratify list without ruling the entry', () => {
    const state = press(open(), 'n', 'o', 'k', 'enter')
    expect(state.staged.notes.get('d-11111111')).toBe('ok')
    expect(state.staged.rulings.size).toBe(0)
  })
})

describe('the bulk action is the secondary path — d-8abusqwe', () => {
  it('sets every unruled decision and leaves the rulings already taken', () => {
    const list = listed()
    const staged = setRemaining(
      stageRuling(emptyStaging(), { kind: 'decision', id: 'd-11111111', status: 'accepted' }),
      list,
      'delegated',
    )
    expect(staged.rulings.get('d-11111111')).toMatchObject({ status: 'accepted' })
    expect(staged.rulings.get('d-22222222')).toMatchObject({ status: 'delegated' })
    // a decision the draft already ruled is not unruled, so the bulk action leaves it
    expect(staged.rulings.has('d-33333333')).toBe(false)
  })

  it('leaves questions alone, since an answer is not a status', () => {
    expect(setRemaining(emptyStaging(), listed(), 'delegated').rulings.has('q-11111111')).toBe(false)
  })
})

describe('landing is offered only when nothing is open — d-7i1l1kfy', () => {
  it('withholds it while an entry is unruled', () => {
    expect(canLand(open())).toBe(false)
  })

  it('offers it once every entry is ruled', () => {
    const list = listed()
    let state = open(list)
    state = { ...state, staged: setRemaining(state.staged, list, 'accepted') }
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
    expect(open().mode).toBe('ratify')
  })
})

describe('a settled draft is reviewed, not only a proposed one — r-0h5q1lfl, d-4uz3egbj', () => {
  it('lists the decisions of a draft whose every entry already carries a ruling', () => {
    const files = draftFiles()
    files[`${DRAFT}/questions.yaml`] = yaml({ version: '1', questions: [] })
    files[`${DRAFT}/decisions.yaml`] = yaml({
      version: '2',
      decisions: [
        { id: 'd-44444444', title: 'delegated one', statement: 'the built way.\n', status: 'delegated' },
        { id: 'd-55555555', title: 'delegated two', statement: 'the other built way.\n', status: 'delegated' },
      ],
    })
    const made = makeRepo(files)
    roots.push(made.root)
    const lists = collectSessionEntries(made.tree, 'demo', 'wip-001-a-draft')
    const state = openSession(lists.decisions, HEADER, lists.requirements)
    expect(state.mode).toBe('ratify')
    expect(canLand(state)).toBe(true)
    expect(frame(state)).toContain('d-44444444')
    expect(frame(state)).toContain('the built way.')
  })

  it('re-rules an entry of a settled draft', () => {
    const lists = collectSessionEntries(draftRepo().tree, 'demo', 'wip-001-a-draft')
    const state = press(openSession(lists.decisions, HEADER, lists.requirements), 'down', 'down', 'r')
    expect(state.mode).toBe('reason')
  })
})

describe('the requirements list sits beside the decisions list — r-84zd8sfk, d-26vs308h', () => {
  const opened = (): SessionState => {
    const lists = collectSessionEntries(draftRepo().tree, 'demo', 'wip-001-a-draft')
    return openSession(lists.decisions, HEADER, lists.requirements)
  }

  it('holds the requirements the draft declares, then its model bindings', () => {
    expect(opened().requirements.map((entry) => entry.id)).toEqual(['r-11111111', 'r-22222222', '/demo/a-screen@1'])
  })

  it('names the open list and its count on the rule, and swaps between the two', () => {
    expect(frame(opened())).toContain('── decisions (4)')
    const swapped = press(opened(), 'tab')
    expect(swapped.list).toBe('requirements')
    expect(frame(swapped)).toContain('── requirements (3)')
  })

  it('reads a requirement in full: its statement, its rationale, and its verification', () => {
    const shown = frame(press(opened(), 'tab'))
    expect(shown).toContain('THE FIRST RULE [r-11111111]')
    expect(shown).toContain('the product does the new thing.')
    expect(shown).toContain('why it matters:')
    expect(shown).toContain('without it the owner reads yaml.')
    expect(shown).toContain('- do: open a session')
    expect(shown).toContain('- verify: the requirement is listed')
  })

  it('shows a model binding as the contract it names', () => {
    const shown = frame(press(opened(), 'tab', 'down', 'down'))
    expect(shown).toContain('what the screen renders')
    expect(shown).toContain('contract: /demo/a-screen@1')
  })

  it('takes a note on a requirement and no ruling, and leaves its source untouched', () => {
    const { root, tree } = draftRepo()
    const lists = collectSessionEntries(tree, 'demo', 'wip-001-a-draft')
    const before = readFileSync(join(root, `${DRAFT}/requirements.yaml`), 'utf8')
    let state = openSession(lists.decisions, HEADER, lists.requirements)
    state = press(state, 'tab', 'a', 't', 'n', 'o', 'k', 'enter')
    expect(state.staged.rulings.size).toBe(0)
    expect(state.staged.notes.get('r-11111111')).toBe('ok')
    // a note is not a ruling, so the staged set edits nothing
    expect(applyStaged((path) => readFileSync(join(root, path), 'utf8'), lists.decisions, state.staged)).toEqual([])
    expect(readFileSync(join(root, `${DRAFT}/requirements.yaml`), 'utf8')).toBe(before)
  })

  it('writes no commit for a submit carrying only notes', () => {
    const state = press(openSession([], HEADER, opened().requirements), 'n', 'o', 'k', 'enter')
    expect(commitBody(state.staged)).toBeUndefined()
  })
})

describe('what a draft closes is legible from the list — r-n86ssoew, d-g00ah4em', () => {
  it('tells apart an entry that closes, one that is closed, and one that does neither', () => {
    const lists = collectSessionEntries(draftRepo().tree, 'demo', 'wip-001-a-draft')
    const shown = frame(openSession(lists.decisions, HEADER, lists.requirements))
    expect(shown).toMatch(/d-11111111 {2}closes d-bbbbbbbb/)
    expect(shown).toMatch(/d-22222222 +│/)
    expect(shown).toMatch(/d-33333333 {2,}accepted/)
  })

  it('marks the entry a later one of the same draft closes', () => {
    const files = draftFiles()
    files[`${DRAFT}/decisions.yaml`] = yaml({
      version: '2',
      decisions: [
        { id: 'd-44444444', title: 'the earlier way', statement: 'the way.\n', status: 'proposed' },
        {
          id: 'd-55555555',
          title: 'the later way',
          statement: 'the better way.\n',
          status: 'proposed',
          supersedes: 'd-44444444',
        },
      ],
    })
    const made = makeRepo(files)
    roots.push(made.root)
    const lists = collectSessionEntries(made.tree, 'demo', 'wip-001-a-draft')
    const shown = frame(openSession(lists.decisions, HEADER, lists.requirements))
    expect(shown).toMatch(/d-44444444 {2}closed by d-55555555/)
    expect(shown).toMatch(/d-55555555 {2}closes d-44444444/)
  })

  it('marks a requirement by what it amends', () => {
    const lists = collectSessionEntries(draftRepo().tree, 'demo', 'wip-001-a-draft')
    const shown = frame(press(openSession(lists.decisions, HEADER, lists.requirements), 'tab'))
    expect(shown).toMatch(/r-22222222 {2}closes r-bbbbbbbb/)
  })
})
