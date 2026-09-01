import type { NewsDirection, NewsImpact } from '../reference/news.js'

const IMPACT_RANK: Record<NewsImpact, number> = { low: 0, med: 1, high: 2 }

/** Items older than this (relative to the lead item) no longer escalate impact. */
const RECENT_MS = 14 * 24 * 60 * 60 * 1000

const timestamp = (published: string | null): number | null => {
  if (published === null) {
    return null
  }
  const parsed = Date.parse(published)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * Rollup for a player's assessed items. Direction: the newest directional (improves|harms)
 * item wins — an `unclear` roundup never buries an injury note; all-unclear stays unclear.
 * Impact: the worst that direction reached among recent items (published within 14 days of
 * the lead; undated items count toward impact but cannot lead on recency). Dated items
 * outrank undated ones; among undated (or tied) items the first given wins. Null when
 * nothing is assessed.
 */
export const rollupAssessments = (
  assessments: { direction: NewsDirection; impact: NewsImpact; published: string | null }[],
): { direction: NewsDirection; impact: NewsImpact } | null => {
  if (assessments.length === 0) {
    return null
  }
  const dated = [...assessments].sort(
    (a, b) => (timestamp(b.published) ?? -Infinity) - (timestamp(a.published) ?? -Infinity),
  )
  // A roundup assessed `unclear` must not bury a same-day injury note.
  const lead = dated.find((a) => a.direction !== 'unclear') ?? dated[0]
  if (lead === undefined) {
    return null
  }
  const leadAt = timestamp(lead.published)
  // A "Questionable" status row must not downgrade a week-old "out a month".
  let impact = lead.impact
  for (const a of dated) {
    if (a.direction !== lead.direction) {
      continue
    }
    const at = timestamp(a.published)
    if (leadAt !== null && at !== null && leadAt - at > RECENT_MS) {
      continue
    }
    if (IMPACT_RANK[a.impact] > IMPACT_RANK[impact]) {
      impact = a.impact
    }
  }
  return { direction: lead.direction, impact }
}
