import { describe, expect, it } from 'vitest'

import { resolveSessionTarget } from '../src/session/target.js'

import type { CommandRunner } from '../src/land.js'

const VIEW = {
  url: 'https://github.com/twin-digital/plan-opus/pull/197',
  number: 197,
  headRefName: 'plan/increment-process/ratify-view',
  isCrossRepository: false,
  files: [
    { path: 'products/increment-process/increments/wip-001-ratify-view/decisions.yaml' },
    { path: 'surfaces/design-process/ratify-screen.1.yaml' },
  ],
}

interface Fake {
  branch?: string
  default?: string
  dirty?: boolean
  view?: unknown
  tracked?: string[]
}

const calls: string[][] = []

const runner = (fake: Fake): CommandRunner => {
  const branch = fake.branch ?? 'plan/increment-process/ratify-view'
  return (command, args) => {
    calls.push([command, ...args])
    const joined = args.join(' ')
    if (command === 'git' && joined.includes('rev-parse --abbrev-ref')) {
      return `${branch}\n`
    }
    if (command === 'git' && joined.includes('symbolic-ref')) {
      return `origin/${fake.default ?? 'main'}\n`
    }
    if (command === 'git' && joined.includes('status --porcelain')) {
      return fake.dirty === true ? ' M a.yaml\n' : ''
    }
    if (command === 'git' && joined.includes('ls-files')) {
      return (fake.tracked ?? []).join('\n')
    }
    if (command === 'gh' && args[1] === 'pr' && args[2] === 'view') {
      if (fake.view === undefined) {
        throw new Error('no pull request found')
      }
      return JSON.stringify(fake.view)
    }
    if (command === 'gh' && joined.startsWith('pr view')) {
      if (fake.view === undefined) {
        throw new Error('no pull request found')
      }
      return JSON.stringify(fake.view)
    }
    return ''
  }
}

const resolve = (fake: Fake, options: { pr?: string; product?: string } = {}) => {
  calls.length = 0
  return resolveSessionTarget({ root: '/repo', run: runner(fake), ...options })
}

describe('the session finds the pull request it works — d-7i1l1kfy', () => {
  it('works the pull request whose head is the working directory’s branch', async () => {
    const target = await resolve({ view: VIEW })
    expect(target).toMatchObject({
      root: '/repo',
      product: 'increment-process',
      increment: 'wip-001-ratify-view',
      branch: 'plan/increment-process/ratify-view',
      pullRequest: { owner: 'twin-digital', repo: 'plan-opus', number: 197 },
    })
  })

  it('refuses the repository’s default branch', async () => {
    expect(await resolve({ branch: 'main', view: VIEW })).toEqual({
      refused: { reason: 'default-branch', branch: 'main' },
    })
  })

  it('refuses a tree with uncommitted changes', async () => {
    expect(await resolve({ dirty: true, view: VIEW })).toEqual({ refused: { reason: 'uncommitted-changes' } })
  })

  it('refuses a head branch on a fork the clone cannot push to', async () => {
    expect(await resolve({ view: { ...VIEW, isCrossRepository: true } })).toEqual({
      refused: { reason: 'unpushable-fork', branch: VIEW.headRefName },
    })
  })

  it('refuses a branch carrying no draft and no pull request', async () => {
    expect(await resolve({})).toEqual({ refused: { reason: 'no-draft' } })
  })

  it('refuses a pull request whose diff touches no increment', async () => {
    expect(await resolve({ view: { ...VIEW, files: [{ path: 'README.md' }] } })).toMatchObject({
      refused: { reason: 'no-increment-on-pull-request' },
    })
  })

  it('opens one where the branch carries a draft and has none, since posting it is the point', async () => {
    const fake: Fake = { tracked: ['products/demo/increments/wip-001-a-draft/decisions.yaml'] }
    let opened = false
    const run: CommandRunner = (command, args) => {
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'create') {
        opened = true
        return ''
      }
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'view' && !opened) {
        throw new Error('no pull request found')
      }
      if (command === 'gh' && args[0] === 'pr' && args[1] === 'view') {
        return JSON.stringify({ ...VIEW, files: [{ path: 'products/demo/increments/wip-001-a-draft/decisions.yaml' }] })
      }
      return runner(fake)(command, args)
    }
    const target = await resolveSessionTarget({ root: '/repo', run })
    expect(opened).toBe(true)
    expect(target).toMatchObject({ product: 'demo', increment: 'wip-001-a-draft' })
  })
})

describe('the pull request’s diff names the draft — d-pm6a29v6', () => {
  const twoDrafts = {
    ...VIEW,
    files: [
      { path: 'products/increment-process/increments/wip-001-ratify-view/decisions.yaml' },
      { path: 'products/minecraft-addon/increments/wip-002-dev-loop/decisions.yaml' },
    ],
  }

  it('opens straight on the one draft the diff carries', async () => {
    const target = await resolve({ view: VIEW })
    expect(target).toMatchObject({ increment: 'wip-001-ratify-view' })
  })

  it('asks which draft where the diff carries several', async () => {
    let offered: { product: string }[] = []
    const target = await resolveSessionTarget({
      root: '/repo',
      run: runner({ view: twoDrafts }),
      choose: (choices) => {
        offered = choices
        return Promise.resolve(choices[1])
      },
    })
    expect(offered.map((choice) => choice.product)).toEqual(['increment-process', 'minecraft-addon'])
    expect(target).toMatchObject({ product: 'minecraft-addon', increment: 'wip-002-dev-loop' })
  })

  it('skips the selection where a named product leaves one draft', async () => {
    const target = await resolveSessionTarget({
      root: '/repo',
      product: 'minecraft-addon',
      run: runner({ view: twoDrafts }),
      choose: () => Promise.reject(new Error('the selection screen should not have opened')),
    })
    expect(target).toMatchObject({ product: 'minecraft-addon' })
  })
})
