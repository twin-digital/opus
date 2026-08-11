import { describe, expect, it } from 'vitest'
import { formatMoneyDisplay } from './index.js'

// --- the display form (r-735kq72h, d-oc073wsp, d-b1ntd8go) -----------------
//
// The form follows from the ISO currency alone; the conventions are fixed
// once: known symbol before the amount, comma thousands, period decimal, a
// leading minus, and no decimals where the currency's minor unit is its whole
// unit. A value that is not the normalized money form returns null and the
// caller renders it verbatim (d-m6ingqyv).

describe('formatMoneyDisplay', () => {
  it('renders a known-symbol currency with the symbol before the amount', () => {
    expect(formatMoneyDisplay('19503:USD')).toBe('$195.03')
    expect(formatMoneyDisplay('995:EUR')).toBe('€9.95')
    expect(formatMoneyDisplay('100:GBP')).toBe('£1.00')
  })

  it('renders the ISO code beside the amount where no symbol is known', () => {
    expect(formatMoneyDisplay('995:CHF')).toBe('CHF 9.95')
    expect(formatMoneyDisplay('123456:SEK')).toBe('SEK 1,234.56')
  })

  it('groups thousands with commas', () => {
    expect(formatMoneyDisplay('123456789:USD')).toBe('$1,234,567.89')
    expect(formatMoneyDisplay('100000000:USD')).toBe('$1,000,000.00')
  })

  it('carries no decimals where the minor unit is the whole unit', () => {
    expect(formatMoneyDisplay('1234:JPY')).toBe('¥1,234')
    expect(formatMoneyDisplay('987654:KRW')).toBe('KRW 987,654')
  })

  it('renders three decimals for a three-decimal minor unit', () => {
    expect(formatMoneyDisplay('1234:KWD')).toBe('KWD 1.234')
    expect(formatMoneyDisplay('500:BHD')).toBe('BHD 0.500')
  })

  it('leads a negative amount with a minus sign', () => {
    expect(formatMoneyDisplay('-19503:USD')).toBe('-$195.03')
    expect(formatMoneyDisplay('-1234:JPY')).toBe('-¥1,234')
    expect(formatMoneyDisplay('-995:CHF')).toBe('-CHF 9.95')
  })

  it('pads amounts smaller than one whole unit', () => {
    expect(formatMoneyDisplay('5:USD')).toBe('$0.05')
    expect(formatMoneyDisplay('50:USD')).toBe('$0.50')
  })

  it('renders zero without a sign', () => {
    expect(formatMoneyDisplay('0:USD')).toBe('$0.00')
    expect(formatMoneyDisplay('-0:USD')).toBe('$0.00')
  })

  it('returns null for anything that is not the normalized stored form', () => {
    // The caller renders these verbatim (d-m6ingqyv).
    expect(formatMoneyDisplay('hello')).toBeNull()
    expect(formatMoneyDisplay('2026-08-10')).toBeNull()
    expect(formatMoneyDisplay('19503')).toBeNull()
    expect(formatMoneyDisplay('19503:usd')).toBeNull()
    expect(formatMoneyDisplay('19503:USDX')).toBeNull()
    expect(formatMoneyDisplay('19.503:USD')).toBeNull()
    expect(formatMoneyDisplay(':USD')).toBeNull()
    expect(formatMoneyDisplay('')).toBeNull()
  })
})
