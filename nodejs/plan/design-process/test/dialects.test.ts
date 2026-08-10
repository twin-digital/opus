import { Ajv2020 } from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { validateTree } from '../src/validate.js'
import { demoV3, makeRepo, poolFiles, yaml } from './helpers.js'

import type { Finding } from '../src/types.js'

const check = (files: Record<string, string>): Finding[] => validateTree(makeRepo(files).tree)
const rules = (findings: Finding[]): string[] => findings.map((finding) => finding.rule)

/** Replace demoV3's requirements source, keeping the components its decision scope resolves against. */
const requirements = (over: Record<string, unknown>): Record<string, string> => {
  const files = demoV3()
  files['products/demo3/increments/001/requirements.yaml'] = yaml({
    version: '3',
    components: [
      { id: 'engine', description: 'the core engine' },
      { id: 'parser', description: 'the input parser', parent: 'engine' },
    ],
    ...over,
  })
  return files
}

const decisions = (entries: unknown[]): Record<string, string> => {
  const files = demoV3()
  files['products/demo3/increments/001/decisions.yaml'] = yaml({ version: '3', decisions: entries })
  return files
}

describe('the 032–034 dialects validate (d-rk99dwty, d-amueiyj2, d-hl3l8df0, d-oqiw2ggm, d-qv81x173)', () => {
  it('passes a clean tree on requirements@3, requirement@2, decisions@3, decision@3, and product@2', () => {
    expect(check(demoV3())).toEqual([])
  })

  it('rejects rationale, verification, facets, and amends in requirement@2 (d-msopc76y, d-8o8o8qo1, d-hfbf4eb7)', () => {
    for (const field of [
      { rationale: 'gone.\n' },
      { verification: [{ do: 'x' }, { verify: 'y' }] },
      { facets: 'cli' },
      { amends: 'r-bbbbbbbb' },
    ]) {
      const files = requirements({
        requirements: [{ id: 'r-aaaaaaaa', statement: 'the product does the thing.\n', ...field }],
      })
      expect(rules(check(files)), JSON.stringify(field)).toContain('source-validates')
    }
  })

  it('accepts supersedes in requirement@2 (d-4i5k9nsi)', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      requirements: [{ id: 'r-cccccccc', statement: 'the first thing, faster.\n', supersedes: 'r-aaaaaaaa' }],
    })
    expect(check(files)).toEqual([])
  })

  it('rejects revisit_when, rejection_reason, and facets in decision@3 (d-lks6pry8, d-4i5k9nsi, d-hfbf4eb7)', () => {
    for (const field of [
      { revisit_when: ['a condition'] },
      { rejection_reason: 'spelled reason now' },
      { facets: 'cli' },
    ]) {
      const files = decisions([{ id: 'd-aaaaaaaa', statement: 'the choice.\n', status: 'accepted', ...field }])
      expect(rules(check(files)), JSON.stringify(field)).toContain('source-validates')
    }
  })

  it('requires reason on a rejected decision@3 entry and forbids it elsewhere (d-4i5k9nsi)', () => {
    expect(rules(check(decisions([{ id: 'd-aaaaaaaa', statement: 'lost.\n', status: 'rejected' }])))).toContain(
      'source-validates',
    )
    expect(
      check(decisions([{ id: 'd-aaaaaaaa', statement: 'lost.\n', status: 'rejected', reason: 'non-viable' }])),
    ).toEqual([])
    expect(
      rules(check(decisions([{ id: 'd-aaaaaaaa', statement: 'kept.\n', status: 'accepted', reason: 'stray' }]))),
    ).toContain('source-validates')
  })

  it('requires at least two cases, at least one carrying when (d-qv81x173)', () => {
    const one = decisions([
      {
        id: 'd-aaaaaaaa',
        statement: 'the choice.\n',
        status: 'accepted',
        cases: [{ when: 'alone', then: 'a sentence would do' }],
      },
    ])
    expect(rules(check(one))).toContain('source-validates')
    const otherwiseOnly = decisions([
      {
        id: 'd-aaaaaaaa',
        statement: 'the choice.\n',
        status: 'accepted',
        cases: [{ otherwise: 'always' }, { otherwise: 'twice' }],
      },
    ])
    expect(rules(check(otherwiseOnly))).toContain('source-validates')
  })

  it('requires a retired component to carry a reason, and an active one to carry none (d-cizeaklk)', () => {
    const retired = requirements({ components: [{ id: 'engine', description: 'gone', status: 'retired' }] })
    expect(rules(check(retired))).toContain('source-validates')
    const active = requirements({ components: [{ id: 'engine', description: 'kept', reason: 'stray' }] })
    expect(rules(check(active))).toContain('source-validates')
    const supersededActive = requirements({
      components: [{ id: 'engine', description: 'kept', superseded_by: 'parser' }],
    })
    expect(rules(check(supersededActive))).toContain('source-validates')
  })

  it('requires a retired term to carry a reason (d-cizeaklk, d-2t3fbn09)', () => {
    const files = requirements({ terms: [{ id: 'fold', definition: 'the effective state', status: 'retired' }] })
    expect(rules(check(files))).toContain('source-validates')
  })

  it('spells preset statuses applied/retired: applied pins a version, retired carries only a reason (d-cizeaklk)', () => {
    const unpinned = requirements({ presets: [{ name: 'some-preset', status: 'applied' }] })
    expect(rules(check(unpinned))).toContain('source-validates')
    const retiredWithVersion = requirements({
      presets: [{ name: 'some-preset', version: 1, status: 'retired', reason: 'no longer applies' }],
    })
    expect(rules(check(retiredWithVersion))).toContain('source-validates')
    const retiredNoReason = requirements({ presets: [{ name: 'some-preset', status: 'retired' }] })
    expect(rules(check(retiredNoReason))).toContain('source-validates')
  })

  it('holds a model entry to one contract, or retired with a reason — no shapeless state (d-vax1016k)', () => {
    const shapeless = requirements({ model: [{ name: 'demo-config', description: 'no contract named' }] })
    expect(rules(check(shapeless))).toContain('source-validates')
    const both = requirements({
      model: [
        {
          name: 'demo-config',
          schema: '/design-process/product@1',
          surface: '/design-process/ratify-screen@4',
        },
      ],
    })
    expect(rules(check(both))).toContain('source-validates')
    const retiredNoReason = requirements({ model: [{ name: 'demo-config', status: 'retired' }] })
    expect(rules(check(retiredNoReason))).toContain('source-validates')
    const retired = requirements({
      requirements: [{ id: 'r-aaaaaaaa', statement: 'the product does the first thing.\n' }],
      model: [{ name: 'demo-config', status: 'retired', reason: 'the shape moved to its consumer' }],
    })
    expect(check(retired)).toEqual([])
  })

  it('keeps bound and unbound valid in the already-written dialects (d-vax1016k)', () => {
    const files = demoV3()
    files['products/demo1/product.yaml'] = yaml({ version: '1', kind: 'nodejs-library' })
    files['products/demo1/increments/001/requirements.yaml'] = yaml({
      version: '1',
      requirements: [{ id: 'r-dddddddd', statement: 'the old dialect still validates.\n' }],
      model: [{ name: 'old-shape', status: 'unbound' }],
    })
    expect(check(files)).toEqual([])
  })

  it('retires a product in its own declaration, with a reason (d-i849afta)', () => {
    const files = demoV3()
    files['products/demo3/product.yaml'] = yaml({ version: '2', kind: 'nodejs-library', status: 'retired' })
    expect(rules(check(files))).toContain('source-validates')
    files['products/demo3/product.yaml'] = yaml({
      version: '2',
      kind: 'nodejs-library',
      status: 'retired',
      reason: 'replaced by demo4',
    })
    expect(check(files)).toEqual([])
  })
})

describe('fact@2 and run@2 carry generated ids and free-text retirement (d-vkudjo4x)', () => {
  const ajv = new Ajv2020({ strict: false, allErrors: true })
  for (const [path, content] of Object.entries(poolFiles())) {
    const schema = parse(content) as Record<string, unknown> & { $id: string }
    void path
    ajv.addSchema(schema, schema.$id)
  }
  const validFact = {
    id: 'f-a1b2c3d4',
    claim: 'the thing holds',
    backing: 'documented',
    sources: [{ url: 'https://example.com', where: 'the docs', quote: 'the thing holds' }],
  }

  it('accepts an f- id and rejects a kebab one', () => {
    expect(ajv.validate('/design-process/fact@2', validFact)).toBe(true)
    expect(ajv.validate('/design-process/fact@2', { ...validFact, id: 'the-thing-holds' })).toBe(false)
  })

  it('takes retirement as free text with an optional superseded_by, and only when retired', () => {
    expect(
      ajv.validate('/design-process/fact@2', {
        ...validFact,
        status: 'retired',
        reason: 'the vendor changed the behaviour in 3.2',
        superseded_by: 'f-e5f6a7b8',
      }),
    ).toBe(true)
    expect(ajv.validate('/design-process/fact@2', { ...validFact, status: 'retired' })).toBe(false)
    expect(ajv.validate('/design-process/fact@2', { ...validFact, superseded_by: 'f-e5f6a7b8' })).toBe(false)
  })

  it('holds run@2 to run- ids and the same retirement form', () => {
    const validRun = {
      id: 'run-a1b2c3d4',
      command: 'node probe.mjs',
      output: 'artifacts/out.txt',
      ran_at: '2026-08-10',
    }
    expect(ajv.validate('/design-process/run@2', validRun)).toBe(true)
    expect(ajv.validate('/design-process/run@2', { ...validRun, id: 'probe-run' })).toBe(false)
    expect(ajv.validate('/design-process/run@2', { ...validRun, status: 'retired' })).toBe(false)
    expect(
      ajv.validate('/design-process/run@2', { ...validRun, status: 'retired', reason: 'the probe was wrong' }),
    ).toBe(true)
  })

  it('wraps each dialect in its own file version: facts@2 refuses fact@1 kebab entries', () => {
    expect(ajv.validate('/design-process/facts@2', { version: '2', facts: [{ ...validFact, id: 'kebab-fact' }] })).toBe(
      false,
    )
    expect(ajv.validate('/design-process/facts@2', { version: '2', facts: [validFact] })).toBe(true)
  })
})
