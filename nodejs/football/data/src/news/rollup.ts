import type { NewsDirection, NewsImpact } from '../reference/news.js'

const timestamp = (published: string | null): number | null => {
  if (published === null) {
    return null
  }
  const parsed = Date.parse(published)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * Recency rollup for a player's assessed items: the most recently published assessment's
 * direction and impact — a resolved injury must not stay red because an older item said
 * harms. Dated items outrank undated ones; among undated (or tied) items the first given
 * wins. Null when nothing is assessed.
 */
export const rollupAssessments = (
  assessments: { direction: NewsDirection; impact: NewsImpact; published: string | null }[],
): { direction: NewsDirection; impact: NewsImpact } | null => {
  const first = assessments[0]
  if (first === undefined) {
    return null
  }
  let newest = first
  let newestAt = timestamp(first.published)
  for (const assessment of assessments.slice(1)) {
    const at = timestamp(assessment.published)
    if (at !== null && (newestAt === null || at > newestAt)) {
      newest = assessment
      newestAt = at
    }
  }
  return { direction: newest.direction, impact: newest.impact }
}
