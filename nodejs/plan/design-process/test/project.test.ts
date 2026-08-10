import { describe, expect, it } from 'vitest'

import { projectProduct } from '../src/project.js'
import { validateTree } from '../src/validate.js'
import { demoProduct, demoV3, demoWithDeferred, makeRepo, yaml } from './helpers.js'

describe('projectProduct (r-2gcehlp8)', () => {
  it('renders the effective sets at the newest increment', () => {
    const { tree } = makeRepo(demoProduct())
    const projection = projectProduct(tree, 'demo')
    expect(projection).toContain('# demo @ 2')
    expect(projection).toContain('r-cccccccc')
    expect(projection).not.toContain('### r-aaaaaaaa') // superseded, out of force
    expect(projection).toContain('d-cccccccc')
  })

  it('renders the fold at an earlier increment on demand', () => {
    const { tree } = makeRepo(demoProduct())
    const projection = projectProduct(tree, 'demo', { at: 1 })
    expect(projection).toContain('# demo @ 1')
    expect(projection).toContain('### r-aaaaaaaa')
  })

  it('orders decisions by because topology: cited before citing (d-eaw3u72o)', () => {
    const { tree } = makeRepo(demoProduct())
    const projection = projectProduct(tree, 'demo', { at: 1 })
    expect(projection.indexOf('### d-aaaaaaaa')).toBeLessThan(projection.indexOf('### d-bbbbbbbb'))
  })

  it('renders the whole preset closure, a twice-reached preset once (d-wis1whfn)', () => {
    const files = demoProduct()
    const preset = (name: string, id: string, adopts?: { name: string; version: number }[]): void => {
      files[`products/${name}/product.yaml`] = yaml({ version: '1', kind: 'requirement-preset' })
      files[`products/${name}/increments/001/requirements.yaml`] = yaml({
        version: '1',
        requirements: [{ id, title: name, statement: `${name} behaves.\n` }],
        ...(adopts ? { presets: adopts } : {}),
      })
    }
    preset('monorepo-package', 'r-mpmpmpmp')
    preset('nodejs', 'r-njnjnjnj', [{ name: 'monorepo-package', version: 1 }])
    preset('nodejs-library', 'r-nlnlnlnl', [{ name: 'nodejs', version: 1 }])
    preset('minecraft-addon', 'r-mamamama', [{ name: 'monorepo-package', version: 1 }])
    files['products/demo/increments/002/requirements.yaml'] = yaml({
      version: '1',
      presets: [
        { name: 'nodejs-library', version: 1 },
        { name: 'minecraft-addon', version: 1 },
      ],
    })

    const projection = projectProduct(makeRepo(files).tree, 'demo')
    expect(projection.match(/^- monorepo-package@1 /gm)).toHaveLength(1)
    expect(projection).toContain('- monorepo-package@1 (1 requirements, via nodejs-library → nodejs)')
    expect(projection).toContain('adopted from monorepo-package@1')
    for (const id of ['r-mpmpmpmp', 'r-njnjnjnj', 'r-nlnlnlnl', 'r-mamamama']) {
      expect(projection).toContain(`### ${id}`)
    }
  })

  it('labels rulings and counts abstentions (r-gc7a3m56)', () => {
    const { tree } = makeRepo(demoProduct())
    expect(projectProduct(tree, 'demo')).toContain('1 delegated — abstained, not reviewed')
  })

  it('joins coverage from the implementations pool and counts the gaps (r-tue7kfgt)', () => {
    const files = demoProduct()
    files['implementations/demo/002-1.yaml'] = yaml({
      version: '1',
      product: 'demo',
      target: 2,
      packages: [{ path: 'nodejs/demo', version: '1.0.0' }],
      coverage: [{ claim: 'r-cccccccc', covered_by: [{ kind: 'attestation' }] }],
    })
    const { tree } = makeRepo(files)
    const projection = projectProduct(tree, 'demo')
    expect(projection).toContain('- r-cccccccc: attestation')
    expect(projection).toContain('- r-bbbbbbbb: none')
    expect(projection).toContain('4 claims in force: 1 covered, 3 uncovered, 1 on attestation alone')
  })

  it('counts adopted preset requirements among the coverable claims (d-3orwwaze)', () => {
    const files = demoProduct()
    files['products/nodejs-library/product.yaml'] = yaml({ version: '1', kind: 'requirement-preset' })
    files['products/nodejs-library/increments/001/requirements.yaml'] = yaml({
      version: '1',
      requirements: [{ id: 'r-nlnlnlnl', title: 'adopted', statement: 'the package behaves.\n' }],
    })
    files['products/demo/increments/002/requirements.yaml'] = yaml({
      version: '1',
      requirements: [
        {
          id: 'r-cccccccc',
          title: 'first, amended',
          statement: 'the product does the first thing faster.\n',
          amends: 'r-aaaaaaaa',
        },
      ],
      presets: [{ name: 'nodejs-library', version: 1 }],
    })
    const { tree } = makeRepo(files)
    const projection = projectProduct(tree, 'demo')
    expect(projection).toContain('- r-nlnlnlnl (adopted from nodejs-library@1): none')
    expect(projection).toContain('5 claims in force: 0 covered, 5 uncovered')
  })

  it('names the same coverable claims the record validator enforces (d-3orwwaze)', () => {
    const files = demoProduct()
    files['products/nodejs-library/product.yaml'] = yaml({ version: '1', kind: 'requirement-preset' })
    files['products/nodejs-library/increments/001/requirements.yaml'] = yaml({
      version: '1',
      requirements: [{ id: 'r-nlnlnlnl', title: 'adopted', statement: 'the package behaves.\n' }],
    })
    files['products/demo/increments/002/requirements.yaml'] = yaml({
      version: '1',
      requirements: [
        {
          id: 'r-cccccccc',
          title: 'first, amended',
          statement: 'the product does the first thing faster.\n',
          amends: 'r-aaaaaaaa',
        },
      ],
      presets: [{ name: 'nodejs-library', version: 1 }],
    })
    files['implementations/demo/002-1.yaml'] = yaml({
      version: '1',
      product: 'demo',
      target: 2,
      packages: [{ path: 'nodejs/demo', version: '1.0.0' }],
      // exactly what the projection lists as in force
      coverage: ['r-bbbbbbbb', 'r-cccccccc', 'r-nlnlnlnl', 'd-bbbbbbbb', 'd-cccccccc'].map((claim) => ({
        claim,
        covered_by: [{ kind: 'attestation' }],
      })),
    })
    const { tree } = makeRepo(files)
    expect(projectProduct(tree, 'demo')).toContain('5 claims in force: 5 covered, 0 uncovered')
    expect(validateTree(tree).filter((finding) => finding.rule.startsWith('record-'))).toEqual([])
  })

  it('counts deferred entries beside the rulings (d-4nez3mjh)', () => {
    const { tree } = makeRepo(demoWithDeferred())
    expect(projectProduct(tree, 'demo')).toContain('1 deferred — awaiting their answers')
  })

  it('renders a deferred entry like any other, its status line deferred (d-4nez3mjh)', () => {
    const { tree } = makeRepo(demoWithDeferred())
    const projection = projectProduct(tree, 'demo')
    expect(projection).toContain('### d-dddddddd')
    expect(projection).toContain('_deferred; declared by increment 2_')
  })

  it('omits deferred decisions from the coverage claims and names the exclusion (d-4nez3mjh)', () => {
    const files = demoWithDeferred()
    files['implementations/demo/002-1.yaml'] = yaml({
      version: '1',
      product: 'demo',
      target: 2,
      packages: [{ path: 'nodejs/demo', version: '1.0.0' }],
      coverage: [{ claim: 'r-cccccccc', covered_by: [{ kind: 'attestation' }] }],
    })
    const { tree } = makeRepo(files)
    const projection = projectProduct(tree, 'demo')
    expect(projection).not.toContain('- d-dddddddd:')
    expect(projection).toContain('1 deferred excluded')
  })

  it('shows what the increment changed against the fold before it (d-j50yturh)', () => {
    const { tree } = makeRepo(demoProduct())
    const projection = projectProduct(tree, 'demo')
    expect(projection).toContain('added: r-cccccccc, d-cccccccc')
    expect(projection).toContain('superseded: r-aaaaaaaa by r-cccccccc')
  })

  it('lists open questions blocking settle', () => {
    const files = demoProduct()
    files['products/demo/increments/002/questions.yaml'] = yaml({
      version: '1',
      questions: [{ id: 'q-aaaaaaaa', question: 'is this settled?\n', answer: 'requirement' }],
    })
    const { tree } = makeRepo(files)
    expect(projectProduct(tree, 'demo')).toContain('q-aaaaaaaa (requirement): is this settled?')
  })

  it('throws on an unknown product', () => {
    const { tree } = makeRepo(demoProduct())
    expect(() => projectProduct(tree, 'ghost')).toThrow(/no product "ghost"/)
  })
})

describe('the projection over the new dialects (d-u5q2wh44, d-qv81x173, d-hfbf4eb7)', () => {
  it('omits commentary unless asked (d-u5q2wh44, r-q0969r5a)', () => {
    const { tree } = makeRepo(demoV3())
    const projection = projectProduct(tree, 'demo3')
    expect(projection).not.toContain('the owner reverses designs over this')
    const withCommentary = projectProduct(tree, 'demo3', { commentary: true })
    expect(withCommentary).toContain('the owner reverses designs over this')
  })

  it('refuses the commentary ask at a published increment (d-u5q2wh44)', () => {
    const { tree } = makeRepo(demoV3())
    expect(() => projectProduct(tree, 'demo3', { at: 1, commentary: true })).toThrow(/commentary/)
  })

  it('renders cases in order, the otherwise last (d-qv81x173)', () => {
    const { tree } = makeRepo(demoV3())
    const projection = projectProduct(tree, 'demo3')
    expect(projection.indexOf('the input is well-formed')).toBeLessThan(projection.indexOf('the line is reported'))
  })

  it('filters by scope with subtree semantics: an ancestor scope reaches its descendants (d-hfbf4eb7, d-rplsevuk)', () => {
    const { tree } = makeRepo(demoV3())
    // r-aaaaaaaa is scoped to engine; d-aaaaaaaa to parser, beneath it; r-bbbbbbbb is product-wide
    const engine = projectProduct(tree, 'demo3', { scope: 'engine' })
    expect(engine).toContain('### r-aaaaaaaa')
    expect(engine).toContain('### d-aaaaaaaa')
    expect(engine).toContain('### r-bbbbbbbb') // unscoped applies to the whole product
    const parser = projectProduct(tree, 'demo3', { scope: 'parser' })
    expect(parser).toContain('### d-aaaaaaaa')
    expect(parser).toContain('### r-aaaaaaaa') // scoped to the subtree parser sits in
  })

  it('shows the components and terms the fold declares', () => {
    const { tree } = makeRepo(demoV3())
    const projection = projectProduct(tree, 'demo3')
    expect(projection).toContain('engine')
    expect(projection).toContain('the effective state of a product at an increment')
  })
})
