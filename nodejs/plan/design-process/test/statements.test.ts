import { describe, expect, it } from 'vitest'

import { CLAUSE_BUDGET, STATEMENT_BUDGET, wordCount } from '../src/statements.js'
import { validateTree } from '../src/validate.js'
import { demoV3, makeRepo, yaml } from './helpers.js'

import type { Finding } from '../src/types.js'

const check = (files: Record<string, string>): Finding[] => validateTree(makeRepo(files).tree)
const rules = (findings: Finding[]): string[] => findings.map((finding) => finding.rule)

const words = (count: number): string => Array.from({ length: count }, (_, index) => `word${index}`).join(' ')

describe('the budget counts words (d-kjeqksd8)', () => {
  it('counts whitespace-separated tokens', () => {
    expect(wordCount('one two  three\nfour')).toBe(4)
    expect(wordCount('  ')).toBe(0)
  })

  it('fixes the ratified budgets', () => {
    expect(STATEMENT_BUDGET).toBe(60)
    expect(CLAUSE_BUDGET).toBe(25)
  })
})

// Code wave: the budget binds the dialects that carry commentary, and no earlier one.
describe.skip('the statement budget gates the new dialects only (Code wave)', () => {
  it('finds a requirement@2 statement over sixty words', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      requirements: [{ id: 'r-cccccccc', statement: `${words(61)}\n` }],
    })
    expect(rules(check(files))).toContain('statement-budget')
  })

  it('accepts a statement at exactly sixty words', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      requirements: [{ id: 'r-cccccccc', statement: `${words(60)}\n` }],
    })
    expect(rules(check(files))).not.toContain('statement-budget')
  })

  it('finds a decision@3 statement over sixty words, and a case clause over twenty-five', () => {
    const files = demoV3()
    files['products/demo3/increments/002/decisions.yaml'] = yaml({
      version: '3',
      decisions: [
        { id: 'd-bbbbbbbb', statement: `${words(61)}\n`, status: 'accepted' },
        {
          id: 'd-cccccccc',
          statement: 'branches below.\n',
          status: 'accepted',
          cases: [{ when: words(26), then: 'short' }, { otherwise: 'short' }],
        },
      ],
    })
    const found = rules(check(files))
    expect(found.filter((rule) => rule === 'statement-budget')).toHaveLength(1)
    expect(found).toContain('clause-budget')
  })

  it('leaves commentary unbudgeted — it is the drain', () => {
    const files = demoV3()
    files['products/demo3/increments/002/requirements.yaml'] = yaml({
      version: '3',
      requirements: [{ id: 'r-cccccccc', statement: 'short.\n', commentary: `${words(200)}\n` }],
    })
    expect(rules(check(files))).not.toContain('statement-budget')
  })

  it('does not read published sources in earlier dialects against the budget', () => {
    const files = demoV3()
    files['products/demo1/product.yaml'] = yaml({ version: '1', kind: 'nodejs-library' })
    files['products/demo1/increments/001/requirements.yaml'] = yaml({
      version: '1',
      requirements: [{ id: 'r-dddddddd', statement: `${words(120)}\n` }],
    })
    expect(rules(check(files))).not.toContain('statement-budget')
  })
})
