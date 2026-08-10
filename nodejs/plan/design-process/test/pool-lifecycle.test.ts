import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { GitTree } from '../src/tree.js'
import { validateTree } from '../src/validate.js'
import { demoV3, makeGitRepo, makeRepo, yaml } from './helpers.js'

import type { BacklogView } from '../src/staleness.js'
import type { Finding } from '../src/types.js'

const rules = (findings: Finding[]): string[] => findings.map((finding) => finding.rule)

const write = (root: string, path: string, content: string): void => {
  mkdirSync(join(root, dirname(path)), { recursive: true })
  writeFileSync(join(root, path), content)
}

const fact2 = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'f-a1b2c3d4',
  claim: 'the vendor API paginates at 100',
  backing: 'documented',
  sources: [{ url: 'https://example.com/docs', where: 'pagination', quote: 'pages hold 100 items' }],
  ...over,
})

const withPool = (facts: Record<string, unknown>[]): Record<string, string> => {
  const files = demoV3()
  files['facts/vendor.yaml'] = yaml({ version: '2', facts })
  return files
}

// Code wave: the evidence bar reads each pool file against the version its wrapper declares,
// and the @1 and @2 dialects coexist (d-vkudjo4x, d-a3agzjct).
describe.skip('the two pool dialects coexist (Code wave)', () => {
  it('validates a facts@2 file against its own version, not @1', () => {
    expect(validateTree(makeRepo(withPool([fact2()])).tree)).toEqual([])
  })

  it('resolves an f: citation to a fact@2 entry, and superseded_by across dialects', () => {
    const files = withPool([fact2()])
    files['facts/legacy.yaml'] = yaml({
      version: '1',
      facts: [
        {
          id: 'vendor-paginates',
          claim: 'the vendor API paginates at 100',
          backing: 'documented',
          sources: [{ url: 'https://example.com/docs', where: 'pagination', quote: 'pages hold 100 items' }],
          status: 'retired',
          reason: 'superseded',
          superseded_by: 'f-a1b2c3d4',
        },
      ],
    })
    files['products/demo3/increments/002/decisions.yaml'] = yaml({
      version: '3',
      decisions: [
        { id: 'd-bbbbbbbb', statement: 'built on the fact.\n', status: 'accepted', because: ['f:f-a1b2c3d4'] },
      ],
    })
    expect(validateTree(makeRepo(files).tree)).toEqual([])
  })
})

// Code wave: r-wgtyrh2r, d-vkudjo4x — the gate refuses any edit to a merged fact or run beyond
// marking it retired.
describe.skip('a merged fact or run is frozen (Code wave)', () => {
  it('fails an edit to a merged fact beyond marking it retired', () => {
    const { root, tree } = makeGitRepo(withPool([fact2()]))
    write(root, 'facts/vendor.yaml', yaml({ version: '2', facts: [fact2({ claim: 'the claim, reworded' })] }))
    expect(rules(validateTree(tree, { base: new GitTree(root, 'main') }))).toContain('pool-entry-frozen')
  })

  it('accepts the one permitted edit: status retired, a reason, and a replacement', () => {
    const { root, tree } = makeGitRepo(withPool([fact2()]))
    write(
      root,
      'facts/vendor.yaml',
      yaml({
        version: '2',
        facts: [
          fact2({ status: 'retired', reason: 'the vendor changed the page size', superseded_by: 'f-e5f6a7b8' }),
          fact2({ id: 'f-e5f6a7b8', claim: 'the vendor API paginates at 250' }),
        ],
      }),
    )
    const findings = validateTree(tree, { base: new GitTree(root, 'main') })
    expect(rules(findings)).not.toContain('pool-entry-frozen')
  })

  it('fails removing a merged pool entry', () => {
    const { root, tree } = makeGitRepo(withPool([fact2()]))
    write(root, 'facts/vendor.yaml', yaml({ version: '2', facts: [fact2({ id: 'f-e5f6a7b8' })] }))
    expect(rules(validateTree(tree, { base: new GitTree(root, 'main') }))).toContain('pool-entry-frozen')
  })
})

// Code wave: d-hxxlgaw9 — retiring a cited fact is never refused, and the change carries a
// backlog item per citing product naming the fact, its replacement, and the citing entries.
describe.skip('retiring a cited fact captures the debt (Code wave)', () => {
  const cited = (): Record<string, string> => {
    const files = withPool([fact2()])
    files['products/demo3/increments/002/decisions.yaml'] = yaml({
      version: '3',
      decisions: [
        { id: 'd-bbbbbbbb', statement: 'built on the fact.\n', status: 'accepted', because: ['f:f-a1b2c3d4'] },
      ],
    })
    return files
  }
  const retire = (root: string): void => {
    write(
      root,
      'facts/vendor.yaml',
      yaml({ version: '2', facts: [fact2({ status: 'retired', reason: 'the vendor changed the page size' })] }),
    )
  }
  const debtItem: BacklogView = {
    id: 'b-a1b2c3d4',
    product: 'demo3',
    content: '# rebase on the replacement\n\nf-a1b2c3d4 retired; d-bbbbbbbb cites it.\n',
  }

  it('requires a backlog item for each citing product', () => {
    const { root, tree } = makeGitRepo(cited())
    retire(root)
    const found = validateTree(tree, { base: new GitTree(root, 'main'), backlog: () => [] })
    expect(rules(found)).toContain('fact-retirement-debt')
  })

  it('passes when the backlog item names the fact for the citing product', () => {
    const { root, tree } = makeGitRepo(cited())
    retire(root)
    const found = validateTree(tree, { base: new GitTree(root, 'main'), backlog: () => [debtItem] })
    expect(rules(found)).not.toContain('fact-retirement-debt')
  })

  it('never refuses the retirement itself: the debt finding is the only gate', () => {
    const { root, tree } = makeGitRepo(cited())
    retire(root)
    const found = validateTree(tree, { base: new GitTree(root, 'main'), backlog: () => [debtItem] })
    expect(rules(found)).not.toContain('pool-entry-frozen')
  })
})

// Code wave: d-hxxlgaw9, d-8y5vmff8, r-ajpjx5w0 — staleness is a report; late citation a finding.
describe.skip('staleness reports and late-citation findings (Code wave)', () => {
  const retired = (): Record<string, string> =>
    withPool([fact2({ status: 'retired', reason: 'the vendor changed the page size' })])

  it('reports a published in-force foundation resting on a retired fact, naming its product', () => {
    const files = retired()
    files['products/demo3/increments/002/decisions.yaml'] = yaml({
      version: '3',
      decisions: [
        { id: 'd-bbbbbbbb', statement: 'built on the fact.\n', status: 'accepted', because: ['f:f-a1b2c3d4'] },
      ],
    })
    const findings = validateTree(makeRepo(files).tree)
    const stale = findings.find((finding) => finding.rule === 'citation-fact-retired')
    expect(stale?.severity).toBe('report')
    expect(stale?.product).toBe('demo3')
  })

  it('finds — not reports — a draft entry citing an already-retired fact', () => {
    const files = retired()
    files['products/demo3/increments/wip-001-late/decisions.yaml'] = yaml({
      version: '3',
      decisions: [
        { id: 'd-cccccccc', statement: 'built on a corpse.\n', status: 'accepted', because: ['f:f-a1b2c3d4'] },
      ],
    })
    const findings = validateTree(makeRepo(files).tree)
    const late = findings.find(
      (finding) => finding.rule === 'citation-fact-retired' && finding.path?.includes('wip-001-late') === true,
    )
    expect(late?.severity ?? 'finding').toBe('finding')
  })

  it('keeps a retired run uncitable by an in-force fact (d-a3agzjct)', () => {
    const files = demoV3()
    files['evidence/probes.yaml'] = yaml({
      version: '2',
      runs: [
        {
          id: 'run-a1b2c3d4',
          command: 'node probe.mjs',
          output: 'artifacts/out.txt',
          ran_at: '2026-08-01',
          status: 'retired',
          reason: 'the probe read the wrong endpoint',
        },
      ],
    })
    files['artifacts/out.txt'] = 'pages hold 100 items\n'
    files['facts/vendor.yaml'] = yaml({
      version: '2',
      facts: [
        fact2({
          backing: 'tested',
          sources: [{ run: 'run-a1b2c3d4', where: 'stdout', quote: 'pages hold 100 items' }],
        }),
      ],
    })
    expect(rules(validateTree(makeRepo(files).tree))).toContain('run-source-retired')
  })
})
