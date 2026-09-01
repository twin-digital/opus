import { describe, expect, it } from 'vitest'

import { UnknownReferenceValueError } from './errors.js'
import {
  ESPN_PRO_TEAM_IDS,
  NFL_TEAMS,
  teamFromEspn,
  teamFromFantasyPros,
  teamFromNflverse,
  teamFromSleeper,
} from './nfl-team.js'

describe('NFL_TEAMS', () => {
  it('is the 32-team canonical set', () => {
    expect(NFL_TEAMS).toHaveLength(32)
    expect(new Set(NFL_TEAMS).size).toBe(32)
  })
})

describe('teamFromEspn', () => {
  it('covers all 32 teams', () => {
    expect(new Set(Object.values(ESPN_PRO_TEAM_IDS)).size).toBe(32)
  })

  it('maps the spot-verified ids', () => {
    expect(teamFromEspn(8)).toBe('DET')
    expect(teamFromEspn(4)).toBe('CIN')
    expect(teamFromEspn(14)).toBe('LA')
    expect(teamFromEspn(1)).toBe('ATL')
    expect(teamFromEspn(26)).toBe('SEA')
  })

  it('maps 0 to free agent (null)', () => {
    expect(teamFromEspn(0)).toBeNull()
  })

  it('throws on unknown ids (31, 32 are unassigned in ESPN scheme)', () => {
    expect(() => teamFromEspn(31)).toThrow(UnknownReferenceValueError)
    expect(() => teamFromEspn(35)).toThrow(UnknownReferenceValueError)
  })
})

describe('teamFromSleeper', () => {
  it('remaps LAR to LA and passes canonical codes through', () => {
    expect(teamFromSleeper('LAR')).toBe('LA')
    expect(teamFromSleeper('KC')).toBe('KC')
  })

  it('maps null to free agent', () => {
    expect(teamFromSleeper(null)).toBeNull()
  })

  it('throws on unknown codes', () => {
    expect(() => teamFromSleeper('OAK')).toThrow(UnknownReferenceValueError)
  })
})

describe('teamFromFantasyPros', () => {
  it('remaps LAR and JAC, and treats FA as free agent', () => {
    expect(teamFromFantasyPros('LAR')).toBe('LA')
    expect(teamFromFantasyPros('JAC')).toBe('JAX')
    expect(teamFromFantasyPros('FA')).toBeNull()
  })

  it('throws on unknown codes', () => {
    expect(() => teamFromFantasyPros('SFO')).toThrow(UnknownReferenceValueError)
  })
})

describe('teamFromNflverse', () => {
  it('remaps era codes across relocations', () => {
    expect(teamFromNflverse('OAK')).toBe('LV')
    expect(teamFromNflverse('SD')).toBe('LAC')
    expect(teamFromNflverse('STL')).toBe('LA')
  })

  it('passes canonical codes through and throws on junk', () => {
    expect(teamFromNflverse('GB')).toBe('GB')
    expect(() => teamFromNflverse('GBP')).toThrow(UnknownReferenceValueError)
  })
})
