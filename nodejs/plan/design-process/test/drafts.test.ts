import { describe, expect, it } from 'vitest'

import { foldProduct } from '../src/fold.js'
import { loadProducts } from '../src/load.js'
import { projectProduct } from '../src/project.js'
import { validateTree } from '../src/validate.js'
import { demoCoverage, demoProduct, makeRepo, yaml } from './helpers.js'

import type { Files } from './helpers.js'
import type { Finding } from '../src/types.js'

const WIP = 'products/demo/increments/wip-003-third-thing'

/** demoProduct plus one draft increment in flight, declaring one requirement and one decision. */
const withDraft = (files: Files = demoProduct()): Files => ({
  ...files,
  [`${WIP}/requirements.yaml`]: yaml({
    version: '1',
    requirements: [{ id: 'r-dddddddd', title: 'third', statement: 'the product does the third thing.\n' }],
  }),
  [`${WIP}/decisions.yaml`]: yaml({
    version: '1',
    decisions: [
      {
        id: 'd-dddddddd',
        title: 'draft choice',
        statement: 'the third thing is done the draft way.\n',
        status: 'accepted',
        supersedes: 'd-cccccccc',
        because: ['r-dddddddd'],
      },
    ],
  }),
})

const check = (files: Files): Finding[] => validateTree(makeRepo(files).tree)
const rules = (findings: Finding[]): string[] => findings.map((finding) => finding.rule)
const beyond = (findings: Finding[]): Finding[] => findings.filter((finding) => finding.rule !== 'increment-dir-name')
const demo = (files: Files) => {
  const product = loadProducts(makeRepo(files).tree).products.get('demo')
  if (!product) {
    throw new Error('no demo product')
  }
  return product
}

describe('the draft increment directory (d-x0q4xgd8)', () => {
  it('reads wip-<NNN>-<slug> as a draft increment carrying its ordinal', () => {
    const product = demo(withDraft())
    expect(product.drafts.map((draft) => [draft.name, draft.ordinal])).toEqual([['wip-003-third-thing', 3]])
    expect(product.increments.map((increment) => increment.number)).toEqual([1, 2])
  })

  it.each(['wip-1-slug', 'wip-abc', 'wip-001', 'wip-001-', 'wip-0001-slug'])(
    'reports %s as a bad directory name rather than reading it as a draft',
    (dirName) => {
      const files = demoProduct()
      files[`products/demo/increments/${dirName}/requirements.yaml`] = yaml({
        version: '1',
        requirements: [{ id: 'r-dddddddd', title: 'third', statement: 'the third thing.\n' }],
      })
      const product = demo(files)
      expect(product.drafts).toEqual([])
      expect(rules(check(files))).toContain('increment-dir-name')
      // not read as an increment at all: its claims do not project
      expect(projectProduct(makeRepo(files).tree, 'demo')).not.toContain('r-dddddddd')
    },
  )

  it('keeps a draft increment out of main: the directory always draws a finding', () => {
    const findings = check(withDraft()).filter((finding) => finding.rule === 'increment-dir-name')
    expect(findings).toHaveLength(1)
    expect(findings[0]?.path).toBe(WIP)
    expect(findings[0]?.claims).toContain('d-x0q4xgd8')
  })

  it('reports two draft increments that share an ordinal, since they carry no relative order', () => {
    const files = withDraft()
    files['products/demo/increments/wip-003-other-thing/requirements.yaml'] = yaml({
      version: '1',
      requirements: [{ id: 'r-eeeeeeee', title: 'other', statement: 'the other thing.\n' }],
    })
    expect(rules(check(files))).toContain('draft-ordinal-unique')
  })

  it('lets two stacked draft increments stand at distinct ordinals', () => {
    const files = withDraft()
    files['products/demo/increments/wip-004-fourth-thing/requirements.yaml'] = yaml({
      version: '1',
      requirements: [{ id: 'r-eeeeeeee', title: 'fourth', statement: 'the fourth thing.\n' }],
    })
    expect(rules(beyond(check(files)))).toEqual([])
  })
})

describe('the merge gate reads a draft increment as it is worked (d-1qn5jzgd, r-4z3yd1ri)', () => {
  it('passes a clean draft increment but for the directory name', () => {
    expect(beyond(check(withDraft()))).toEqual([])
  })

  it('reports a schema violation in a draft increment source', () => {
    const files = withDraft()
    files[`${WIP}/requirements.yaml`] = yaml({
      version: '1',
      requirements: [{ id: 'r-dddddddd', title: 'third', statement: 'the third thing.\n', bogus_field: 'x' }],
    })
    const finding = check(files).find((candidate) => candidate.rule === 'source-validates')
    expect(finding?.path).toBe(`${WIP}/requirements.yaml`)
  })

  it('reports a proposed decision in a draft increment (r-0axqvtcc)', () => {
    const files = withDraft()
    files[`${WIP}/decisions.yaml`] = yaml({
      version: '1',
      decisions: [{ id: 'd-dddddddd', statement: 'still being argued.\n', status: 'proposed' }],
    })
    expect(rules(check(files))).toContain('no-proposed-decision')
  })

  it("reports a draft increment's open questions (r-ygg7q7rh)", () => {
    const files = withDraft()
    files[`${WIP}/questions.yaml`] = yaml({
      version: '1',
      questions: [{ id: 'q-aaaaaaaa', question: 'which way?\n', answer: 'decision' }],
    })
    expect(rules(check(files))).toContain('no-open-questions')
  })

  it('resolves citations in a draft increment', () => {
    const files = withDraft()
    files[`${WIP}/decisions.yaml`] = yaml({
      version: '1',
      decisions: [{ id: 'd-dddddddd', statement: 'built on nothing.\n', status: 'accepted', because: ['r-zzzzzzzz'] }],
    })
    expect(rules(check(files))).toContain('citation-resolves')
  })

  it('reads published numbers only in the density gate: a wip ordinal is not one', () => {
    const files = withDraft() // published 1, 2; draft ordinal 003
    expect(rules(check(files))).not.toContain('increment-sequence-dense')
  })

  it('does not let a draft increment fill a gap in the published sequence', () => {
    const files = demoProduct()
    files['products/demo/increments/003/requirements.yaml'] =
      files['products/demo/increments/002/requirements.yaml'] ?? ''
    delete files['products/demo/increments/002/requirements.yaml']
    delete files['products/demo/increments/002/decisions.yaml']
    files['products/demo/increments/wip-002-gap/requirements.yaml'] = yaml({
      version: '1',
      requirements: [{ id: 'r-dddddddd', title: 'gap', statement: 'the gap filler.\n' }],
    })
    expect(rules(check(files))).toContain('increment-sequence-dense')
  })

  it('checks an implementation record against the published fold, drafts excluded', () => {
    const files = withDraft()
    files['implementations/demo/002-1.yaml'] = yaml({
      version: '1',
      product: 'demo',
      target: 2,
      packages: [{ path: 'nodejs/demo', version: '1.0.0' }],
      coverage: demoCoverage(),
    })
    expect(rules(beyond(check(files)))).toEqual([])
  })
})

describe('draft increments fold after the published ones (d-x1mhu3a3)', () => {
  it('folds a draft after every published increment, its supersessions closing what they name', () => {
    const fold = foldProduct(demo(withDraft()), undefined, true)
    expect(fold.at).toBe(2)
    expect(fold.drafts).toEqual(['wip-003-third-thing'])
    expect(fold.requirements.get('r-dddddddd')?.increment).toBe('wip-003-third-thing')
    expect(fold.decisions.has('d-cccccccc')).toBe(false)
    expect(fold.outOfForce).toContainEqual({
      id: 'd-cccccccc',
      kind: 'decision',
      how: 'superseded',
      by: 'd-dddddddd',
      increment: 'wip-003-third-thing',
    })
  })

  it('folds several drafts in ordinal order', () => {
    const files = withDraft()
    files['products/demo/increments/wip-004-fourth-thing/decisions.yaml'] = yaml({
      version: '1',
      decisions: [
        {
          id: 'd-eeeeeeee',
          statement: 'the fourth thing replaces the third.\n',
          status: 'accepted',
          supersedes: 'd-dddddddd',
        },
      ],
    })
    const fold = foldProduct(demo(files), undefined, true)
    expect(fold.drafts).toEqual(['wip-003-third-thing', 'wip-004-fourth-thing'])
    expect(fold.decisions.has('d-dddddddd')).toBe(false)
    expect(fold.label).toBe('wip-004-fourth-thing')
  })

  it('leaves drafts out of the fold unless they are asked for', () => {
    const fold = foldProduct(demo(withDraft()))
    expect(fold.drafts).toEqual([])
    expect(fold.requirements.has('r-dddddddd')).toBe(false)
    expect(fold.label).toBe(2)
  })
})

describe('the projection of a tree holding a draft increment (r-4z3yd1ri, d-x1mhu3a3)', () => {
  it('shows a draft increment by its directory name', () => {
    const projection = projectProduct(makeRepo(withDraft()).tree, 'demo')
    expect(projection).toContain('# demo @ wip-003-third-thing')
    expect(projection).toContain('_declared by increment wip-003-third-thing_')
    expect(projection).toContain('## changes at increment wip-003-third-thing')
    expect(projection).toContain('_previous increment: 2_')
  })

  it("counts a draft's claims in the coverage summary", () => {
    const projection = projectProduct(makeRepo(withDraft()).tree, 'demo')
    expect(projection).toContain('- r-dddddddd: none')
    expect(projection).toContain('5 claims in force')
  })

  it('lists a draft increment’s open questions (d-o7br0a9k)', () => {
    const files = withDraft()
    files[`${WIP}/questions.yaml`] = yaml({
      version: '1',
      questions: [{ id: 'q-aaaaaaaa', question: 'which way?\n', answer: 'decision' }],
    })
    expect(projectProduct(makeRepo(files).tree, 'demo')).toContain('q-aaaaaaaa')
  })

  it.each([1, 2])('leaves drafts out of a projection asked for at published increment %s', (at) => {
    const projection = projectProduct(makeRepo(withDraft()).tree, 'demo', { at })
    expect(projection).toContain(`# demo @ ${at}`)
    expect(projection).not.toContain('r-dddddddd')
  })
})
