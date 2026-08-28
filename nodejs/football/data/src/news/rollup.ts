import type { NewsDirection, NewsImpact } from '../reference/news.js'

const DIRECTION_SEVERITY: Record<NewsDirection, number> = { improves: 0, unclear: 1, harms: 2 }
const IMPACT_RANK: Record<NewsImpact, number> = { low: 0, med: 1, high: 2 }

/**
 * Worst-of rollup for a player's assessed items: the worst direction present, and the highest
 * impact among assessments carrying that direction. Null when nothing is assessed.
 */
export const rollupAssessments = (
  assessments: { direction: NewsDirection; impact: NewsImpact }[],
): { direction: NewsDirection; impact: NewsImpact } | null => {
  if (assessments.length === 0) {
    return null
  }
  let direction: NewsDirection = 'improves'
  for (const a of assessments) {
    if (DIRECTION_SEVERITY[a.direction] > DIRECTION_SEVERITY[direction]) {
      direction = a.direction
    }
  }
  let impact: NewsImpact = 'low'
  for (const a of assessments) {
    if (a.direction === direction && IMPACT_RANK[a.impact] > IMPACT_RANK[impact]) {
      impact = a.impact
    }
  }
  return { direction, impact }
}
