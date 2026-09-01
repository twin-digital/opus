import type { MarketData, PlayerId } from '@twin-digital/football-data'
import { describe, expect, it } from 'vitest'

import {
  availabilityAtPick,
  makeItBackOdds,
  makeItBackOddsForMarket,
  normalCdf,
  overallPicksForSlot,
  planningAdp,
  sigmaForPick,
  survivalAtPick,
  upcomingPicksForSlot,
} from './draft-math.js'

describe('overallPicksForSlot', () => {
  it('computes snake picks for slot 11 of 12', () => {
    expect(overallPicksForSlot(11, 12, 6)).toEqual([11, 14, 35, 38, 59, 62])
  })

  it('handles the turn (slot 12) and the top (slot 1)', () => {
    expect(overallPicksForSlot(12, 12, 4)).toEqual([12, 13, 36, 37])
    expect(overallPicksForSlot(1, 12, 4)).toEqual([1, 24, 25, 48])
  })
})

describe('upcomingPicksForSlot', () => {
  it('returns the next two picks at or after the pick on the clock', () => {
    expect(upcomingPicksForSlot(11, 12, 1)).toEqual([11, 14])
    expect(upcomingPicksForSlot(11, 12, 11)).toEqual([11, 14])
    expect(upcomingPicksForSlot(11, 12, 12)).toEqual([14, 35])
    expect(upcomingPicksForSlot(11, 12, 39)).toEqual([59, 62])
  })
})

describe('normalCdf', () => {
  it('matches known values', () => {
    expect(normalCdf(0, 0, 1)).toBeCloseTo(0.5, 6)
    expect(normalCdf(1.96, 0, 1)).toBeCloseTo(0.975, 3)
    expect(normalCdf(-1.96, 0, 1)).toBeCloseTo(0.025, 3)
  })
})

describe('sigmaForPick', () => {
  it("uses rank_std where present, else the ADP-scaled default — both floored at the room's measured σ", () => {
    expect(sigmaForPick(10, 5)).toBe(5)
    // The floor is TUNING.SIGMA_FLOOR = 4.5: the room study measured σ ≈ 4.5 for ranks 1–30.
    expect(sigmaForPick(10, 0.5)).toBe(4.5)
    expect(sigmaForPick(10, null)).toBeCloseTo(4.5, 6)
    expect(sigmaForPick(100, undefined)).toBeCloseTo(17, 6)
    expect(sigmaForPick(10, 0)).toBeCloseTo(4.5, 6)
    // Beyond adp ≈ 16.7 the 0.15·adp + 2 scaling exceeds the floor and takes over.
    expect(sigmaForPick(30, null)).toBeCloseTo(6.5, 6)
  })
})

describe('availabilityAtPick', () => {
  it('is near-certain for picks far before ADP and near-zero far after', () => {
    expect(availabilityAtPick(100, 5, 10)).toBeGreaterThan(0.999)
    expect(availabilityAtPick(5, 3, 30)).toBeLessThan(0.001)
    expect(availabilityAtPick(20, 4, 20)).toBeCloseTo(0.55, 1)
  })

  it('decreases as the pick number grows', () => {
    const odds = [10, 20, 30, 40].map((pick) => availabilityAtPick(25, 6, pick))
    expect(odds).toEqual([...odds].sort((a, b) => b - a))
  })
})

describe('makeItBackOdds', () => {
  it('conditions on the player having survived to the current pick', () => {
    const unconditional = availabilityAtPick(20, 5, 30)
    const conditional = makeItBackOdds(20, 5, 25, 30)
    expect(conditional).toBeGreaterThan(unconditional)
    expect(conditional).toBeLessThanOrEqual(1)
  })

  it('is 1 when the target pick is now, and 0 when survival is hopeless', () => {
    expect(makeItBackOdds(20, 5, 15, 15)).toBe(1)
    expect(makeItBackOdds(5, 2, 6, 40)).toBeCloseTo(0, 6)
  })
})

describe('adpSource', () => {
  // Mike Evans shaped: buried by ESPN (94) relative to the market (61).
  const buried: MarketData = {
    playerId: 'p-1',
    adp: { espn: { ppr: 94 }, sleeper: { half: 61 } },
    ecr: { rank: 60, posRank: 'WR20', tier: 5, best: 35, worst: 90, stdDev: 11 },
    percentRostered: null,
    asOf: 'now',
  }

  it('planningAdp defaults to the room, falls back through market prices', () => {
    expect(planningAdp(buried)).toBe(94)
    expect(planningAdp(buried, { adpSource: 'market' })).toBe(61)
    const sleeperOnly = { ...buried, adp: { sleeper: { half: 61 } } }
    expect(planningAdp(sleeperOnly)).toBe(61)
    const sentinel = { ...buried, adp: { espn: { ppr: 170 }, sleeper: { ppr: 61 } } }
    expect(planningAdp(sentinel)).toBe(61) // sentinel skipped, non-half market rides in
    expect(planningAdp({ ...buried, adp: {} })).toBeNull()
  })

  it('a buried player survives to my later picks with higher probability under room ADP', () => {
    for (const pick of [35, 38]) {
      const room = survivalAtPick(buried, pick) as number
      const market = survivalAtPick(buried, pick, { adpSource: 'market' }) as number
      expect(room).toBeGreaterThan(market)
    }
    const roomOdds = makeItBackOddsForMarket(buried, 11, 35) as number
    const marketOdds = makeItBackOddsForMarket(buried, 11, 35, { adpSource: 'market' }) as number
    expect(roomOdds).toBeGreaterThan(marketOdds)
  })

  it('survival helpers return null without an ADP', () => {
    const bare = { ...buried, adp: {} }
    expect(survivalAtPick(bare, 35)).toBeNull()
    expect(makeItBackOddsForMarket(bare, 11, 35)).toBeNull()
  })
})
