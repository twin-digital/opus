import type { MarketData, PlayerId } from '@twin-digital/football-data'
import { describe, expect, it } from 'vitest'

import { marketAdp, roomAdp, roomDelta } from './room.js'

const market = (adp: MarketData['adp']): MarketData => ({
  playerId: 'p-1',
  adp,
  ecr: null,
  percentRostered: null,
  asOf: 'now',
})

describe('roomAdp', () => {
  it('prefers ESPN over Sleeper half-PPR', () => {
    expect(roomAdp(market({ espn: { ppr: 94 }, sleeper: { half: 61 } }))).toBe(94)
  })

  it('falls back to Sleeper half-PPR when ESPN has none', () => {
    expect(roomAdp(market({ sleeper: { half: 61, ppr: 60 } }))).toBe(61)
    expect(roomAdp(market({ sleeper: { ppr: 60 } }))).toBeNull()
  })

  it('treats ESPN ADP at or past 169.5 as the undrafted sentinel', () => {
    expect(roomAdp(market({ espn: { ppr: 170 }, sleeper: { half: 120 } }))).toBe(120)
    expect(roomAdp(market({ espn: { ppr: 169.5 } }))).toBeNull()
    expect(roomAdp(market({ espn: { ppr: 169.4 } }))).toBe(169.4)
  })
})

describe('marketAdp', () => {
  it('prefers half-PPR and never reads ESPN', () => {
    expect(marketAdp(market({ sleeper: { half: 61, ppr: 60 }, espn: { ppr: 94 } }))).toBe(61)
    expect(marketAdp(market({ fantasypros: { ppr: 55 } }))).toBe(55)
    expect(marketAdp(market({ espn: { ppr: 94 } }))).toBeNull()
  })
})

describe('roomDelta', () => {
  it('is signed espn − market where both exist (positive = buried)', () => {
    expect(roomDelta(market({ espn: { ppr: 94 }, sleeper: { half: 61 } }))).toBeCloseTo(33)
    expect(roomDelta(market({ espn: { ppr: 40 }, sleeper: { half: 60 } }))).toBeCloseTo(-20)
  })

  it('is null when either side is missing or ESPN shows the sentinel', () => {
    expect(roomDelta(market({ sleeper: { half: 61 } }))).toBeNull()
    expect(roomDelta(market({ espn: { ppr: 94 } }))).toBeNull()
    expect(roomDelta(market({ espn: { ppr: 170 }, sleeper: { half: 61 } }))).toBeNull()
  })
})
