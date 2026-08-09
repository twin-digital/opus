import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough, Writable } from 'node:stream'

import { afterEach, describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

import { collectSessionEntries } from '../src/session/entries.js'
import { runIncrementSession } from '../src/session/run.js'
import { emptyStaging, stageRuling } from '../src/session/staging.js'
import { writeAndPush } from '../src/session/submit.js'
import { DirTree } from '../src/tree.js'

import { demoProduct, removeRepo, writeFiles, yaml } from './helpers.js'

import type { CommandRunner } from '../src/land.js'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    removeRepo(root)
  }
})

const DRAFT = 'wip-001-a-draft'
const DECISIONS = `products/demo/increments/${DRAFT}/decisions.yaml`
const BRANCH = 'plan/demo/a-draft'

const git = (root: string, ...args: string[]): string =>
  execFileSync('git', ['-C', root, '-c', 'user.email=test@example.com', '-c', 'user.name=test', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

const run: CommandRunner = (command, args) => {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const said = error as { stderr?: string; stdout?: string }
    throw new Error((said.stderr ?? said.stdout ?? '').trim() || `${command} failed`, { cause: error })
  }
}

const draftSource = (statuses: Record<string, string>): string =>
  yaml({
    version: '2',
    decisions: Object.entries(statuses).map(([id, status]) => ({
      id,
      title: `choice ${id}`,
      statement: 'the way.\n',
      status,
    })),
  })

/** A clone of a bare remote, its draft branch pushed, so a refused push is a real one. */
const clonedRepo = (): { root: string; remote: string } => {
  const remote = mkdtempSync(join(tmpdir(), 'design-process-remote-'))
  roots.push(remote)
  git(remote, 'init', '-q', '--bare', '-b', 'main')

  const root = mkdtempSync(join(tmpdir(), 'design-process-clone-'))
  roots.push(root)
  git(root, 'init', '-q', '-b', 'main')
  writeFiles(root, demoProduct())
  git(root, 'add', '-A')
  git(root, 'commit', '-qm', 'base')
  git(root, 'remote', 'add', 'origin', remote)
  git(root, 'push', '-q', '-u', 'origin', 'main')
  git(root, 'checkout', '-qb', BRANCH)
  writeFiles(root, { [DECISIONS]: draftSource({ 'd-11111111': 'proposed', 'd-22222222': 'proposed' }) })
  git(root, 'add', '-A')
  git(root, 'commit', '-qm', 'the draft')
  git(root, 'push', '-q', '-u', 'origin', BRANCH)
  return { root, remote }
}

const entriesOf = (root: string) => collectSessionEntries(new DirTree(root), 'demo', DRAFT).decisions

const statusesAt = (remote: string, ref: string): Record<string, string> => {
  const source = git(remote, 'show', `${ref}:${DECISIONS}`)
  const parsed = parseYaml(source) as { decisions: { id: string; status: string }[] }
  return Object.fromEntries(parsed.decisions.map((entry) => [entry.id, entry.status]))
}

const target = (root: string) => ({ root, product: 'demo', increment: DRAFT, branch: BRANCH })

describe('a refused push pulls, reapplies by id, and tries again — d-x1jlr7jc', () => {
  it('reapplies what the tip did not rule, leaves what it did, and pushes again', () => {
    const { root, remote } = clonedRepo()
    // the branch moves under the sitting: another clone rules one of the two entries
    const other = mkdtempSync(join(tmpdir(), 'design-process-other-'))
    roots.push(other)
    git(other, 'clone', '-q', remote, other)
    git(other, 'checkout', '-q', BRANCH)
    writeFiles(other, { [DECISIONS]: draftSource({ 'd-11111111': 'proposed', 'd-22222222': 'accepted' }) })
    git(other, 'add', '-A')
    git(other, 'commit', '-qm', 'the other sitting')
    git(other, 'push', '-q', 'origin', BRANCH)

    const entries = entriesOf(root)
    let staged = stageRuling(emptyStaging(), { kind: 'decision', id: 'd-11111111', status: 'tolerated' })
    staged = stageRuling(staged, {
      kind: 'decision',
      id: 'd-22222222',
      status: 'rejected',
      rejectionReason: 'the simpler way wins.',
    })

    const outcome = writeAndPush(target(root), entries, staged, run)

    expect(outcome.conflicted).toEqual(['d-22222222'])
    expect(outcome.written).toEqual(['d-11111111'])
    expect(outcome.message).toContain('committed and pushed')
    expect(statusesAt(remote, BRANCH)).toEqual({ 'd-11111111': 'tolerated', 'd-22222222': 'accepted' })
  })

  it('writes no commit for a sitting that ruled nothing', () => {
    const { root } = clonedRepo()
    const outcome = writeAndPush(target(root), entriesOf(root), emptyStaging(), run)
    expect(outcome).toEqual({
      message: 'the sitting ruled nothing; no commit was written',
      written: [],
      conflicted: [],
    })
  })
})

/** What `gh` is asked while the session resolves its target and reads its header. */
const gh = (args: string[]): string => {
  if (args[0] === 'pr' && args[1] === 'view') {
    return JSON.stringify({
      url: 'https://github.com/twin-digital/plan-opus/pull/7',
      number: 7,
      headRefName: BRANCH,
      files: [{ path: DECISIONS }],
    })
  }
  if (args[0] === 'api') {
    return JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } })
  }
  return ''
}

describe('a submit does not end the sitting — d-nb5yg1w1', () => {
  it('writes, returns to the list, and ends when the owner ends it', async () => {
    const { root, remote } = clonedRepo()
    const input = new PassThrough()
    const said: string[] = []
    const output = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        const text = String(chunk)
        said.push(text)
        // the sitting is still open once the write has reported; the owner ends it
        if (text.includes('committed and pushed')) {
          input.write('q')
        }
        callback()
      },
    })

    input.write('tw')
    const code = await runIncrementSession({
      root,
      input,
      output,
      run: (command, args) => (command === 'gh' ? gh(args) : run(command, args)),
    })

    expect(code).toBe(0)
    const transcript = said.join('')
    expect(transcript).toContain('1 tolerated; committed and pushed')
    expect(transcript).toContain('session abandoned')
    expect(statusesAt(remote, BRANCH)['d-11111111']).toBe('tolerated')
    expect(readFileSync(join(root, DECISIONS), 'utf8')).toContain('tolerated')
  })
})
