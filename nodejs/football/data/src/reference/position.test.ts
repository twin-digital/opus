import { describe, expect, it } from 'vitest'

import { UnknownReferenceValueError } from './errors.js'
import { positionFromEspn, positionFromFantasyPros, positionFromNflverse, positionFromSleeper } from './position.js'

describe('positionFromSleeper', () => {
  it('maps from fantasy_positions, not position (FB depth role)', () => {
    expect(positionFromSleeper(['RB'])).toBe('RB')
  })

  it('maps DEF to DST', () => {
    expect(positionFromSleeper(['DEF'])).toBe('DST')
  })

  it('skips known IDP tokens for two-way players (Travis Hunter shape)', () => {
    expect(positionFromSleeper(['DB', 'WR'])).toBe('WR')
  })

  it('returns null for IDP-only players (out of scope)', () => {
    expect(positionFromSleeper(['LB'])).toBeNull()
  })

  it('throws on unknown values', () => {
    expect(() => positionFromSleeper(['OL'])).toThrow(UnknownReferenceValueError)
    expect(() => positionFromSleeper([])).toThrow(UnknownReferenceValueError)
    expect(() => positionFromSleeper(null)).toThrow(UnknownReferenceValueError)
  })
})

describe('positionFromEspn', () => {
  it('maps the documented numeric ids', () => {
    expect(positionFromEspn(1)).toBe('QB')
    expect(positionFromEspn(2)).toBe('RB')
    expect(positionFromEspn(3)).toBe('WR')
    expect(positionFromEspn(4)).toBe('TE')
    expect(positionFromEspn(5)).toBe('K')
    expect(positionFromEspn(16)).toBe('DST')
  })

  it('throws on unknown ids (IDP etc.)', () => {
    expect(() => positionFromEspn(9)).toThrow(UnknownReferenceValueError)
    expect(() => positionFromEspn(0)).toThrow(UnknownReferenceValueError)
  })
})

describe('positionFromNflverse', () => {
  it('accepts position groups verbatim', () => {
    expect(positionFromNflverse('RB')).toBe('RB')
  })

  it('throws on unknown groups', () => {
    expect(() => positionFromNflverse('SPEC')).toThrow(UnknownReferenceValueError)
  })
})

describe('positionFromFantasyPros', () => {
  it('accepts canonical values verbatim', () => {
    expect(positionFromFantasyPros('DST')).toBe('DST')
    expect(positionFromFantasyPros('WR')).toBe('WR')
  })

  it('throws on unknown values', () => {
    expect(() => positionFromFantasyPros('IDP')).toThrow(UnknownReferenceValueError)
  })
})
