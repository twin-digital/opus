import { describe, expect, it } from 'vitest'

import { bearerToken, isAuthorized, tokenMatches } from './auth.js'

describe('bearerToken', () => {
  it('extracts the token from a Bearer header (case-insensitive)', () => {
    expect(bearerToken('Bearer s3cret')).toBe('s3cret')
    expect(bearerToken('bearer s3cret')).toBe('s3cret')
    expect(bearerToken('  Bearer   s3cret  ')).toBe('s3cret')
  })

  it('returns undefined for missing or non-Bearer headers', () => {
    expect(bearerToken(undefined)).toBeUndefined()
    expect(bearerToken('Basic abc')).toBeUndefined()
    expect(bearerToken('Bearer')).toBeUndefined()
  })
})

describe('tokenMatches', () => {
  it('accepts an exact match and rejects everything else', () => {
    expect(tokenMatches('s3cret', 's3cret')).toBe(true)
    expect(tokenMatches('wrong', 's3cret')).toBe(false)
    expect(tokenMatches('s3cre', 's3cret')).toBe(false) // length mismatch
    expect(tokenMatches(undefined, 's3cret')).toBe(false)
  })
})

describe('isAuthorized', () => {
  it('is true only for the exact bearer secret', () => {
    expect(isAuthorized('Bearer s3cret', 's3cret')).toBe(true)
    expect(isAuthorized('Bearer nope', 's3cret')).toBe(false)
    expect(isAuthorized(undefined, 's3cret')).toBe(false)
  })
})
