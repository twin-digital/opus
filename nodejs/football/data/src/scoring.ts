import type { StatKey } from './reference/stat-key.js'

export type ScoringRuleSet = Partial<Record<StatKey, number>>

/**
 * Default-PPR rule sets used only to cross-check source prescored totals — the guard on the
 * community-documented stat maps. League-exact scoring uses LeagueSettings.scoringRules.
 */
export const ESPN_DEFAULT_PPR: ScoringRuleSet = {
  passYd: 0.04,
  passTd: 4,
  passInt: -2,
  twoPtPass: 2,
  rushYd: 0.1,
  rushTd: 6,
  twoPtRush: 2,
  rec: 1,
  recYd: 0.1,
  recTd: 6,
  twoPtRec: 2,
  fumLost: -2,
}

/** Sleeper's default scoring differs from ESPN's only at interceptions (-1). */
export const SLEEPER_DEFAULT_PPR: ScoringRuleSet = {
  ...ESPN_DEFAULT_PPR,
  passInt: -1,
}

export const scoreStats = (stats: Partial<Record<StatKey, number>>, rules: ScoringRuleSet): number => {
  let total = 0
  for (const [key, points] of Object.entries(rules) as [StatKey, number][]) {
    const value = stats[key]
    if (value !== undefined) {
      total += value * points
    }
  }
  return total
}
