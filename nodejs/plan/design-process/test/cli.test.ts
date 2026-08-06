import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { demoProduct, makeGitRepo, makeRepo, removeRepo, writeFiles, yaml } from './helpers.js'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    removeRepo(root)
  }
})

const CLI = join(import.meta.dirname, '../bin/design-process.js')

const repo = (): string => {
  const made = makeRepo(demoProduct())
  roots.push(made.root)
  return made.root
}

const run = (root: string, ...args: string[]): { out: string; err: string; code: number } => {
  const result = spawnSync(process.execPath, [CLI, ...args, '--root', root], { encoding: 'utf8' })
  return { out: result.stdout, err: result.stderr, code: result.status ?? 0 }
}

/** The seven commands with a machine-readable main output; `increment` and `land` have none (q-btui8gxj). */
const DATA_COMMANDS: string[][] = [
  ['check', '--static-only'],
  ['show', 'demo'],
  ['id', 'r'],
  ['where', 'demo'],
  ['diff', 'demo', '--from', '1'],
  ['conflicts', 'demo', '--against', '1'],
  ['backlog', 'list', '--offline'],
]

describe('every command renders its main output as JSON — r-rn6wxdn4', () => {
  for (const command of DATA_COMMANDS) {
    it(`\`${command.join(' ')} --json\` writes JSON to stdout`, () => {
      const { out } = run(repo(), ...command, '--json')
      expect(() => JSON.parse(out) as unknown).not.toThrow()
    })
  }
})

describe('the main output is stdout and the diagnostics are stderr — r-d474vggq, r-tbmrw430, d-m7i568id', () => {
  it('puts a passing check’s note on stderr, leaving stdout empty', () => {
    const { out, err, code } = run(repo(), 'check', '--static-only')
    expect(out).toBe('')
    expect(err).toContain('design check passed')
    expect(code).toBe(0)
  })

  it('puts a failure on stderr, leaving stdout empty', () => {
    const broken = run(repo(), 'show', 'not-a-product')
    expect(broken.code).toBe(1)
    expect(broken.out).toBe('')
    expect(broken.err).toContain('not-a-product')
  })

  it('puts the conflicts a landing check finds on stdout and its tally on stderr', () => {
    const { out, err, code } = run(repo(), 'conflicts', 'demo', '--against', '1')
    expect(out).toContain('landing-duplicate-id')
    expect(out).not.toContain('landing check failed')
    expect(err).toContain('landing check failed')
    expect(code).toBe(1)
  })

  it('passes the landing check for a product the head has never published', () => {
    const made = makeGitRepo(demoProduct())
    roots.push(made.root)
    writeFiles(made.root, {
      'products/fresh/product.yaml': yaml({ version: '1', kind: 'nodejs-library' }),
      'products/fresh/increments/wip-001-first/requirements.yaml': yaml({
        version: '1',
        requirements: [{ id: 'r-ffffffff', title: 'the first', statement: 'the product exists.\n' }],
      }),
    })
    const { out, err, code } = run(made.root, 'conflicts', 'fresh', '--against-ref', 'main')
    expect(code).toBe(0)
    expect(out).toBe('')
    expect(err).toContain('publishes nothing at the head')
  })

  it('leaves the interactive commands without the flag', () => {
    const { err, code } = run(repo(), 'increment', 'demo', '--json')
    expect(code).not.toBe(0)
    expect(err).toContain('unknown option')
  })
})

describe('the JSON projections carry the fold', () => {
  it('names the product, its requirements, its decisions, and its coverage', () => {
    const projection = JSON.parse(run(repo(), 'show', 'demo', '--json').out) as {
      product: string
      requirements: { id: string }[]
      decisions: { id: string }[]
      coverage: { claim: string }[]
      model: { name: string; schema?: string }[]
    }
    expect(projection.product).toBe('demo')
    expect(projection.requirements.map((entry) => entry.id)).toContain('r-bbbbbbbb')
    expect(projection.decisions.map((entry) => entry.id)).toContain('d-bbbbbbbb')
    expect(projection.coverage.length).toBeGreaterThan(0)
    expect(projection.model[0]).toMatchObject({ name: 'demo-config', schema: '/design-process/product@1' })
  })

  it('names the increment `where` reports', () => {
    expect(JSON.parse(run(repo(), 'where', 'demo', '--json').out)).toEqual({ product: 'demo', increment: '002' })
  })
})
