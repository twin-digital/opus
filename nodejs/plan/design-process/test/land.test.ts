import { PassThrough } from 'node:stream'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { landIncrement, LAND_STEPS, landingBlockers } from '../src/land.js'
import { collectOpenEntries } from '../src/session/entries.js'
import { readSecret } from '../src/session/secret.js'
import { emptyStaging, stageRuling } from '../src/session/staging.js'
import { DirTree } from '../src/tree.js'

import { demoProduct, makeRepo, removeRepo, yaml } from './helpers.js'

import type { CommandRunner } from '../src/land.js'
import type { Files } from './helpers.js'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    removeRepo(root)
  }
})

const DRAFT = 'products/demo/increments/wip-001-a-draft'

const settled = (): Files => {
  const files = demoProduct()
  files[`${DRAFT}/decisions.yaml`] = yaml({
    version: '2',
    decisions: [{ id: 'd-11111111', title: 'a choice', statement: 'the way.\n', status: 'accepted' }],
  })
  return files
}

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

/** What `gh pr view` reports for the branch: the landing discovers the pull request (d-8vsionnz). */
const PR_VIEW = JSON.stringify({ url: 'https://github.com/twin-digital/plan-opus/pull/42' })

const recorder = (fail?: string): { run: CommandRunner; calls: Call[] } => {
  const calls: Call[] = []
  const run: CommandRunner = (command, args) => {
    calls.push({ command, args })
    if (fail !== undefined && args.join(' ').includes(fail)) {
      throw new Error(`${command} failed`)
    }
    return command === 'gh' && args[1] === 'view' ? PR_VIEW : ''
  }
  return { run, calls }
}

describe('the landing sequence is fixed — d-qzpfyc6s', () => {
  it('is the published order', () => {
    expect([...LAND_STEPS]).toEqual([
      'apply',
      'conflicts',
      'rename',
      'check',
      'commit',
      'push',
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

  it('approves after the push, since a push dismisses an approval', async () => {
    const order: string[] = []
    const { run } = recorder()
    const result = await landIncrement({
      root: repo(settled()),
      product: 'demo',
      run: (command, args, runOptions) => {
        if (args.includes('push')) {
          order.push('push')
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
    expect(order).toEqual(['push', 'approve'])
  })
})

describe('the landing discovers the pull request and opens none — d-8vsionnz', () => {
  it('publishes, skips the approval, and opens nothing when the branch has no pull request', async () => {
    const { run, calls } = recorder()
    const noPullRequest: CommandRunner = (command, args, options) => {
      if (command === 'gh' && args[1] === 'view') {
        throw new Error('no pull request found for branch')
      }
      return run(command, args, options)
    }
    const result = await landIncrement({
      root: repo(settled()),
      product: 'demo',
      run: noPullRequest,
      approvingToken: () => Promise.resolve('t'),
      approve: () => Promise.reject(new Error('the approval must not be attempted')),
    })
    expect(result.landed).toBe(true)
    expect(result.awaitingApproval).toBe(true)
    expect(result.steps.find((step) => step.step === 'approve')?.status).toBe('skipped')
    expect(result.steps.find((step) => step.step === 'auto-merge')?.status).toBe('skipped')
    expect(calls.some((call) => call.args.includes('create'))).toBe(false)
  })

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
