import type { NewsId } from '../ids.js'
import type { NewsAssessment } from '../models.js'
import { isNewsDirection, isNewsImpact, NEWS_DIRECTIONS, NEWS_IMPACTS } from '../reference/news.js'

export interface ParsedAssessments {
  assessments: Omit<NewsAssessment, 'assessedAt' | 'assessedBy'>[]
  /** One message per invalid entry; any error rejects the whole file. */
  errors: string[]
}

/** Validate a bulk-assessment JSON payload: enum fields, non-empty summary, known news ids. */
export const parseAssessmentFile = (payload: unknown, knownNewsIds: ReadonlySet<string>): ParsedAssessments => {
  const errors: string[] = []
  const assessments: ParsedAssessments['assessments'] = []
  if (!Array.isArray(payload)) {
    return { assessments, errors: ['payload must be a JSON array of {newsId, direction, impact, summary}'] }
  }
  payload.forEach((entry: unknown, index) => {
    const at = `entry ${index}`
    if (typeof entry !== 'object' || entry === null) {
      errors.push(`${at}: not an object`)
      return
    }
    const { newsId, direction, impact, summary } = entry as Record<string, unknown>
    if (typeof newsId !== 'string' || !knownNewsIds.has(newsId)) {
      errors.push(`${at}: unknown newsId ${JSON.stringify(newsId)}`)
      return
    }
    if (typeof direction !== 'string' || !isNewsDirection(direction)) {
      errors.push(`${at} (${newsId}): direction must be one of ${NEWS_DIRECTIONS.join('|')}`)
      return
    }
    if (typeof impact !== 'string' || !isNewsImpact(impact)) {
      errors.push(`${at} (${newsId}): impact must be one of ${NEWS_IMPACTS.join('|')}`)
      return
    }
    if (typeof summary !== 'string' || summary.trim() === '') {
      errors.push(`${at} (${newsId}): summary must be a non-empty string`)
      return
    }
    assessments.push({ newsId: newsId as NewsId, direction, impact, summary: summary.trim() })
  })
  return { assessments, errors }
}
