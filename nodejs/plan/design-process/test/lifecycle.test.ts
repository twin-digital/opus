import { describe, expect, it } from 'vitest'

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

describe('the log regime: requirements and decisions never change, successors close them (d-sm7l2s7l, d-4i5k9nsi)', () => {
  it('folds a requirement@2 supersedes like requirement@1 amends', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      requirements: [{ id: 'r-cccccccc', statement: 'the first thing, faster.\n', supersedes: 'r-aaaaaaaa' }],
    })
    const fold = foldDemo(files)
    expect(fold.requirements.has('r-aaaaaaaa')).toBe(false)
    expect(fold.requirements.has('r-cccccccc')).toBe(true)
    expect(fold.outOfForce).toContainEqual({
      id: 'r-aaaaaaaa',
      kind: 'requirement',
      how: 'superseded',
      by: 'r-cccccccc',
      increment: 2,
    })
  })
})

describe('the state regime: presets, model entries, components, and terms redeclare by name (d-sm7l2s7l)', () => {
  it('folds a requirements@3 retired preset as current state, out of the closure (d-cizeaklk)', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      presets: [{ name: 'some-preset', status: 'retired', reason: 'its requirements moved in-product' }],
    })
    const fold = foldDemo(files)
    expect(fold.presets.get('some-preset')?.entry.status).toBe('retired')
    expect(fold.presets.get('some-preset')?.entry.reason).toBe('its requirements moved in-product')
  })

  it('folds a requirements@3 retired model entry out of force (d-vax1016k)', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      model: [{ name: 'demo-config', status: 'retired', reason: 'the shape moved to its consumer' }],
    })
    expect(foldDemo(files).model.has('demo-config')).toBe(false)
  })
})

// Code-wave rules over the lifecycle vocabulary.
describe.skip('lifecycle gates (Code wave)', () => {
  it('fails applying and retiring one preset in a single increment (d-3kow7q0r)', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      presets: [
        { name: 'some-preset', version: 1 },
        { name: 'some-preset', status: 'retired', reason: 'changed our mind mid-increment' },
      ],
    })
    expect(rules(check(files))).toContain('state-entry-declared-once')
  })

  it('fails one increment declaring one preset or model entity twice (d-3kow7q0r)', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      model: [
        { name: 'demo-config', schema: '/design-process/product@1' },
        { name: 'demo-config', schema: '/design-process/product@2' },
      ],
    })
    expect(rules(check(files))).toContain('state-entry-declared-once')
  })

  it("keeps a retired product's fold readable and its published increments standing (d-i849afta)", () => {
    const files = demoV3()
    files['products/demo3/product.yaml'] = yaml({
      version: '2',
      kind: 'nodejs-library',
      status: 'retired',
      reason: 'replaced by demo4',
      packages: [{ path: 'nodejs/demo3', kind: 'npm-library' }],
    })
    expect(check(files)).toEqual([])
    expect(foldDemo(files).requirements.size).toBeGreaterThan(0)
  })

  it('finds a draft applying a retired preset at a new version; applied versions stand (d-i849afta)', () => {
    const files = demoV3()
    files['products/some-preset/product.yaml'] = yaml({
      version: '2',
      kind: 'requirement-preset',
      status: 'retired',
      reason: 'no longer maintained',
    })
    files['products/some-preset/increments/001/requirements.yaml'] = yaml({
      version: '3',
      requirements: [{ id: 'r-ffffffff', statement: 'a preset requirement.\n' }],
    })
    files['products/some-preset/increments/002/requirements.yaml'] = yaml({
      version: '3',
      requirements: [{ id: 'r-eeeeeeee', statement: 'another preset requirement.\n' }],
    })
    // the published application at @1 stands
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      presets: [{ name: 'some-preset', version: 1 }],
    })
    expect(rules(check(files))).not.toContain('preset-product-retired')
    // a draft moving to @2 is applying the retired preset at a new version
    files['products/demo3/increments/wip-001-move/requirements.yaml'] = yaml({
      version: '3',
      presets: [{ name: 'some-preset', version: 2 }],
    })
    expect(rules(check(files))).toContain('preset-product-retired')
  })

  it('moves a requirement from a product into a preset it applies without a conflict (d-492sxcc9)', () => {
    const files = demoV3()
    files['products/some-preset/product.yaml'] = yaml({ version: '2', kind: 'requirement-preset' })
    files['products/some-preset/increments/001/requirements.yaml'] = yaml({
      version: '3',
      requirements: [{ id: 'r-aaaaaaaa', statement: 'the product does the first thing.\n' }],
    })
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      retires: [{ id: 'r-aaaaaaaa', reason: 'moved into some-preset' }],
      presets: [{ name: 'some-preset', version: 1 }],
    })
    expect(rules(check(files))).not.toContain('preset-conflict')
  })
})
