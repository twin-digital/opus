import { STAT_KEYS, type ScoringRule, type StatKey } from '@twin-digital/football-data'

export interface LeagueScorer {
  /** Consensus stat line → points under the league's actual rules. */
  score: (stats: Partial<Record<StatKey, number>>) => number
  /** Non-zero rules the app carries no stat for (kick-return TDs, K/DST rules, …). */
  skippedEspnStatIds: number[]
}

const isStatKey = (value: string): value is StatKey => (STAT_KEYS as readonly string[]).includes(value)

/**
 * Compile the league's scoringRules into a scorer. Rules referencing StatKeys we carry apply
 * directly; rules still keyed by raw ESPN stat id reference stats the data layer does not
 * ingest and are skipped — logged once at build time (zero-point rules are omitted silently).
 */
export const buildLeagueScorer = (
  rules: ScoringRule[],
  log: (message: string) => void = () => undefined,
): LeagueScorer => {
  const applied: [StatKey, number][] = []
  const skipped: number[] = []
  for (const rule of rules) {
    if (typeof rule.stat === 'string' && isStatKey(rule.stat)) {
      if (rule.points !== 0) {
        applied.push([rule.stat, rule.points])
      }
    } else if (typeof rule.stat === 'object' && rule.points !== 0) {
      skipped.push(rule.stat.espnStatId)
    }
  }
  if (skipped.length > 0) {
    log(
      `rescorer: skipping ${String(skipped.length)} scoring rules for stats not carried (espn stat ids: ${skipped.join(', ')})`,
    )
  }
  return {
    score: (stats) => {
      let total = 0
      for (const [key, points] of applied) {
        const value = stats[key]
        if (value !== undefined) {
          total += value * points
        }
      }
      return total
    },
    skippedEspnStatIds: skipped,
  }
}
