import { describe, expect, it } from 'vitest'

import { collectIds, generateIds } from '../src/ids.js'
import { demoProduct, makeRepo, yaml } from './helpers.js'

describe('id generation (d-kqofgshc)', () => {
  it('generates {prefix}-{8 lowercase base36} ids', () => {
    for (const id of generateIds('r', 20, new Set())) {
      expect(id).toMatch(/^r-[0-9a-z]{8}$/)
    }
    expect(generateIds('q', 1, new Set())[0]).toMatch(/^q-[0-9a-z]{8}$/)
  })

  it('generates the pool kinds at their ratified prefixes: f- at one letter, run- at three (r-buek5llj)', () => {
    expect(generateIds('f', 1, new Set())[0]).toMatch(/^f-[0-9a-z]{8}$/)
    expect(generateIds('run', 1, new Set())[0]).toMatch(/^run-[0-9a-z]{8}$/)
  })

  it('collects generated ids from the facts and evidence pools, so new pool ids avoid them', () => {
    const files = demoProduct()
    files['facts/vendor.yaml'] = yaml({
      version: '2',
      facts: [{ id: 'f-a1b2c3d4', claim: 'x', backing: 'assumed', sources: [{ description: 'assumed' }] }],
    })
    files['evidence/probes.yaml'] = yaml({
      version: '2',
      runs: [{ id: 'run-a1b2c3d4', command: 'true', output: 'artifacts/out.txt', ran_at: '2026-08-10' }],
    })
    const taken = collectIds(makeRepo(files).tree)
    expect(taken).toContain('f-a1b2c3d4')
    expect(taken).toContain('run-a1b2c3d4')
  })

  it('collects every id mentioned under products/ and avoids them', () => {
    const { tree } = makeRepo(demoProduct())
    const taken = collectIds(tree)
    expect(taken).toContain('d-aaaaaaaa')
    expect(taken).toContain('r-cccccccc')
    const generated = generateIds('d', 50, taken)
    for (const id of generated) {
      expect(taken.has(id)).toBe(false)
    }
    expect(new Set(generated).size).toBe(50)
  })
})
