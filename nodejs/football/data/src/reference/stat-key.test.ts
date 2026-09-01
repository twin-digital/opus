import { describe, expect, it } from 'vitest'

import { UnknownReferenceValueError } from './errors.js'
import { ESPN_STAT_IDS, SLEEPER_STAT_FIELDS, STAT_KEYS, STAT_KEY_MAPPINGS, statKeyFromEspn } from './stat-key.js'

describe('STAT_KEY_MAPPINGS', () => {
  it('covers every canonical key', () => {
    expect(Object.keys(STAT_KEY_MAPPINGS).sort()).toEqual([...STAT_KEYS].sort())
  })

  it('has unique ESPN statIds', () => {
    expect(ESPN_STAT_IDS.size).toBe(STAT_KEYS.length)
  })

  it('maps the documented ESPN ids', () => {
    expect(statKeyFromEspn(53)).toBe('rec')
    expect(statKeyFromEspn(3)).toBe('passYd')
    expect(statKeyFromEspn(24)).toBe('rushYd')
    expect(statKeyFromEspn(42)).toBe('recYd')
    expect(statKeyFromEspn(72)).toBe('fumLost')
  })

  it('throws on unmapped ESPN ids', () => {
    expect(() => statKeyFromEspn(40)).toThrow(UnknownReferenceValueError)
  })

  it('maps Sleeper snake_case fields, with recTgt not provided', () => {
    expect(SLEEPER_STAT_FIELDS.get('pass_yd')).toBe('passYd')
    expect(SLEEPER_STAT_FIELDS.get('rec_2pt')).toBe('twoPtRec')
    expect(SLEEPER_STAT_FIELDS.has('rec_tgt')).toBe(false)
    expect(STAT_KEY_MAPPINGS.recTgt.sleeper).toBeNull()
  })

  it('sums three nflverse columns into fumLost', () => {
    expect(STAT_KEY_MAPPINGS.fumLost.nflverse).toEqual([
      'sack_fumbles_lost',
      'rushing_fumbles_lost',
      'receiving_fumbles_lost',
    ])
  })
})
