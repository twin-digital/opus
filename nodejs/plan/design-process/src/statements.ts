import type { Product } from './load.js'
import type { Finding } from './types.js'

/** How the budget counts: whitespace-separated tokens (d-kjeqksd8). */
export const wordCount = (text: string): number => text.split(/\s+/).filter((word) => word.length > 0).length

export const STATEMENT_BUDGET = 60
export const CLAUSE_BUDGET = 25

/**
 * The statement budget, in the dialects that carry `commentary` only (d-kjeqksd8): a statement
 * over sixty words, or a `when`/`then`/`otherwise` clause over twenty-five, is a finding.
 * Published sources in earlier dialects are not read against the budget.
 */
export const checkStatementBudget = (product: Product): Finding[] => {
  void product
  throw new Error('not implemented until the Code wave')
}
