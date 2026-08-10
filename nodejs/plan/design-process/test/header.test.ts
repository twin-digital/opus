import { execFileSync } from 'node:child_process'

import { afterEach, describe, expect, it } from 'vitest'

import { readHeader } from '../src/session/header.js'
import { renderHeader } from '../src/session/render.js'

import { demoProduct, makeRepo, removeRepo, writeFiles, yaml } from './helpers.js'

import type { CommandRunner } from '../src/land.js'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    removeRepo(root)
  }
})

const PULL_REQUEST = { owner: 'twin-digital', repo: 'plan-opus', number: 197 }

const git = (root: string, ...args: string[]): string =>
  execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

/** A repo whose branch adds a fact, a surface, and a second draft over its merge-base. */
const branchedRepo = (): string => {
  const made = makeRepo(demoProduct())
  roots.push(made.root)
  const { root } = made
  git(root, 'init', '-q', '-b', 'main')
  git(root, 'config', 'user.email', 'test@example.test')
  git(root, 'config', 'user.name', 'test')
  git(root, 'add', '-A')
  git(root, 'commit', '-qm', 'base')
  git(root, 'checkout', '-qb', 'plan/demo/a-draft')
  writeFiles(root, {
    'surfaces/demo/a-screen.1.yaml': '# surface: /demo/a-screen@1\nscreen: a screen\n',
    'facts/demo.yaml': yaml({
      version: '1',
      facts: [
        { id: 'aaaaaaaa', claim: 'the first fact.\n', sources: [] },
        { id: 'bbbbbbbb', claim: 'the second fact.\n', sources: [] },
      ],
    }),
    'products/demo/increments/wip-002-another/decisions.yaml': yaml({
      version: '2',
      decisions: [{ id: 'd-99999999', title: 'a choice', statement: 'a way.\n', status: 'proposed' }],
    }),
    // the draft the session opens on; it is not counted among the other inputs
    'products/demo/increments/wip-001-a-draft/decisions.yaml': 'version: "2"\ndecisions: []\n',
  })
  git(root, 'add', '-A')
  git(root, 'commit', '-qm', 'the draft')
  return root
}

/** The header asks gh for the unresolved threads; the fake answers for it. */
const runner = (root: string, unresolved: number): CommandRunner => {
  const nodes = Array.from({ length: 4 }, (_, index) => ({ isResolved: index >= unresolved }))
  return (command, args) => {
    if (command === 'gh') {
      return JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes } } } } })
    }
    return execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  }
}

describe('the header names the draft and what is not in the list — d-kjwswmro', () => {
  it('counts the changed inputs from the branch’s merge-base, entries where a file holds them', () => {
    const root = branchedRepo()
    const header = readHeader({
      root,
      product: 'demo',
      increment: 'wip-001-a-draft',
      branch: 'plan/demo/a-draft',
      pullRequest: PULL_REQUEST,
      run: runner(root, 3),
    })
    expect(header.alsoChanged).toEqual([
      { kind: 'surfaces', count: 1 },
      { kind: 'facts', count: 2 },
      { kind: 'drafts', count: 1 },
    ])
    expect(header.unresolved).toBe(3)
  })

  it('renders the draft, the branch, the pull request, and the counts', () => {
    expect(
      renderHeader({
        product: 'demo',
        increment: 'wip-001-a-draft',
        branch: 'plan/demo/a-draft',
        pullRequest: 197,
        alsoChanged: [{ kind: 'facts', count: 2 }],
        unresolved: 3,
      }),
    ).toEqual(['demo · wip-001-a-draft · plan/demo/a-draft · #197', 'also changed: facts (2)    3 unresolved'])
  })

  it('keeps the second row blank where the draft has nothing to say on it — d-ozagogc7', () => {
    expect(
      renderHeader({
        product: 'demo',
        increment: 'wip-001-a-draft',
        branch: 'plan/demo/a-draft',
        pullRequest: 197,
        alsoChanged: [],
        unresolved: 0,
      }),
    ).toEqual(['demo · wip-001-a-draft · plan/demo/a-draft · #197', ''])
  })
})
