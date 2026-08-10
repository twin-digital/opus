import { describe, expect, it } from 'vitest'

import { API_ERROR_CODES, apiErrorBodySchema } from './api-error.js'

// d-u2rotm38 — a refusal is structured, not prose. The daemon composes refusals
// from this shape and the browser application parses them with it, so it is
// declared once here (d-j4huq3jy) rather than on each side.

describe('apiErrorBodySchema', () => {
  it('accepts a refusal naming what was wrong and where', () => {
    const result = apiErrorBodySchema.safeParse({
      error: {
        code: 'pipeline_validation_failed',
        message: 'The pipeline could not run.',
        details: [{ operator_id: 4, field: 'output_tag_key' }],
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts a refusal with no details', () => {
    expect(
      apiErrorBodySchema.safeParse({
        error: { code: 'not_found', message: 'No such operator.' },
      }).success,
    ).toBe(true)
  })

  it('rejects a bare sentence', () => {
    expect(apiErrorBodySchema.safeParse({ error: 'it broke' }).success).toBe(false)
  })

  it('requires a code', () => {
    const result = apiErrorBodySchema.safeParse({
      error: { message: 'it broke' },
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['error', 'code'])
    }
  })

  it('rejects an empty code', () => {
    expect(apiErrorBodySchema.safeParse({ error: { code: '', message: 'x' } }).success).toBe(false)
  })

  it('keeps code open so a new refusal is not a breaking change', () => {
    expect(
      apiErrorBodySchema.safeParse({
        error: { code: 'a_refusal_added_later', message: 'x' },
      }).success,
    ).toBe(true)
  })

  it('validates every code grinbox itself produces', () => {
    for (const code of API_ERROR_CODES) {
      expect(apiErrorBodySchema.safeParse({ error: { code, message: 'x' } }).success).toBe(true)
    }
    expect(new Set(API_ERROR_CODES).size).toBe(API_ERROR_CODES.length)
  })
})
