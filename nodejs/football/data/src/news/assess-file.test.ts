import { describe, expect, it } from 'vitest'

import { parseAssessmentFile } from './assess-file.js'

const known = new Set(['nw-A', 'nw-B'])

describe('parseAssessmentFile', () => {
  it('accepts valid entries and trims summaries', () => {
    const { assessments, errors } = parseAssessmentFile(
      [
        { newsId: 'nw-A', direction: 'harms', impact: 'high', summary: ' Out for the opener. ' },
        { newsId: 'nw-B', direction: 'improves', impact: 'low', summary: 'Named the starter.' },
      ],
      known,
    )
    expect(errors).toEqual([])
    expect(assessments).toHaveLength(2)
    expect(assessments[0]?.summary).toBe('Out for the opener.')
  })

  it('rejects unknown news ids', () => {
    const { assessments, errors } = parseAssessmentFile(
      [{ newsId: 'nw-missing', direction: 'harms', impact: 'low', summary: 'x' }],
      known,
    )
    expect(assessments).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/unknown newsId/)
  })

  it('rejects bad enums and empty summaries', () => {
    const { errors } = parseAssessmentFile(
      [
        { newsId: 'nw-A', direction: 'hurts', impact: 'low', summary: 'x' },
        { newsId: 'nw-A', direction: 'harms', impact: 'severe', summary: 'x' },
        { newsId: 'nw-A', direction: 'harms', impact: 'low', summary: '   ' },
        'not-an-object',
      ],
      known,
    )
    expect(errors).toHaveLength(4)
    expect(errors[0]).toMatch(/direction must be one of improves\|harms\|unclear/)
    expect(errors[1]).toMatch(/impact must be one of low\|med\|high/)
    expect(errors[2]).toMatch(/summary/)
    expect(errors[3]).toMatch(/not an object/)
  })

  it('rejects a non-array payload', () => {
    const { errors } = parseAssessmentFile({ newsId: 'nw-A' }, known)
    expect(errors).toHaveLength(1)
  })
})
