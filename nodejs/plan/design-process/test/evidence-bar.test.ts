import { describe, expect, it } from 'vitest'

import { loadFacts, loadPool } from '../src/pools.js'
import { validateTree } from '../src/validate.js'
import { makeRepo, poolFiles, yaml } from './helpers.js'

import type { Finding } from '../src/types.js'

const check = (files: Record<string, string>): Finding[] => validateTree(makeRepo(files).tree)
const rules = (findings: Finding[]): string[] => findings.map((finding) => finding.rule)

/** A tree with the pool schemas, one in-repo source file, and one run output file. */
const base = (facts: unknown, runs?: unknown, extra: Record<string, string> = {}): Record<string, string> => ({
  ...poolFiles(),
  'docs/note.md': 'The observed behavior is stable across runs.\n',
  'evidence/probe/out.txt': 'measured latency was 12ms under load.\n',
  'facts/pool.yml': yaml(facts),
  ...(runs === undefined ? {} : { 'evidence/probe/runs.yml': yaml(runs) }),
  ...extra,
})

const documentedFact = {
  id: 'behavior-is-stable',
  claim: 'the behavior is stable\n',
  backing: 'documented',
  sources: [{ url: 'docs/note.md#x', where: 'the note', quote: 'observed behavior is stable' }],
}

const assumedFact = {
  id: 'assumed-thing',
  claim: 'assumed\n',
  backing: 'assumed',
  sources: [{ description: 'the mechanism assumed' }],
}

const runEntry = {
  id: 'latency-probe',
  command: 'node run.mjs',
  output: 'evidence/probe/out.txt',
  ran_at: '2026-08-04',
}

const testedFact = {
  id: 'latency-is-low',
  claim: 'latency is low\n',
  backing: 'tested',
  sources: [{ run: 'latency-probe', where: 'the probe output', quote: 'latency was 12ms' }],
}

describe('evidence bar — clean pool', () => {
  it('passes valid bare facts and runs', () => {
    expect(check(base([documentedFact, assumedFact, testedFact], [runEntry]))).toEqual([])
  })

  it('passes wrapped facts and runs', () => {
    const files = base({ version: '1', facts: [documentedFact] }, { version: '1', runs: [runEntry] })
    expect(check(files)).toEqual([])
  })

  it('skips an evidence mapping without the runs wrapper', () => {
    const files = base([documentedFact])
    files['evidence/probe/compose.yaml'] = yaml({ services: { db: { image: 'postgres' } } })
    expect(check(files)).toEqual([])
  })

  it('reports a malformed facts pool file rather than dropping it', () => {
    const files = base([documentedFact])
    files['facts/broken.yaml'] = 'id: x\n  bad: : indent:\n:::\n'
    expect(rules(check(files))).toContain('pool-parse')
  })

  it('reports a malformed evidence pool file rather than dropping it', () => {
    const files = base([documentedFact])
    files['evidence/probe/broken.yaml'] = 'runs: [unterminated\n'
    expect(rules(check(files))).toContain('pool-parse')
  })
})

describe('evidence bar — schema shape (rule 1)', () => {
  it('fails a bad backing enum', () => {
    const files = base([{ ...documentedFact, backing: 'guessed' }])
    expect(rules(check(files))).toContain('pool-entry-schema')
  })

  it('fails a retired fact missing its reason', () => {
    const files = base([{ ...documentedFact, status: 'retired' }])
    expect(rules(check(files))).toContain('pool-entry-schema')
  })

  it('fails a run with a non-date ran_at', () => {
    const files = base([testedFact], [{ ...runEntry, ran_at: 'yesterday' }])
    expect(rules(check(files))).toContain('pool-entry-schema')
  })
})

describe('evidence bar — source floor (rule 2)', () => {
  it('fails a documented fact with no url source', () => {
    const files = base([{ ...documentedFact, sources: [{ description: 'no url here' }] }])
    expect(rules(check(files))).toContain('source-floor')
  })

  it('fails a tested fact with no run source', () => {
    const files = base([
      { ...testedFact, sources: [{ url: 'docs/note.md', where: 'x', quote: 'observed behavior is stable' }] },
    ])
    expect(rules(check(files))).toContain('source-floor')
  })

  it('fails an assumed fact with no description source', () => {
    const files = base([
      { ...assumedFact, sources: [{ url: 'docs/note.md', where: 'x', quote: 'observed behavior is stable' }] },
    ])
    expect(rules(check(files))).toContain('source-floor')
  })
})

describe('evidence bar — quotes and in-repo urls (rules 3, 4)', () => {
  it('fails a quote absent from the in-repo url file', () => {
    const files = base([
      { ...documentedFact, sources: [{ url: 'docs/note.md', where: 'x', quote: 'this text is not there' }] },
    ])
    expect(rules(check(files))).toContain('quote-verbatim')
  })

  it('fails an in-repo url that resolves to no file', () => {
    const files = base([{ ...documentedFact, sources: [{ url: 'docs/missing.md', where: 'x', quote: 'anything' }] }])
    expect(rules(check(files))).toContain('source-file-missing')
  })

  it('does not read an off-repo url with a scheme', () => {
    const files = base([
      { ...documentedFact, sources: [{ url: 'https://example.com/p', where: 'x', quote: 'nonsense not verified' }] },
    ])
    expect(check(files)).toEqual([])
  })

  it('fails a ../-relative url', () => {
    const files = base([{ ...documentedFact, sources: [{ url: '../outside/note.md', where: 'x', quote: 'anything' }] }])
    expect(rules(check(files))).toContain('source-url-relative')
  })
})

describe('evidence bar — run sources (rule 5)', () => {
  it('fails a run source naming no run', () => {
    const files = base(
      [{ ...testedFact, sources: [{ run: 'ghost-run', where: 'x', quote: 'latency was 12ms' }] }],
      [runEntry],
    )
    expect(rules(check(files))).toContain('run-source-resolves')
  })

  it('fails a run source that is retired', () => {
    const files = base([testedFact], [{ ...runEntry, status: 'retired', reason: 'stale' }])
    expect(rules(check(files))).toContain('run-source-retired')
  })

  it('fails a run source on a non-tested fact', () => {
    const files = base(
      [{ ...documentedFact, sources: [{ run: 'latency-probe', where: 'x', quote: 'latency was 12ms' }] }],
      [runEntry],
    )
    expect(rules(check(files))).toContain('run-source-not-tested')
  })

  it('fails when the run output file is missing', () => {
    const files = base([testedFact], [{ ...runEntry, output: 'evidence/probe/gone.txt' }])
    expect(rules(check(files))).toContain('run-output-missing')
  })

  it('fails an uncited run whose output file is missing', () => {
    // documentedFact cites no run, so only the unconditional existence check can fire
    const files = base([documentedFact], [{ ...runEntry, output: 'evidence/probe/gone.txt' }])
    expect(rules(check(files))).toContain('run-output-exists')
  })

  it('fails when the quote is absent from the run output', () => {
    const files = base(
      [{ ...testedFact, sources: [{ run: 'latency-probe', where: 'x', quote: 'not in the output' }] }],
      [runEntry],
    )
    expect(rules(check(files))).toContain('quote-verbatim')
  })
})

describe('evidence bar — artifacts, supersession, uniqueness (rules 6, 7, 8)', () => {
  it('fails an artifacts/ url backing a non-tested fact', () => {
    const files = base([
      {
        ...documentedFact,
        sources: [{ url: 'evidence/probe/artifacts/log.txt', where: 'x', quote: 'anything' }],
      },
    ])
    expect(rules(check(files))).toContain('artifact-source-tested')
  })

  it('fails a superseded_by naming no pool entry', () => {
    const files = base([{ ...documentedFact, status: 'retired', reason: 'superseded', superseded_by: 'nobody' }])
    expect(rules(check(files))).toContain('superseded-by-resolves')
  })

  it('fails a superseded_by naming itself', () => {
    const files = base([
      { ...documentedFact, status: 'retired', reason: 'superseded', superseded_by: documentedFact.id },
    ])
    expect(rules(check(files))).toContain('superseded-by-resolves')
  })

  it('resolves superseded_by against a run in the shared namespace', () => {
    const files = base(
      [{ ...documentedFact, status: 'retired', reason: 'superseded', superseded_by: 'latency-probe' }],
      [runEntry],
    )
    expect(rules(check(files))).not.toContain('superseded-by-resolves')
  })

  it('fails an id shared between a fact and a run', () => {
    const files = base([{ ...documentedFact, id: 'latency-probe' }], [runEntry])
    expect(rules(check(files))).toContain('pool-id-unique')
  })
})

describe('pool loader — shape tolerance', () => {
  it('loads bare and wrapped facts alike into ids/retired', () => {
    const { tree } = makeRepo(base([documentedFact, { ...assumedFact, status: 'retired', reason: 'stale' }]))
    const facts = loadFacts(tree)
    expect(facts.ids.has('behavior-is-stable')).toBe(true)
    expect(facts.retired.has('assumed-thing')).toBe(true)
  })

  it('collects facts and runs into one namespace', () => {
    const { tree } = makeRepo(base([documentedFact], [runEntry]))
    const pool = loadPool(tree)
    expect(pool.facts.map((item) => item.id)).toContain('behavior-is-stable')
    expect(pool.runs.map((item) => item.id)).toContain('latency-probe')
    expect(pool.byId.get('latency-probe')?.kind).toBe('run')
  })
})
