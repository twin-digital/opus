import { describe, expect, it } from 'vitest'
import { EXTRACTED_STRING_MAX_CHARS, comparesOver, normalizeExtractedValue } from './normalize-extracted.js'

/**
 * Spec: d-dmwaark1 + the normalize-extracted module header. Normalization is code, not model
 * behavior: canonical forms in, canonical forms out, and anything that
 * doesn't normalize returns null (the caller drops the Tag).
 */

describe('normalizeExtractedValue: string', () => {
  it('trims', () => {
    expect(normalizeExtractedValue('string', '  Water Co  ')).toBe('Water Co')
  })

  it('caps at the length limit', () => {
    const long = 'x'.repeat(EXTRACTED_STRING_MAX_CHARS + 50)
    expect(normalizeExtractedValue('string', long)).toBe('x'.repeat(EXTRACTED_STRING_MAX_CHARS))
  })

  it('drops an empty/whitespace value', () => {
    expect(normalizeExtractedValue('string', '   ')).toBeNull()
  })
})

describe('normalizeExtractedValue: money', () => {
  it('normalizes the design example: "195.03 USD" → "19503:USD"', () => {
    expect(normalizeExtractedValue('money', '195.03 USD')).toBe('19503:USD')
  })

  it('accepts code-first, symbol, thousands separators, and lowercase codes', () => {
    expect(normalizeExtractedValue('money', 'USD 195.03')).toBe('19503:USD')
    expect(normalizeExtractedValue('money', '$1,234.56')).toBe('123456:USD')
    expect(normalizeExtractedValue('money', '€10')).toBe('1000:EUR')
    expect(normalizeExtractedValue('money', '42 eur')).toBe('4200:EUR')
  })

  it('stores zero-decimal currencies in whole units', () => {
    expect(normalizeExtractedValue('money', '¥1000')).toBe('1000:JPY')
  })

  it('handles negative amounts (refunds)', () => {
    expect(normalizeExtractedValue('money', '-5.00 USD')).toBe('-500:USD')
  })

  it('drops an amount without a recognizable currency', () => {
    expect(normalizeExtractedValue('money', '195.03')).toBeNull()
    expect(normalizeExtractedValue('money', 'about twenty bucks')).toBeNull()
  })

  it('drops text with a currency but no parseable amount', () => {
    expect(normalizeExtractedValue('money', 'USD several')).toBeNull()
  })
})

describe('normalizeExtractedValue: date', () => {
  it('passes an ISO date through and strips a time suffix', () => {
    expect(normalizeExtractedValue('date', '2026-08-10')).toBe('2026-08-10')
    expect(normalizeExtractedValue('date', '2026-08-10T14:00:00Z')).toBe('2026-08-10')
  })

  it('parses a common prose spelling', () => {
    expect(normalizeExtractedValue('date', 'Aug 10, 2026')).toBe('2026-08-10')
  })

  it('drops impossible or non-date text', () => {
    expect(normalizeExtractedValue('date', '2026-13-40')).toBeNull()
    expect(normalizeExtractedValue('date', 'next Tuesday')).toBeNull()
    expect(normalizeExtractedValue('date', 'soon')).toBeNull()
  })
})

describe('comparesOver (the digest highlight comparison)', () => {
  it('compares money as integer minor units within one currency', () => {
    expect(comparesOver('19503:USD', '10000:USD')).toBe(true)
    expect(comparesOver('9999:USD', '10000:USD')).toBe(false)
    expect(comparesOver('10000:USD', '10000:USD')).toBe(false) // strictly over
  })

  it('never highlights across currencies', () => {
    expect(comparesOver('19503:EUR', '10000:USD')).toBe(false)
  })

  it('compares ISO dates lexicographically', () => {
    expect(comparesOver('2026-08-11', '2026-08-10')).toBe(true)
    expect(comparesOver('2026-08-09', '2026-08-10')).toBe(false)
  })

  it('is false for incomparable values', () => {
    expect(comparesOver('Water Co', '10000:USD')).toBe(false)
    expect(comparesOver('19503:USD', '2026-08-10')).toBe(false)
  })
})
