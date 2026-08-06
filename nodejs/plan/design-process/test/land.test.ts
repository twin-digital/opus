import { PassThrough } from 'node:stream'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { landIncrement, LAND_STEPS, landingBlockers } from '../src/land.js'
import { collectOpenEntries } from '../src/session/entries.js'
import { readSecret } from '../src/session/secret.js'
import { emptyStaging, stageRuling } from '../src/session/staging.js'
import { DirTree } from '../src/tree.js'

import { demoProduct, makeGitRepo, makeRepo, removeRepo, writeFiles, yaml } from './helpers.js'

import type { CommandRunner } from '../src/land.js'
import type { Files } from './helpers.js'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    removeRepo(root)
  }
})

const DRAFT = 'products/demo/increments/wip-001-a-draft'

/** The draft alone, for a tree whose published increments are already committed. */
const draftFiles = (): Files => ({
  [`${DRAFT}/decisions.yaml`]: yaml({
    version: '2',
    decisions: [{ id: 'd-11111111', title: 'a choice', statement: 'the way.\n', status: 'accepted' }],
  }),
})

const settled = (): Files => ({ ...demoProduct(), ...draftFiles() })

const unsettled = (): Files => {
  const files = settled()
  files[`${DRAFT}/questions.yaml`] = yaml({
    version: '1',
    questions: [{ id: 'q-11111111', question: 'how fast?\n', answer: 'fact' }],
  })
  return files
}

const repo = (files: Files): string => {
  const { root } = makeRepo(files)
  roots.push(root)
  return root
}

interface Call {
  command: string
  args: string[]
}

const PR_URL = 'https://github.com/twin-digital/plan-opus/pull/42'

/** What `gh pr view` reports when the branch already has one; absent, the open step makes one. */
const PR_VIEW = JSON.stringify({ url: PR_URL })

/** What `gh pr create` prints: the url of the pull request it opened. */
const PR_CREATED = `${PR_URL}\n`

interface MergeFlags {
  allow_merge_commit?: boolean
  allow_squash_merge?: boolean
  allow_rebase_merge?: boolean
}

/** plan-opus, where increments land: merge commits only, squash and rebase disabled. */
const PLAN_OPUS: MergeFlags = { allow_merge_commit: true, allow_squash_merge: false, allow_rebase_merge: false }

interface Repo {
  /** Whether the branch already has a pull request; false makes `gh pr view` fail as gh does. */
  pullRequest?: boolean
  merge?: MergeFlags
}

const recorder = (fail?: string, repo: Repo = {}): { run: CommandRunner; calls: Call[] } => {
  const { pullRequest = true, merge = PLAN_OPUS } = repo
  const calls: Call[] = []
  const run: CommandRunner = (command, args) => {
    calls.push({ command, args })
    if (fail !== undefined && args.join(' ').includes(fail)) {
      throw new Error(`${command} failed`)
    }
    if (command !== 'gh') {
      return ''
    }
    if (args[1] === 'view') {
      if (!pullRequest) {
        throw new Error('no pull requests found for branch')
      }
      return PR_VIEW
    }
    if (args[1] === 'create') {
      return PR_CREATED
    }
    return args[0] === 'api' ? JSON.stringify(merge) : ''
  }
  return { run, calls }
}

/** The value `gh pr create` was given for one flag. */
const created = (calls: Call[], flag: string): string | undefined => {
  const call = calls.find((candidate) => candidate.command === 'gh' && candidate.args[1] === 'create')
  const at = call?.args.indexOf(flag) ?? -1
  return at === -1 ? undefined : call?.args[at + 1]
}

/** The flag `gh pr merge` was given, or undefined when the landing never called it. */
const mergeFlag = (calls: Call[]): string | undefined =>
  calls
    .find((call) => call.command === 'gh' && call.args[1] === 'merge')
    ?.args.find((arg) => arg.startsWith('--') && arg !== '--auto')

describe('the landing sequence is fixed — d-h418ljtp', () => {
  it('is the published order, the open between the push and the approval', () => {
    expect([...LAND_STEPS]).toEqual([
      'apply',
      'conflicts',
      'rename',
      'check',
      'commit',
      'push',
      'open',
      'approve',
      'auto-merge',
    ])
  })

  it('runs the steps in order for a settled draft', async () => {
    const { run } = recorder()
    const result = await landIncrement({
      root: repo(settled()),
      product: 'demo',
      run,
      approvingToken: () => Promise.resolve('t'),
      approve: () => Promise.resolve(),
    })
    expect(result.landed).toBe(true)
    expect(result.number).toBe('003')
    expect(result.steps.map((step) => step.step)).toEqual([...LAND_STEPS])
    expect(result.steps.every((step) => step.status === 'ok')).toBe(true)
  })

  it('stops at the first failing step and reports what to fix', async () => {
    const { run } = recorder('check')
    const result = await landIncrement({
      root: repo(settled()),
      product: 'demo',
      run,
      approvingToken: () => Promise.resolve('t'),
      approve: () => Promise.resolve(),
    })
    expect(result.landed).toBe(false)
    const failed = result.steps.find((step) => step.status === 'failed')
    expect(failed?.step).toBe('check')
    expect(failed?.detail).toBeTruthy()
    expect(result.steps.some((step) => step.step === 'commit' && step.status === 'ok')).toBe(false)
  })

  it('pushes, then opens, then approves — the remote must carry the branch, and a push dismisses an approval', async () => {
    const order: string[] = []
    const { run } = recorder(undefined, { pullRequest: false })
    const result = await landIncrement({
      root: repo(settled()),
      product: 'demo',
      run: (command, args, runOptions) => {
        if (args.includes('push')) {
          order.push('push')
        }
        if (command === 'gh' && args[1] === 'create') {
          order.push('open')
        }
        return run(command, args, runOptions)
      },
      approvingToken: () => Promise.resolve('t'),
      approve: () => {
        order.push('approve')
        return Promise.resolve()
      },
    })
    expect(result.landed).toBe(true)
    expect(order).toEqual(['push', 'open', 'approve'])
  })
})

describe("a product's first increment claims 001 — d-h418ljtp", () => {
  /** A product the head has never heard of: only the draft introduces it. */
  const freshDraft = (): Files => ({
    'products/fresh/product.yaml': yaml({ version: '1', kind: 'nodejs-library' }),
    'products/fresh/increments/wip-001-first/requirements.yaml': yaml({
      version: '1',
      requirements: [{ id: 'r-ffffffff', title: 'the first', statement: 'the product exists.\n' }],
    }),
  })

  it('lands where the head resolves but publishes nothing of the product', async () => {
    const { root } = makeGitRepo(demoProduct())
    roots.push(root)
    writeFiles(root, freshDraft())
    const { run } = recorder()
    const result = await landIncrement({
      root,
      product: 'fresh',
      run,
      approvingToken: () => Promise.resolve('t'),
      approve: () => Promise.resolve(),
    })
    expect(result.landed).toBe(true)
    expect(result.number).toBe('001')
    const conflicts = result.steps.find((step) => step.step === 'conflicts')
    expect(conflicts?.status).toBe('ok')
    expect(conflicts?.detail).toContain('nothing to conflict with')
  })

  it('still checks a product the head does publish', async () => {
    const { root } = makeGitRepo(demoProduct())
    roots.push(root)
    writeFiles(root, draftFiles())
    const { run } = recorder()
    const result = await landIncrement({
      root,
      product: 'demo',
      run,
      approvingToken: () => Promise.resolve('t'),
      approve: () => Promise.resolve(),
    })
    expect(result.landed).toBe(true)
    expect(result.number).toBe('003')
    expect(result.steps.find((step) => step.step === 'conflicts')?.detail).toMatch(/no conflicts against/)
  })
})

describe('the landing opens the pull request it merges through — d-h418ljtp', () => {
  it('opens the pull request where the branch has none, and approves the one it opened', async () => {
    const { run, calls } = recorder(undefined, { pullRequest: false })
    const approved: number[] = []
    const result = await landIncrement({
      root: repo(settled()),
      product: 'demo',
      run,
      approvingToken: () => Promise.resolve('t'),
      approve: (_token, pullRequest) => {
        approved.push(pullRequest.number)
        return Promise.resolve()
      },
    })
    expect(result.landed).toBe(true)
    expect(result.awaitingApproval).toBeUndefined()
    expect(result.steps.find((step) => step.step === 'open')?.detail).toBe('opened #42')
    expect(approved).toEqual([42])
    expect(created(calls, '--title')).toBe('plan(demo): land increment 003 [003]')
    expect(created(calls, '--body')).toBe('Publishes increment 003 of demo.\n')
  })

  it('opens no second pull request where the branch already has one', async () => {
    const { run, calls } = recorder()
    const result = await landIncrement({
      root: repo(settled()),
      product: 'demo',
      run,
      approvingToken: () => Promise.resolve('t'),
      approve: () => Promise.resolve(),
    })
    expect(result.steps.find((step) => step.step === 'open')?.status).toBe('ok')
    expect(result.steps.find((step) => step.step === 'open')?.detail).toBe('#42 is already open')
    expect(calls.some((call) => call.command === 'gh' && call.args[1] === 'create')).toBe(false)
  })

  it('stops the sequence when the pull request cannot be opened, rather than reporting it published', async () => {
    const { run } = recorder(undefined, { pullRequest: false })
    const refusing: CommandRunner = (command, args, options) => {
      if (command === 'gh' && args[1] === 'create') {
        throw new Error('gh: a pull request could not be created')
      }
      return run(command, args, options)
    }
    const result = await landIncrement({
      root: repo(settled()),
      product: 'demo',
      run: refusing,
      approvingToken: () => Promise.resolve('t'),
      approve: () => Promise.reject(new Error('the approval must not be attempted')),
    })
    expect(result.landed).toBe(false)
    expect(result.steps.find((step) => step.step === 'open')?.status).toBe('failed')
    expect(result.steps.some((step) => step.step === 'approve')).toBe(false)
  })
})

describe('the merge method is the one the repository permits — d-8vsionnz', () => {
  it('reports an approved pull request awaiting a manual merge when auto-merge is refused', async () => {
    const { run } = recorder()
    const refusing: CommandRunner = (command, args, options) => {
      if (command === 'gh' && args[1] === 'merge') {
        throw new Error('auto-merge is not enabled for this repository')
      }
      return run(command, args, options)
    }
    const result = await landIncrement({
      root: repo(settled()),
      product: 'demo',
      run: refusing,
      approvingToken: () => Promise.resolve('t'),
      approve: () => Promise.resolve(),
    })
    expect(result.landed).toBe(true)
    expect(result.awaitingApproval).toBeUndefined()
    expect(result.awaitingMerge).toBe(true)
    expect(result.steps.find((step) => step.step === 'approve')?.status).toBe('ok')
    const merge = result.steps.find((step) => step.step === 'auto-merge')
    expect(merge?.status).toBe('skipped')
    expect(merge?.detail).toContain('merge it once the gate is green')
  })
  const landWith = async (repository: MergeFlags) => {
    const { run, calls } = recorder(undefined, { merge: repository })
    const result = await landIncrement({
      root: repo(settled()),
      product: 'demo',
      run,
      approvingToken: () => Promise.resolve('t'),
      approve: () => Promise.resolve(),
    })
    return { result, calls }
  }

  it('sets a merge commit where that is what the repository allows', async () => {
    const { result, calls } = await landWith(PLAN_OPUS)
    expect(mergeFlag(calls)).toBe('--merge')
    expect(result.steps.find((step) => step.step === 'auto-merge')?.status).toBe('ok')
  })

  it('sets a squash where that is what the repository allows', async () => {
    const { calls } = await landWith({ allow_merge_commit: false, allow_squash_merge: true, allow_rebase_merge: false })
    expect(mergeFlag(calls)).toBe('--squash')
  })

  it('sets a rebase where that is what the repository allows', async () => {
    const { calls } = await landWith({ allow_merge_commit: false, allow_squash_merge: false, allow_rebase_merge: true })
    expect(mergeFlag(calls)).toBe('--rebase')
  })

  it('prefers merge, then squash, then rebase where the repository allows several', async () => {
    const all = await landWith({ allow_merge_commit: true, allow_squash_merge: true, allow_rebase_merge: true })
    expect(mergeFlag(all.calls)).toBe('--merge')
    const withoutMerge = await landWith({
      allow_merge_commit: false,
      allow_squash_merge: true,
      allow_rebase_merge: true,
    })
    expect(mergeFlag(withoutMerge.calls)).toBe('--squash')
  })

  it('leaves the approved pull request to a manual merge when the repository allows none', async () => {
    const { result, calls } = await landWith({
      allow_merge_commit: false,
      allow_squash_merge: false,
      allow_rebase_merge: false,
    })
    expect(mergeFlag(calls)).toBeUndefined()
    expect(result.landed).toBe(true)
    expect(result.awaitingMerge).toBe(true)
    expect(result.steps.find((step) => step.step === 'auto-merge')?.detail).toContain('merge it once the gate is green')
  })

  it('leaves it to a manual merge when the repository cannot be asked, rather than guessing a flag', async () => {
    const { run } = recorder()
    const silent: CommandRunner = (command, args, options) => {
      if (command === 'gh' && args[0] === 'api') {
        throw new Error('gh: could not reach the api')
      }
      return run(command, args, options)
    }
    const result = await landIncrement({
      root: repo(settled()),
      product: 'demo',
      run: silent,
      approvingToken: () => Promise.resolve('t'),
      approve: () => Promise.resolve(),
    })
    expect(result.landed).toBe(true)
    expect(result.awaitingMerge).toBe(true)
    expect(result.steps.find((step) => step.step === 'auto-merge')?.status).toBe('skipped')
  })
})

describe('an unsettled draft publishes nothing — r-2keswxn8', () => {
  it('names what is unsettled', () => {
    const blockers = landingBlockers(new DirTree(repo(unsettled())), 'demo')
    expect(blockers.join(' ')).toContain('q-11111111')
  })

  it('refuses before any step runs', async () => {
    const { run, calls } = recorder()
    const result = await landIncrement({ root: repo(unsettled()), product: 'demo', run })
    expect(result.landed).toBe(false)
    expect(result.steps.some((step) => step.status === 'ok')).toBe(false)
    expect(calls).toEqual([])
  })

  it('counts an entry the staged set is about to settle as settled, since apply runs first', async () => {
    const root = repo(unsettled())
    const entries = collectOpenEntries(new DirTree(root), 'demo')
    const staged = stageRuling(emptyStaging(), {
      kind: 'question',
      id: 'q-11111111',
      answer: 'measured at 12ms.',
      route: 'fact',
    })
    const result = await landIncrement({
      root,
      product: 'demo',
      run: recorder().run,
      staged: { entries, staged },
      approvingToken: () => Promise.resolve('t'),
      approve: () => Promise.resolve(),
    })
    expect(result.landed).toBe(true)
    expect(result.steps.find((step) => step.step === 'apply')?.status).toBe('ok')
  })
})

describe('the approving credential is never written down — r-rxb7pn9z, d-6fur4w53', () => {
  const TOKEN = 'ghp_secret_value'

  it('reaches no command line and no environment variable', async () => {
    const { run, calls } = recorder()
    const seen: string[] = []
    await landIncrement({
      root: repo(settled()),
      product: 'demo',
      run,
      approvingToken: () => Promise.resolve(TOKEN),
      approve: (token) => {
        seen.push(token)
        return Promise.resolve()
      },
    })
    expect(seen).toEqual([TOKEN])
    expect(JSON.stringify(calls)).not.toContain(TOKEN)
    expect(JSON.stringify(process.env)).not.toContain(TOKEN)
  })

  it('asks again on the next landing, having retained nothing', async () => {
    const ask = vi.fn(() => Promise.resolve(TOKEN))
    const options = {
      product: 'demo',
      run: recorder().run,
      approvingToken: ask,
      approve: () => Promise.resolve(),
    }
    await landIncrement({ ...options, root: repo(settled()) })
    await landIncrement({ ...options, root: repo(settled()) })
    expect(ask).toHaveBeenCalledTimes(2)
  })

  it('publishes up to the approval when no token is given', async () => {
    const result = await landIncrement({
      root: repo(settled()),
      product: 'demo',
      run: recorder().run,
      approvingToken: () => Promise.resolve(undefined),
    })
    expect(result.landed).toBe(true)
    expect(result.awaitingApproval).toBe(true)
    expect(result.steps.find((step) => step.step === 'push')?.status).toBe('ok')
    expect(result.steps.find((step) => step.step === 'approve')?.status).toBe('skipped')
  })

  it('does not echo what is typed', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const written: string[] = []
    output.on('data', (chunk: Buffer) => written.push(chunk.toString()))
    const reading = readSecret({ prompt: 'token: ', input, output })
    input.write(`${TOKEN}\n`)
    expect(await reading).toBe(TOKEN)
    expect(written.join('')).not.toContain(TOKEN)
  })
})
