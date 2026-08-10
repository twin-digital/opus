import { describe, expect, it } from 'vitest'

import { foldProduct } from '../src/fold.js'
import { loadProducts } from '../src/load.js'
import { normalizeTerm, termUsedIn } from '../src/terms.js'
import { validateTree } from '../src/validate.js'
import { demoV3, makeRepo, yaml } from './helpers.js'

import type { Finding, TermEntry } from '../src/types.js'

const check = (files: Record<string, string>): Finding[] => validateTree(makeRepo(files).tree)
const rules = (findings: Finding[]): string[] => findings.map((finding) => finding.rule)

const term = (over: Partial<TermEntry> = {}): TermEntry => ({
  id: 'merge-gate',
  definition: 'the check that blocks a merge on any finding',
  ...over,
})

describe('prose resolves a term by normalization (d-bgoclt56)', () => {
  it('is case-insensitive and treats hyphen and space as interchangeable', () => {
    expect(normalizeTerm('Merge-Gate')).toBe('merge gate')
    expect(normalizeTerm('merge   gate')).toBe('merge gate')
    expect(termUsedIn('the Merge Gate refuses the push.', term())).toBe(true)
    expect(termUsedIn('the merge-gate refuses the push.', term())).toBe(true)
  })

  it('matches the declared display form where one is declared', () => {
    const displayed = term({ id: 'ears', display: 'EARS' })
    expect(termUsedIn('the EARS templates are guidance.', displayed)).toBe(true)
  })

  it('does not match inside another word', () => {
    expect(termUsedIn('the merge gates nothing here.', term())).toBe(false)
    expect(termUsedIn('submerge gate handling.', term())).toBe(false)
  })
})

describe('terms fold by id (d-amueiyj2, d-2t3fbn09)', () => {
  it('replaces a definition on redeclaration and keeps a retirement as current state', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      terms: [{ id: 'fold', definition: 'the effective state, tightened', status: 'active' }],
    })
    const { tree } = makeRepo(files)
    const fold = foldProduct(loadProducts(tree).products.get('demo3')!)
    expect(fold.terms.get('fold')?.entry.definition).toBe('the effective state, tightened')
  })
})

describe('term declaration gates and usage reports (d-bgoclt56, d-2t3fbn09, d-lb99q03v)', () => {
  it('finds a slug collision across the product closure, adopted terms included (d-bgoclt56)', () => {
    const files = demoV3()
    files['products/some-preset/product.yaml'] = yaml({ version: '2', kind: 'requirement-preset' })
    files['products/some-preset/increments/001/requirements.yaml'] = yaml({
      version: '3',
      terms: [{ id: 'fold', definition: 'a different meaning of the same word' }],
      requirements: [{ id: 'r-ffffffff', statement: 'a preset requirement.\n' }],
    })
    const withPreset = demoV3()
    withPreset['products/some-preset/product.yaml'] = files['products/some-preset/product.yaml']
    withPreset['products/some-preset/increments/001/requirements.yaml'] =
      files['products/some-preset/increments/001/requirements.yaml']
    withPreset['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      presets: [{ name: 'some-preset', version: 1 }],
    })
    expect(rules(check(withPreset))).toContain('term-slug-unique')
  })

  it('finds an unresolved superseded_by on a retired term (d-lb99q03v)', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      terms: [{ id: 'fold', definition: 'gone', status: 'retired', reason: 'renamed', superseded_by: 'no-such-term' }],
    })
    expect(rules(check(files))).toContain('term-superseded-by-resolves')
  })

  it('refuses retirement while an in-force foundation uses the term, unless superseded_by resolves it (d-2t3fbn09)', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      terms: [{ id: 'engine', definition: 'the part that does the work' }],
      requirements: [{ id: 'r-cccccccc', statement: 'the engine starts within one second.\n' }],
    })
    files['products/demo3/increments/003/requirements.yaml'] = yaml({
      version: '3',
      terms: [{ id: 'engine', definition: 'gone', status: 'retired', reason: 'renamed' }],
    })
    expect(rules(check(files))).toContain('term-retirement-guarded')
  })

  it('fails one increment declaring one term twice (d-3kow7q0r)', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      terms: [
        { id: 'gate', definition: 'declared once' },
        { id: 'gate', definition: 'declared twice' },
      ],
    })
    expect(rules(check(files))).toContain('state-entry-declared-once')
  })

  it("reports a redefinition's reach: the in-force foundations using the term (d-lb99q03v)", () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      terms: [{ id: 'fold', definition: 'now means something else' }],
      requirements: [{ id: 'r-cccccccc', statement: 'the fold is recomputed on demand.\n' }],
    })
    const findings = check(files)
    const report = findings.find((finding) => finding.rule === 'term-redefinition-reach')
    expect(report?.severity).toBe('report')
    expect(report?.message).toContain('r-cccccccc')
  })

  it('reports orphan terms no in-force foundation uses (d-lb99q03v)', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      terms: [{ id: 'lantern', definition: 'a term nothing uses yet' }],
    })
    const findings = check(files)
    const report = findings.find((finding) => finding.rule === 'term-orphan')
    expect(report?.severity).toBe('report')
    expect(report?.message).toContain('lantern')
    // demoV3's own `fold` is used by r-bbbbbbbb, so it draws no orphan report
    expect(findings.filter((finding) => finding.rule === 'term-orphan')).toHaveLength(1)
  })
})
