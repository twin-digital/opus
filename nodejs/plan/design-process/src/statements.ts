import type { IncrementSources, Product } from './load.js'
import type { DecisionCase, Finding } from './types.js'

/**
 * The form a decision's cases take wherever a decision is shown — the projection and the ratify
 * session alike — in source order, the first matching case governing (d-qv81x173, d-f2h4xeee).
 */
export const caseLines = (cases: DecisionCase[] | undefined): string[] =>
  (cases ?? []).map((branch) =>
    'otherwise' in branch ?
      `- otherwise: ${branch.otherwise.trim()}`
    : `- when ${branch.when.trim()}: ${branch.then.trim()}`,
  )

/** How the budget counts: whitespace-separated tokens (d-kjeqksd8). */
export const wordCount = (text: string): number => text.split(/\s+/).filter((word) => word.length > 0).length

export const STATEMENT_BUDGET = 60
export const CLAUSE_BUDGET = 25

/** The dialects the budget binds: the ones that carry `commentary` (d-kjeqksd8). */
const BUDGETED_VERSION = '3'

/**
 * The statement budget, in the dialects that carry `commentary` only (d-kjeqksd8): a statement
 * over sixty words, or a `when`/`then`/`otherwise` clause over twenty-five, is a finding.
 * Commentary is unbudgeted — it is the drain. Published sources in earlier dialects are not read
 * against the budget.
 */
export const checkStatementBudget = (product: Product): Finding[] => {
  const findings: Finding[] = []
  const over = (
    rule: string,
    claims: string[],
    path: string,
    id: string,
    field: string,
    words: number,
    budget: number,
  ) =>
    findings.push({
      rule,
      claims,
      path,
      message: `${id}: the ${field} runs ${words} words against a budget of ${budget}; commentary is the drain`,
      product: product.id,
    })

  const increments: IncrementSources[] = [...product.increments, ...product.drafts]
  for (const increment of increments) {
    const requirements = increment.requirements
    if (requirements?.data.version === BUDGETED_VERSION) {
      for (const entry of requirements.data.requirements ?? []) {
        const words = wordCount(entry.statement)
        if (words > STATEMENT_BUDGET) {
          over(
            'statement-budget',
            ['r-0ls6xch4', 'd-kjeqksd8'],
            requirements.path,
            entry.id,
            'statement',
            words,
            STATEMENT_BUDGET,
          )
        }
      }
    }
    const decisions = increment.decisions
    if (decisions?.data.version === BUDGETED_VERSION) {
      for (const entry of decisions.data.decisions ?? []) {
        const words = wordCount(entry.statement)
        if (words > STATEMENT_BUDGET) {
          over(
            'statement-budget',
            ['r-0ls6xch4', 'd-kjeqksd8'],
            decisions.path,
            entry.id,
            'statement',
            words,
            STATEMENT_BUDGET,
          )
        }
        for (const branch of entry.cases ?? []) {
          for (const [clause, text] of Object.entries(branch)) {
            const clauseWords = wordCount(text)
            if (clauseWords > CLAUSE_BUDGET) {
              over(
                'clause-budget',
                ['r-0ls6xch4', 'd-kjeqksd8', 'd-qv81x173'],
                decisions.path,
                entry.id,
                `${clause} clause`,
                clauseWords,
                CLAUSE_BUDGET,
              )
            }
          }
        }
      }
    }
  }
  return findings
}
