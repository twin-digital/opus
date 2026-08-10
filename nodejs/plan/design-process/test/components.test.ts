import { describe, expect, it } from 'vitest'

import { componentTree, scopeIds, subtree } from '../src/components.js'
import { foldProduct } from '../src/fold.js'
import { loadProducts } from '../src/load.js'
import { validateTree } from '../src/validate.js'
import { demoV3, makeRepo, yaml } from './helpers.js'

import type { Fold } from '../src/fold.js'
import type { Finding } from '../src/types.js'

const foldDemo = (files: Record<string, string>): Fold => {
  const { tree } = makeRepo(files)
  return foldProduct(loadProducts(tree).products.get('demo3')!)
}

const check = (files: Record<string, string>): Finding[] => validateTree(makeRepo(files).tree)
const rules = (findings: Finding[]): string[] => findings.map((finding) => finding.rule)

describe('the component fold and tree (d-rk99dwty, d-cgr6q2j1)', () => {
  it('folds components by id: a redeclaration replaces, and the latest state is current (d-cc3nilxq)', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      components: [{ id: 'parser', description: 'the parser, re-homed', parent: undefined }],
    })
    const fold = foldDemo(files)
    expect(fold.components.get('parser')?.entry.description).toBe('the parser, re-homed')
    expect(fold.components.get('parser')?.entry.parent).toBeUndefined()
    expect(fold.components.get('engine')?.entry.description).toBe('the core engine')
  })

  it('keeps a retired declaration as current state, off the live set', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      components: [{ id: 'parser', description: 'the input parser', status: 'retired', reason: 'folded into engine' }],
    })
    const tree = componentTree(foldDemo(files))
    expect(tree.entries.has('parser')).toBe(true)
    expect(tree.live.has('parser')).toBe(false)
    expect(tree.live.has('engine')).toBe(true)
  })

  it('reads a scope as the named subtree: the component and everything beneath it (d-rplsevuk)', () => {
    const tree = componentTree(foldDemo(demoV3()))
    expect(subtree(tree, 'engine')).toEqual(new Set(['engine', 'parser']))
    expect(subtree(tree, 'parser')).toEqual(new Set(['parser']))
  })

  it('reads one id and a list the same way (d-hl3l8df0)', () => {
    expect(scopeIds('engine')).toEqual(['engine'])
    expect(scopeIds(['engine', 'parser'])).toEqual(['engine', 'parser'])
    expect(scopeIds(undefined)).toEqual([])
  })

  it('terminates the subtree walk on a cyclic fold, leaving the cycle to the validator (d-x3ar9r8q)', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      components: [{ id: 'engine', description: 'the core engine', parent: 'parser' }],
    })
    const tree = componentTree(foldDemo(files))
    expect(subtree(tree, 'engine')).toEqual(new Set(['engine', 'parser']))
  })
})

describe('component declaration gates (d-cgr6q2j1, d-cc3nilxq, d-hl3l8df0, d-3kow7q0r)', () => {
  it('finds a parent that does not resolve (d-cgr6q2j1)', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      components: [{ id: 'lexer', description: 'the lexer', parent: 'no-such-component' }],
    })
    expect(rules(check(files))).toContain('component-parent-resolves')
  })

  it('finds a cycle at the increment that would close it (d-x3ar9r8q)', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      components: [{ id: 'engine', description: 'the core engine', parent: 'parser' }],
    })
    expect(rules(check(files))).toContain('component-acyclic')
  })

  it('refuses retirement while an in-force foundation is scoped to the component (d-cc3nilxq)', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      components: [{ id: 'engine', description: 'the core engine', status: 'retired', reason: 'split apart' }],
    })
    expect(rules(check(files))).toContain('component-retirement-guarded')
  })

  it('refuses retirement while a live component names it as parent (d-cc3nilxq)', () => {
    const files = demoV3()
    files['products/demo3/increments/001/requirements.yaml'] = yaml({
      version: '3',
      components: [
        { id: 'engine', description: 'the core engine' },
        { id: 'parser', description: 'the input parser', parent: 'engine' },
      ],
      requirements: [{ id: 'r-aaaaaaaa', statement: 'unscoped.\n' }],
    })
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      components: [{ id: 'engine', description: 'the core engine', status: 'retired', reason: 'split apart' }],
    })
    expect(rules(check(files))).toContain('component-retirement-guarded')
  })

  it('lets retirement through when superseded_by resolves the scope references (d-cc3nilxq)', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      components: [
        { id: 'core', description: 'engine and parser, folded together' },
        {
          id: 'engine',
          description: 'the core engine',
          status: 'retired',
          reason: 'folded into core',
          superseded_by: 'core',
        },
        { id: 'parser', description: 'the input parser', parent: 'core' },
      ],
    })
    expect(rules(check(files))).not.toContain('component-retirement-guarded')
  })

  it('finds a scope naming no live component, on requirements and decisions (d-hl3l8df0)', () => {
    const files = demoV3()
    files['products/demo3/increments/002/decisions.yaml'] = yaml({
      version: '3',
      decisions: [{ id: 'd-bbbbbbbb', statement: 'scoped nowhere.\n', status: 'accepted', scope: 'no-such' }],
    })
    expect(rules(check(files))).toContain('scope-resolves')
  })

  it('finds a preset entry scope naming no live component (d-ue31prqs)', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      presets: [{ name: 'some-preset', version: 1, scope: 'no-such' }],
    })
    expect(rules(check(files))).toContain('scope-resolves')
  })

  it('finds a requirement-preset product declaring components or scoping its own requirements (d-5gz40hdo)', () => {
    const files = demoV3()
    files['products/some-preset/product.yaml'] = yaml({ version: '2', kind: 'requirement-preset' })
    files['products/some-preset/increments/001/requirements.yaml'] = yaml({
      version: '3',
      components: [{ id: 'part', description: 'a part a preset may not declare' }],
      requirements: [{ id: 'r-eeeeeeee', statement: 'a preset requirement.\n', scope: 'part' }],
    })
    const found = rules(check(files))
    expect(found).toContain('preset-declares-no-components')
    expect(found).toContain('preset-requirement-unscoped')
  })

  it('fails one increment declaring one component twice (d-3kow7q0r)', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      components: [
        { id: 'lexer', description: 'declared once' },
        { id: 'lexer', description: 'declared twice' },
      ],
    })
    expect(rules(check(files))).toContain('state-entry-declared-once')
  })

  it('reports — not guards — a re-parenting, naming the in-force claims whose reach changes (d-uw3ilu6d)', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      components: [
        { id: 'io', description: 'input and output' },
        { id: 'parser', description: 'the input parser', parent: 'io' },
      ],
    })
    const findings = check(files)
    const report = findings.find((finding) => finding.rule === 'component-reparented')
    expect(report?.severity).toBe('report')
    expect(report?.message).toContain('r-aaaaaaaa')
  })

  it('resolves coverage through the component tree to the packages declaring those components (d-bz5k3yz7)', () => {
    // a claim scoped to parser is answered by the package declaring engine, parser's ancestor
    const files = demoV3()
    files['implementations/demo3/001-1.yaml'] = yaml({
      version: '1',
      product: 'demo3',
      target: 1,
      packages: [{ path: 'nodejs/demo3', version: '1.0.0' }],
      coverage: [
        { claim: 'r-aaaaaaaa', covered_by: [{ kind: 'attestation' }] },
        { claim: 'r-bbbbbbbb', covered_by: [{ kind: 'attestation' }] },
        { claim: 'd-aaaaaaaa', covered_by: [{ kind: 'attestation' }] },
      ],
    })
    expect(check(files)).toEqual([])
  })
})
