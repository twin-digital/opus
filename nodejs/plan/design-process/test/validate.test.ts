import { describe, expect, it } from 'vitest'

import { validateTree } from '../src/validate.js'
import { demoCoverage, demoProduct, demoWithDeferred, makeRepo, poolFiles, yaml } from './helpers.js'

import type { Finding } from '../src/types.js'

const check = (files: Record<string, string>): Finding[] => validateTree(makeRepo(files).tree)
const rules = (findings: Finding[]): string[] => findings.map((finding) => finding.rule)

describe('validateTree — tree-state rules', () => {
  it('passes a clean tree', () => {
    expect(check(demoProduct())).toEqual([])
  })

  it('fails a source file that does not validate against the schema its version names (d-i47qv6oa)', () => {
    const files = demoProduct()
    files['products/demo/increments/002/decisions.yaml'] = yaml({
      version: '1',
      decisions: [{ id: 'd-cccccccc', status: 'accepted' }], // no statement
    })
    expect(rules(check(files))).toContain('source-validates')
  })

  it('fails a version field resolving to no pool schema (r-bua9wl1s)', () => {
    const files = demoProduct()
    files['products/demo/increments/002/decisions.yaml'] = yaml({
      version: '9',
      decisions: [{ id: 'd-cccccccc', statement: 'x\n', status: 'accepted' }],
    })
    expect(rules(check(files))).toContain('version-resolves')
  })

  it('fails a missing version field', () => {
    const files = demoProduct()
    files['products/demo/increments/002/decisions.yaml'] = yaml({
      decisions: [{ id: 'd-cccccccc', statement: 'x\n', status: 'accepted' }],
    })
    expect(rules(check(files))).toContain('version-names-schema')
  })

  it('fails a malformed id (d-e5ted839)', () => {
    const files = demoProduct()
    files['products/demo/increments/002/decisions.yaml'] = yaml({
      version: '1',
      decisions: [{ id: 'd-UPPER!!', statement: 'x\n', status: 'accepted' }],
    })
    expect(rules(check(files))).toContain('id-format')
  })

  it('fails an id declared twice across a product (d-e5ted839)', () => {
    const files = demoProduct()
    files['products/demo/increments/002/decisions.yaml'] = yaml({
      version: '1',
      decisions: [{ id: 'd-aaaaaaaa', statement: 'again\n', status: 'accepted' }],
    })
    expect(rules(check(files))).toContain('id-unique')
  })

  it('fails a decision still proposed (r-0axqvtcc)', () => {
    const files = demoProduct()
    files['products/demo/increments/002/decisions.yaml'] = yaml({
      version: '1',
      decisions: [{ id: 'd-dddddddd', statement: 'x\n', status: 'proposed' }],
    })
    expect(rules(check(files))).toContain('no-proposed-decision')
  })

  it('fails a questions source still carrying entries (r-ygg7q7rh)', () => {
    const files = demoProduct()
    files['products/demo/increments/002/questions.yaml'] = yaml({
      version: '1',
      questions: [{ id: 'q-aaaaaaaa', question: 'what about this?\n', answer: 'requirement' }],
    })
    expect(rules(check(files))).toContain('no-open-questions')
  })

  it('accepts a questions source with no questions block', () => {
    const files = demoProduct()
    files['products/demo/increments/002/questions.yaml'] = yaml({ version: '1' })
    expect(check(files)).toEqual([])
  })

  it('fails a because citation no increment declares (d-eaw3u72o)', () => {
    const files = demoProduct()
    files['products/demo/increments/002/decisions.yaml'] = yaml({
      version: '1',
      decisions: [{ id: 'd-dddddddd', statement: 'x\n', status: 'accepted', because: ['d-zzzzzzzz'] }],
    })
    expect(rules(check(files))).toContain('citation-resolves')
  })

  it('fails a because citation of an open question (r-m36ie8ee)', () => {
    const files = demoProduct()
    files['products/demo/increments/002/decisions.yaml'] = yaml({
      version: '1',
      decisions: [{ id: 'd-dddddddd', statement: 'x\n', status: 'accepted', because: ['q-aaaaaaaa'] }],
    })
    expect(rules(check(files))).toContain('citation-not-question')
  })

  it('resolves f: citations against the facts pool', () => {
    const files = demoProduct()
    files['facts/demo.yml'] = yaml({
      version: '1',
      facts: [
        {
          id: 'a-real-fact',
          claim: 'something observed\n',
          backing: 'assumed',
          sources: [{ description: 'the mechanism this fact assumes' }],
        },
      ],
    })
    files['products/demo/increments/002/decisions.yaml'] = yaml({
      version: '1',
      decisions: [
        { id: 'd-dddddddd', statement: 'x\n', status: 'accepted', because: ['f:a-real-fact'] },
        { id: 'd-eeeeeeee', statement: 'y\n', status: 'accepted', because: ['f:no-such-fact'] },
      ],
    })
    const findings = check(files)
    expect(rules(findings)).toContain('citation-resolves')
    expect(findings.filter((finding) => finding.rule === 'citation-resolves')).toHaveLength(1)
  })

  it('fails an in-force citation of a retired fact, in because and informed_by alike', () => {
    const files = demoProduct()
    files['facts/demo.yml'] = yaml({
      version: '1',
      facts: [
        {
          id: 'old-finding',
          claim: 'superseded observation\n',
          backing: 'assumed',
          status: 'retired',
          reason: 'superseded',
          superseded_by: 'new-finding',
          sources: [{ description: 'the mechanism the earlier observation assumed' }],
        },
        {
          id: 'new-finding',
          claim: 'current observation\n',
          backing: 'assumed',
          sources: [{ description: 'the mechanism this observation assumes' }],
        },
      ],
    })
    files['products/demo/increments/002/decisions.yaml'] = yaml({
      version: '1',
      decisions: [
        {
          id: 'd-cccccccc',
          statement: 'rests on stale evidence.\n',
          status: 'accepted',
          supersedes: 'd-aaaaaaaa',
          because: ['f:old-finding'],
        },
      ],
    })
    files['products/demo/increments/002/requirements.yaml'] = yaml({
      version: '1',
      requirements: [
        { id: 'r-cccccccc', statement: 'first, amended.\n', amends: 'r-aaaaaaaa', informed_by: ['f:old-finding'] },
      ],
    })
    const findings = check(files).filter((finding) => finding.rule === 'citation-fact-retired')
    expect(findings).toHaveLength(2)
  })

  it('allows an out-of-force entry to keep citing a fact that later retired', () => {
    const files = demoProduct()
    files['facts/demo.yml'] = yaml({
      version: '1',
      facts: [
        {
          id: 'old-finding',
          claim: 'superseded observation\n',
          backing: 'assumed',
          status: 'retired',
          reason: 'superseded',
          superseded_by: 'new-finding',
          sources: [{ description: 'the mechanism the earlier observation assumed' }],
        },
        {
          id: 'new-finding',
          claim: 'current observation\n',
          backing: 'assumed',
          sources: [{ description: 'the mechanism this observation assumes' }],
        },
      ],
    })
    // d-aaaaaaaa cites the retired fact but is superseded by d-cccccccc in increment 002
    files['products/demo/increments/001/decisions.yaml'] = yaml({
      version: '1',
      decisions: [
        {
          id: 'd-aaaaaaaa',
          statement: 'the first thing is done the simple way.\n',
          status: 'accepted',
          because: ['f:old-finding'],
        },
        {
          id: 'd-bbbbbbbb',
          statement: 'the second thing builds on the first.\n',
          status: 'delegated',
          because: ['d-aaaaaaaa'],
        },
      ],
    })
    expect(check(files)).toEqual([])
  })

  it('resolves informed_by citations like because citations', () => {
    const files = demoProduct()
    files['products/demo/increments/002/requirements.yaml'] = yaml({
      version: '1',
      requirements: [
        { id: 'r-cccccccc', statement: 'first, amended.\n', amends: 'r-aaaaaaaa', informed_by: ['f:no-such-fact'] },
      ],
    })
    expect(rules(check(files))).toContain('citation-resolves')
  })

  it('fails a model binding no pool schema holds (r-bua9wl1s)', () => {
    const files = demoProduct()
    files['products/demo/increments/002/requirements.yaml'] = yaml({
      version: '1',
      model: [{ name: 'ghost', schema: '/design-process/ghost@1' }],
    })
    expect(rules(check(files))).toContain('model-ref-resolves')
  })

  it('fails duplicate model entity names in one increment (r-bua9wl1s)', () => {
    const files = demoProduct()
    files['products/demo/increments/002/requirements.yaml'] = yaml({
      version: '1',
      model: [
        { name: 'demo-config', schema: '/design-process/product@1' },
        { name: 'demo-config', schema: '/design-process/question@1' },
      ],
    })
    expect(rules(check(files))).toContain('model-name-unique')
  })

  it('fails a gap in the increment sequence (d-d6hwdg9d)', () => {
    const files = demoProduct()
    files['products/demo/increments/004/decisions.yaml'] = yaml({
      version: '1',
      decisions: [{ id: 'd-ffffffff', statement: 'x\n', status: 'accepted' }],
    })
    expect(rules(check(files))).toContain('increment-sequence-dense')
  })
})

describe('validateTree — deferred decisions', () => {
  it('accepts a deferred decision in a version-2 decisions source (d-uz9wis6a)', () => {
    expect(check(demoWithDeferred())).toEqual([])
  })

  it('fails a version-1 decisions source carrying deferred (d-uz9wis6a)', () => {
    const files = demoProduct()
    files['products/demo/increments/002/decisions.yaml'] = yaml({
      version: '1',
      decisions: [{ id: 'd-dddddddd', statement: 'x\n', status: 'deferred' }],
    })
    expect(rules(check(files))).toContain('source-validates')
  })

  it('still fails a proposed decision in a version-2 source (r-0axqvtcc)', () => {
    const files = demoProduct()
    files['products/demo/increments/002/decisions.yaml'] = yaml({
      version: '2',
      decisions: [{ id: 'd-dddddddd', statement: 'x\n', status: 'proposed' }],
    })
    expect(rules(check(files))).toContain('no-proposed-decision')
  })

  it('fails a record coverage entry naming a deferred decision (d-3orwwaze)', () => {
    const files = demoWithDeferred()
    files['implementations/demo/002-1.yaml'] = yaml({
      version: '1',
      product: 'demo',
      target: 2,
      packages: [{ path: 'nodejs/demo', version: '1.0.0' }],
      coverage: [...demoCoverage(), { claim: 'd-dddddddd', covered_by: [{ kind: 'attestation' }] }],
    })
    const findings = check(files)
    expect(rules(findings)).toContain('record-covers-deferred')
    expect(findings.find((finding) => finding.rule === 'record-covers-deferred')?.claims).toContain('d-3orwwaze')
  })

  it('accepts a record omitting a deferred decision — a deferral is not a gap (d-3orwwaze)', () => {
    const files = demoWithDeferred()
    files['implementations/demo/002-1.yaml'] = yaml({
      version: '1',
      product: 'demo',
      target: 2,
      packages: [{ path: 'nodejs/demo', version: '1.0.0' }],
      coverage: demoCoverage(),
    })
    expect(check(files)).toEqual([])
  })

  it('fails an in-force deferred decision citing a retired fact (d-3orwwaze)', () => {
    const files = demoWithDeferred()
    files['facts/demo.yml'] = yaml({
      version: '1',
      facts: [
        {
          id: 'old-finding',
          claim: 'superseded observation\n',
          backing: 'assumed',
          status: 'retired',
          reason: 'superseded',
          superseded_by: 'new-finding',
          sources: [{ description: 'the mechanism the earlier observation assumed' }],
        },
        {
          id: 'new-finding',
          claim: 'current observation\n',
          backing: 'assumed',
          sources: [{ description: 'the mechanism this observation assumes' }],
        },
      ],
    })
    files['products/demo/increments/002/decisions.yaml'] = yaml({
      version: '2',
      decisions: [
        {
          id: 'd-dddddddd',
          statement: 'awaits its answer, resting on stale evidence.\n',
          status: 'deferred',
          because: ['f:old-finding'],
        },
      ],
    })
    expect(rules(check(files))).toContain('citation-fact-retired')
  })
})

describe('validateTree — presets (r-bwtud1e5)', () => {
  const withPreset = (
    presetEntry: Record<string, unknown>,
    presetFiles?: Record<string, string>,
  ): Record<string, string> => {
    const files = demoProduct()
    Object.assign(files, presetFiles)
    files['products/demo/increments/002/requirements.yaml'] = yaml({
      version: '1',
      presets: [presetEntry],
    })
    return files
  }
  const presetProduct = (requirementId = 'r-pppppppp'): Record<string, string> => ({
    'products/nodejs-library/product.yaml': yaml({ version: '1', kind: 'requirement-preset' }),
    'products/nodejs-library/increments/001/requirements.yaml': yaml({
      version: '1',
      requirements: [{ id: requirementId, statement: 'the library behaves.\n' }],
    }),
  })

  it('accepts a well-formed adoption', () => {
    expect(check(withPreset({ name: 'nodejs-library', version: 1 }, presetProduct()))).toEqual([])
  })

  it('resolves a citation of a requirement in force through an adopted preset (d-eaw3u72o)', () => {
    const files = withPreset({ name: 'nodejs-library', version: 1 }, presetProduct())
    files['products/demo/increments/002/decisions.yaml'] = yaml({
      version: '2',
      decisions: [
        {
          id: 'd-eeeeeeee',
          title: 'a decision resting on an adopted requirement',
          statement: 'the adopted requirement is what this rests on.\n',
          status: 'accepted',
          because: ['r-pppppppp'],
        },
      ],
    })
    expect(check(files)).toEqual([])
  })

  it('fails adopting an undeclared preset', () => {
    expect(rules(check(withPreset({ name: 'nodejs-library', version: 1 })))).toContain('preset-resolves')
  })

  it('fails adopting a product that is not a requirement-preset', () => {
    const preset = presetProduct()
    preset['products/nodejs-library/product.yaml'] = yaml({ version: '1', kind: 'nodejs-library' })
    expect(rules(check(withPreset({ name: 'nodejs-library', version: 1 }, preset)))).toContain('preset-kind')
  })

  it('fails adopting a version the preset has not published', () => {
    expect(rules(check(withPreset({ name: 'nodejs-library', version: 3 }, presetProduct())))).toContain(
      'preset-version-published',
    )
  })

  it('fails adopting and dropping one preset in one increment', () => {
    const files = demoProduct()
    Object.assign(files, presetProduct())
    files['products/demo/increments/002/requirements.yaml'] = yaml({
      version: '1',
      presets: [
        { name: 'nodejs-library', version: 1 },
        { name: 'nodejs-library', status: 'dropped' },
      ],
    })
    expect(rules(check(files))).toContain('preset-adopt-and-drop')
  })

  it('fails an adopted requirement colliding with a product-local one', () => {
    expect(rules(check(withPreset({ name: 'nodejs-library', version: 1 }, presetProduct('r-bbbbbbbb'))))).toContain(
      'preset-conflict',
    )
  })

  it('does not read a retired product-local declaration as a collision (d-wlkql151)', () => {
    // the motivating move: r-bbbbbbbb leaves the product for a preset the product adopts
    const files = withPreset({ name: 'nodejs-library', version: 1 }, presetProduct('r-bbbbbbbb'))
    files['products/demo/increments/002/requirements.yaml'] = yaml({
      version: '1',
      presets: [{ name: 'nodejs-library', version: 1 }],
      retires: [{ id: 'r-bbbbbbbb', reason: 'moved into the nodejs-library preset.\n' }],
    })
    expect(check(files)).toEqual([])
  })
})

describe('validateTree — preset closures (d-wis1whfn)', () => {
  /** A preset product at increment 1: its own requirements, and the presets it adopts. */
  const preset = (
    name: string,
    requirementIds: string[],
    adopts: { name: string; version: number }[] = [],
    increment = 1,
  ): Record<string, string> => {
    const source: Record<string, unknown> = { version: '1' }
    if (requirementIds.length > 0) {
      source.requirements = requirementIds.map((id) => ({ id, statement: `${name} behaves.\n` }))
    }
    if (adopts.length > 0) {
      source.presets = adopts
    }
    return {
      [`products/${name}/product.yaml`]: yaml({ version: '1', kind: 'requirement-preset' }),
      [`products/${name}/increments/${String(increment).padStart(3, '0')}/requirements.yaml`]: yaml(source),
    }
  }

  /** The real hierarchy: a diamond over monorepo-package, reached by two paths. */
  const hierarchy = (): Record<string, string> => ({
    ...preset('monorepo-package', ['r-mpmpmpmp']),
    ...preset('nodejs', ['r-njnjnjnj'], [{ name: 'monorepo-package', version: 1 }]),
    ...preset('nodejs-library', ['r-nlnlnlnl'], [{ name: 'nodejs', version: 1 }]),
    ...preset('minecraft-addon', ['r-mamamama'], [{ name: 'monorepo-package', version: 1 }]),
  })

  const adopting = (
    adopts: { name: string; version: number }[],
    presetFiles: Record<string, string>,
  ): Record<string, string> => {
    const files = { ...demoProduct(), ...presetFiles }
    files['products/demo/increments/002/requirements.yaml'] = yaml({ version: '1', presets: adopts })
    return files
  }

  const diamond = (): Record<string, string> =>
    adopting(
      [
        { name: 'nodejs-library', version: 1 },
        { name: 'minecraft-addon', version: 1 },
      ],
      hierarchy(),
    )

  it('accepts a preset that adopts a preset', () => {
    expect(check(adopting([{ name: 'nodejs-library', version: 1 }], hierarchy()))).toEqual([])
  })

  it('accepts a preset reached by two paths, contributing once', () => {
    expect(check(diamond())).toEqual([])
  })

  it('fails a cycle, naming the path that closes it', () => {
    const files = adopting([{ name: 'left', version: 1 }], {
      ...preset('left', ['r-leftleft'], [{ name: 'right', version: 1 }]),
      ...preset('right', ['r-rightrig'], [{ name: 'left', version: 1 }]),
    })
    const cycles = check(files).filter((finding) => finding.rule === 'preset-cycle')
    expect(cycles.map((finding) => finding.message)).toContain('preset adoption cycles: demo → left → right → left')
  })

  it('fails one preset reached at two versions in one closure', () => {
    const files = diamond()
    Object.assign(files, preset('monorepo-package', ['r-mpmpmpm2'], [], 2))
    files['products/minecraft-addon/increments/001/requirements.yaml'] = yaml({
      version: '1',
      requirements: [{ id: 'r-mamamama', statement: 'minecraft-addon behaves.\n' }],
      presets: [{ name: 'monorepo-package', version: 2 }],
    })
    const findings = check(files).filter((finding) => finding.rule === 'preset-version-conflict')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toBe(
      'monorepo-package is reached at version 1 by demo → nodejs-library → nodejs → monorepo-package and at version 2 by demo → minecraft-addon → monorepo-package',
    )
  })

  it('fails two presets in one closure declaring one requirement id (d-wlkql151)', () => {
    const files = adopting(
      [
        { name: 'nodejs-library', version: 1 },
        { name: 'minecraft-addon', version: 1 },
      ],
      { ...hierarchy(), ...preset('minecraft-addon', ['r-njnjnjnj'], [{ name: 'monorepo-package', version: 1 }]) },
    )
    const findings = check(files).filter((finding) => finding.rule === 'preset-conflict')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toBe('nodejs@1 and adopted minecraft-addon@1 both declare r-njnjnjnj')
  })

  it('holds a record to covering the requirements the whole closure contributes', () => {
    const files = adopting([{ name: 'nodejs-library', version: 1 }], hierarchy())
    files['implementations/demo/002-1.yaml'] = yaml({
      version: '1',
      product: 'demo',
      target: 2,
      built_at: '2026-08-01',
      packages: [{ path: 'nodejs/demo', version: '1.0.0' }],
      coverage: ['r-aaaaaaaa', 'r-bbbbbbbb', 'd-bbbbbbbb', 'd-cccccccc', 'r-nlnlnlnl'].map((claim) => ({
        claim,
        covered_by: [{ kind: 'attestation' }],
      })),
    })
    const missing = check(files).filter((finding) => finding.rule === 'record-coverage-complete')
    expect(missing).toHaveLength(1)
    expect(missing[0]?.message).toContain('r-mpmpmpmp')
    expect(missing[0]?.message).toContain('r-njnjnjnj')
  })
})

describe('validateTree — implementation records', () => {
  const record = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    version: '1',
    product: 'demo',
    target: 2,
    built_at: '2026-08-01',
    packages: [{ path: 'nodejs/demo', version: '1.0.0' }],
    coverage: demoCoverage(),
    ...overrides,
  })

  it('accepts a well-formed record', () => {
    const files = demoProduct()
    files['implementations/demo/002-1.yaml'] = yaml(record())
    expect(check(files)).toEqual([])
  })

  it('fails a record whose file name does not carry its target (d-vsrxwv8u)', () => {
    const files = demoProduct()
    files['implementations/demo/001-1.yaml'] = yaml(record())
    expect(rules(check(files))).toContain('record-name')
  })

  it('fails a record targeting an unpublished increment', () => {
    const files = demoProduct()
    files['implementations/demo/009-1.yaml'] = yaml(record({ target: 9 }))
    expect(rules(check(files))).toContain('record-target-published')
  })

  it('fails coverage naming a claim not in force at the target (d-0nl6sd96)', () => {
    const files = demoProduct()
    files['implementations/demo/002-1.yaml'] = yaml(
      record({ coverage: [...demoCoverage(), { claim: 'r-aaaaaaaa', covered_by: [{ kind: 'attestation' }] }] }),
    )
    expect(rules(check(files))).toContain('record-claim-in-force')
  })

  it('fails ordinals that are not dense from 1 (d-vsrxwv8u)', () => {
    const files = demoProduct()
    files['implementations/demo/002-2.yaml'] = yaml(record())
    expect(rules(check(files))).toContain('record-ordinal-dense')
  })

  it('fails a record whose coverage misses a claim in force at its target (d-3orwwaze)', () => {
    const files = demoProduct()
    files['implementations/demo/002-1.yaml'] = yaml(
      record({ coverage: demoCoverage().filter((entry) => entry.claim !== 'd-bbbbbbbb') }),
    )
    const findings = check(files)
    expect(rules(findings)).toContain('record-coverage-complete')
    expect(findings.find((finding) => finding.rule === 'record-coverage-complete')?.message).toContain('d-bbbbbbbb')
  })

  it('requires coverage of adopted preset requirements (d-3orwwaze)', () => {
    const files = demoProduct()
    files['products/nodejs-library/product.yaml'] = yaml({ version: '1', kind: 'requirement-preset' })
    files['products/nodejs-library/increments/001/requirements.yaml'] = yaml({
      version: '1',
      requirements: [{ id: 'r-pppppppp', statement: 'the library behaves.\n' }],
    })
    files['products/demo/increments/002/requirements.yaml'] = yaml({
      version: '1',
      requirements: [
        { id: 'r-cccccccc', statement: 'the product does the first thing faster.\n', amends: 'r-aaaaaaaa' },
      ],
      presets: [{ name: 'nodejs-library', version: 1 }],
    })
    files['implementations/demo/002-1.yaml'] = yaml(record())
    const findings = check(files)
    expect(findings.find((finding) => finding.rule === 'record-coverage-complete')?.message).toContain('r-pppppppp')
  })

  it('fails a schema-invalid record (d-i47qv6oa)', () => {
    const files = demoProduct()
    files['implementations/demo/002-1.yaml'] = yaml(record({ packages: [{ path: 'nodejs/demo' }] }))
    expect(rules(check(files))).toContain('source-validates')
  })
})

describe('validateTree — schema pool', () => {
  it('fails a $ref resolving to no pool schema (r-2fytqadu)', () => {
    const files = demoProduct()
    files['schemas/demo/broken.1.yaml'] = [
      '$schema: https://json-schema.org/draft/2020-12/schema',
      '$id: /demo/broken@1',
      '$ref: "/demo/missing@1"',
    ].join('\n')
    expect(rules(check(files))).toContain('schema-ref-resolves')
  })
})
