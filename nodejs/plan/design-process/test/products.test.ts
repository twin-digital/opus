import { afterEach, describe, expect, it } from 'vitest'

import { findLandingConflicts } from '../src/conflicts.js'
import { loadProducts } from '../src/load.js'
import { projectProduct } from '../src/project.js'
import { DirTree } from '../src/tree.js'
import { validateTree } from '../src/validate.js'
import { resolveFold } from '../src/version.js'

import { demoProduct, makeRepo, removeRepo, yaml } from './helpers.js'

import type { Files } from './helpers.js'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    removeRepo(root)
  }
})

const repo = (files: Files): { root: string; tree: DirTree } => {
  const made = makeRepo(files)
  roots.push(made.root)
  return made
}

/** demoProduct, with the product's whole directory moved under a grouping subfolder. */
const grouped = (prefix: string): Files => {
  const files = demoProduct()
  const moved: Files = {}
  for (const [path, content] of Object.entries(files)) {
    moved[path.startsWith('products/demo/') ? path.replace('products/demo/', `products/${prefix}/demo/`) : path] =
      content
  }
  return moved
}

describe('a product is found wherever it sits under products/ — r-jx6uk0bs, d-34t7y2iq', () => {
  it('renders the same projection after the product moves into a subfolder', () => {
    const flat = repo(demoProduct())
    const nested = repo(grouped('plan'))
    expect(projectProduct(nested.tree, 'demo')).toEqual(projectProduct(flat.tree, 'demo'))
  })

  it('reports nothing about the product location', () => {
    const { tree } = repo(grouped('plan/tools'))
    expect(validateTree(tree, {})).toEqual([])
  })

  it("takes the declaring directory's name as the product id, whatever the path", () => {
    const { tree } = repo(grouped('plan'))
    const product = loadProducts(tree).products.get('demo')
    expect(product?.dir).toBe('products/plan/demo')
    expect([...loadProducts(tree).products.keys()]).toEqual(['demo'])
  })

  it('resolves a fold for the moved product under its unchanged id', () => {
    const { root } = repo(grouped('plan'))
    expect(resolveFold(root, 'demo').at).toBe(2)
  })
})

describe('two products declaring one id are a validator failure — d-34t7y2iq', () => {
  const twice = (): Files => ({
    ...grouped('plan'),
    'products/other/demo/product.yaml': yaml({ version: '1', kind: 'nodejs-library' }),
  })

  it('reports the second declaration of the id', () => {
    const { tree } = repo(twice())
    const findings = validateTree(tree, {}).filter((finding) => finding.rule === 'product-id-unique')
    expect(findings).toHaveLength(1)
    // the first root in path order claims the id; the other is the finding
    expect(findings[0]?.path).toBe('products/plan/demo/product.yaml')
    expect(findings[0]?.message).toContain('products/other/demo')
  })

  it('reports a second declaration file in one product root', () => {
    const { tree } = repo({ ...demoProduct(), 'products/demo/product.yml': yaml({ version: '1', kind: 'x' }) })
    const findings = validateTree(tree, {}).filter((finding) => finding.rule === 'product-id-unique')
    expect(findings).toHaveLength(1)
  })
})

describe('the scan does not descend into a product root — d-34t7y2iq', () => {
  const withFixture = (): Files => ({
    ...demoProduct(),
    'products/demo/increments/001/drafts/probe/product.yaml': yaml({ version: '1', kind: 'nodejs-library' }),
    'products/demo/increments/001/drafts/probe/increments/001/decisions.yaml': yaml({
      version: '1',
      decisions: [{ id: 'd-99999999', statement: 'a fixture ruling.\n', status: 'proposed' }],
    }),
  })

  it('declares no product from a declaration nested inside one', () => {
    const { tree } = repo(withFixture())
    expect([...loadProducts(tree).products.keys()]).toEqual(['demo'])
  })

  it('reports nothing about the nested fixture', () => {
    const { tree } = repo(withFixture())
    expect(validateTree(tree, {})).toEqual([])
  })
})

describe('increments with no declaration above them still report — d-34t7y2iq', () => {
  it('reports the missing declaration', () => {
    const files = demoProduct()
    delete files['products/demo/product.yaml']
    const { tree } = repo(files)
    const findings = validateTree(tree, {}).filter((finding) => finding.rule === 'product-declaration')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain('products/demo/product.yaml')
  })
})

describe('the landing check reads a moved product — d-34t7y2iq, r-0701ctqx', () => {
  it('finds a draft increment under a grouped product root', () => {
    const files = grouped('plan')
    files['products/plan/demo/increments/wip-001-a-thing/decisions.yaml'] = yaml({
      version: '1',
      decisions: [{ id: 'd-aaaaaaaa', statement: 'a colliding ruling.\n', status: 'accepted' }],
    })
    const { root, tree } = repo(files)
    const head = resolveFold(root, 'demo')
    const findings = findLandingConflicts(tree, head, 'demo')
    expect(findings.map((finding) => finding.rule)).toContain('landing-duplicate-id')
  })
})
