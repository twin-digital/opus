import { describe, expect, it } from 'vitest'

import { coverableClaimIds, foldProduct } from '../src/fold.js'
import { loadProducts } from '../src/load.js'
import { demoProduct, demoWithDeferred, makeRepo, yaml } from './helpers.js'

import type { Product } from '../src/load.js'

const loadDemo = (files: Record<string, string>): Product => {
  const { tree } = makeRepo(files)
  return loadProducts(tree).products.get('demo')!
}

describe('foldProduct (d-g5cs9o4i)', () => {
  it('folds amends and supersedes: the replacement is in force, the target is not', () => {
    const fold = foldProduct(loadDemo(demoProduct()))
    expect([...fold.requirements.keys()].sort()).toEqual(['r-bbbbbbbb', 'r-cccccccc'])
    expect([...fold.decisions.keys()].sort()).toEqual(['d-bbbbbbbb', 'd-cccccccc'])
    expect(fold.outOfForce).toEqual([
      { id: 'r-aaaaaaaa', kind: 'requirement', how: 'superseded', by: 'r-cccccccc', increment: 2 },
      { id: 'd-aaaaaaaa', kind: 'decision', how: 'superseded', by: 'd-cccccccc', increment: 2 },
    ])
  })

  it('folds at an earlier increment', () => {
    const fold = foldProduct(loadDemo(demoProduct()), 1)
    expect([...fold.requirements.keys()].sort()).toEqual(['r-aaaaaaaa', 'r-bbbbbbbb'])
    expect(fold.decisions.has('d-aaaaaaaa')).toBe(true)
  })

  it('applies retires: entries with a reason (d-jy7x42nx)', () => {
    const files = demoProduct()
    files['products/demo/increments/002/requirements.yaml'] = yaml({
      version: '1',
      retires: [{ id: 'r-aaaaaaaa', reason: 'the first thing no longer exists' }],
    })
    const fold = foldProduct(loadDemo(files))
    expect(fold.requirements.has('r-aaaaaaaa')).toBe(false)
    expect(fold.outOfForce[0]).toMatchObject({ id: 'r-aaaaaaaa', how: 'retired' })
  })

  it('folds model entries by name; unbound removes (d-ke7709uf)', () => {
    const files = demoProduct()
    files['products/demo/increments/002/requirements.yaml'] = yaml({
      version: '1',
      requirements: [{ id: 'r-cccccccc', statement: 'kept.\n', amends: 'r-aaaaaaaa' }],
      model: [{ name: 'demo-config', status: 'unbound' }],
    })
    expect(foldProduct(loadDemo(files)).model.size).toBe(0)
  })

  it('folds presets by name; dropped removes (d-k48jh86c)', () => {
    const files = demoProduct()
    files['products/demo/increments/001/requirements.yaml'] = yaml({
      version: '1',
      requirements: [
        { id: 'r-aaaaaaaa', statement: 'first.\n' },
        { id: 'r-bbbbbbbb', statement: 'second.\n' },
      ],
      presets: [{ name: 'nodejs-library', version: 1 }],
    })
    files['products/demo/increments/002/requirements.yaml'] = yaml({
      version: '1',
      requirements: [{ id: 'r-cccccccc', statement: 'amended.\n', amends: 'r-aaaaaaaa' }],
      presets: [{ name: 'nodejs-library', status: 'dropped' }],
    })
    expect(foldProduct(loadDemo(files)).presets.size).toBe(0)
    expect(foldProduct(loadDemo(files), 1).presets.size).toBe(1)
  })
})

describe('coverableClaimIds (d-0nl6sd96)', () => {
  it('excludes rejected decisions from the coverable set', () => {
    const files = demoProduct()
    files['products/demo/increments/002/decisions.yaml'] = yaml({
      version: '1',
      decisions: [
        {
          id: 'd-cccccccc',
          statement: 'did not survive.\n',
          status: 'rejected',
          rejection_reason: 'non-viable',
        },
      ],
    })
    const claims = coverableClaimIds(foldProduct(loadDemo(files)))
    expect(claims.has('d-cccccccc')).toBe(false)
    expect(claims.has('d-bbbbbbbb')).toBe(true)
    expect(claims.has('r-cccccccc')).toBe(true)
  })

  it('excludes deferred decisions from the coverable set while they stay in force (d-3orwwaze)', () => {
    const fold = foldProduct(loadDemo(demoWithDeferred()))
    expect(fold.decisions.has('d-dddddddd')).toBe(true)
    const claims = coverableClaimIds(fold)
    expect(claims.has('d-dddddddd')).toBe(false)
    expect(claims.has('d-cccccccc')).toBe(true)
  })
})
