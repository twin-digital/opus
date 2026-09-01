import { describe, expect, it } from 'vitest'

import { normalizeName } from './normalize.js'

describe('normalizeName', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeName("Ja'Marr Chase")).toBe('jamarr chase')
    expect(normalizeName('Amon-Ra St. Brown')).toBe('amonra st brown')
  })

  it('strips generational suffixes', () => {
    expect(normalizeName('Marvin Harrison Jr.')).toBe('marvin harrison')
    expect(normalizeName('Kenneth Walker III')).toBe('kenneth walker')
  })

  it('collapses whitespace', () => {
    expect(normalizeName('  A  J   Brown ')).toBe('a j brown')
  })
})
