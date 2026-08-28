import { describe, expect, it } from 'vitest'

import { UnknownReferenceValueError } from './errors.js'
import { SLOT_ELIGIBILITY, lineupSlotFromEspn } from './lineup-slot.js'

describe('lineupSlotFromEspn', () => {
  it('maps the supported numeric ids', () => {
    expect(lineupSlotFromEspn(0)).toBe('QB')
    expect(lineupSlotFromEspn(2)).toBe('RB')
    expect(lineupSlotFromEspn(4)).toBe('WR')
    expect(lineupSlotFromEspn(6)).toBe('TE')
    expect(lineupSlotFromEspn(23)).toBe('FLEX')
    expect(lineupSlotFromEspn(16)).toBe('DST')
    expect(lineupSlotFromEspn(17)).toBe('K')
    expect(lineupSlotFromEspn(20)).toBe('BENCH')
    expect(lineupSlotFromEspn(21)).toBe('IR')
  })

  it('throws on slots the league must not use (superflex, IDP, HC)', () => {
    expect(() => lineupSlotFromEspn(7)).toThrow(UnknownReferenceValueError)
    expect(() => lineupSlotFromEspn(8)).toThrow(UnknownReferenceValueError)
    expect(() => lineupSlotFromEspn(19)).toThrow(UnknownReferenceValueError)
  })
})

describe('SLOT_ELIGIBILITY', () => {
  it('makes FLEX eligible for RB/WR/TE only', () => {
    expect(SLOT_ELIGIBILITY.FLEX).toEqual(['RB', 'WR', 'TE'])
  })

  it('gives BENCH and IR no starting eligibility', () => {
    expect(SLOT_ELIGIBILITY.BENCH).toEqual([])
    expect(SLOT_ELIGIBILITY.IR).toEqual([])
  })
})
