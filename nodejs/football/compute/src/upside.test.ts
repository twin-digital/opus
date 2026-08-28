import type { MarketData, PlayerId } from '@twin-digital/football-data'
import { describe, expect, it } from 'vitest'

import { computeUpsideScores, isDraftable, upsideSignals } from './upside.js'

let seq = 0
const market = (
  ecr: { rank: number; best: number; stdDev: number } | null,
  adp: MarketData['adp'] = { sleeper: { half: 50 } },
): MarketData => ({
  playerId: `p-${String((seq += 1))}`,
  adp,
  ecr:
    ecr === null ? null : { rank: ecr.rank, posRank: 'WR1', tier: 1, best: ecr.best, worst: 200, stdDev: ecr.stdDev },
  percentRostered: null,
  asOf: 'now',
})

describe('upsideSignals', () => {
  it('reads ceilingJump and sigma off ECR', () => {
    expect(upsideSignals(market({ rank: 60, best: 35, stdDev: 11 }))).toEqual({
      ceilingJump: 25,
      sigma: 11,
      spread: null,
    })
    expect(upsideSignals(market(null))).toBeNull()
  })

  it('carries the residual spread and keeps ECR-less players once a spread exists', () => {
    expect(upsideSignals(market(null), 40)).toEqual({ ceilingJump: null, sigma: null, spread: 40 })
  })
})

describe('isDraftable', () => {
  it('requires some ADP under the draft horizon', () => {
    expect(isDraftable(market(null, { sleeper: { half: 50 } }))).toBe(true)
    expect(isDraftable(market(null, {}))).toBe(false)
    expect(isDraftable(market(null, { espn: { ppr: 170 } }))).toBe(false)
    expect(isDraftable(market(null, { sleeper: { half: 200 } }))).toBe(false)
  })
})

describe('computeUpsideScores', () => {
  it('blends rank percentiles of ceilingJump and sigma into a 0–100 score', () => {
    const low = market({ rank: 10, best: 9, stdDev: 2 })
    const mid = market({ rank: 50, best: 40, stdDev: 6 })
    const high = market({ rank: 90, best: 40, stdDev: 15 })
    const scores = computeUpsideScores([low, mid, high])
    expect(scores.get(low.playerId)).toBe(0)
    expect(scores.get(mid.playerId)).toBe(50)
    expect(scores.get(high.playerId)).toBe(100)
  })

  it('skips undraftable and ECR-less players', () => {
    const draftable = market({ rank: 50, best: 40, stdDev: 6 })
    const noEcr = market(null)
    const undraftable = market({ rank: 50, best: 10, stdDev: 20 }, { espn: { ppr: 170 } })
    const scores = computeUpsideScores([draftable, noEcr, undraftable])
    expect(scores.has(draftable.playerId)).toBe(true)
    expect(scores.has(noEcr.playerId)).toBe(false)
    expect(scores.has(undraftable.playerId)).toBe(false)
  })

  it('blends the residual spread as a third component', () => {
    const calm = market({ rank: 10, best: 9, stdDev: 2 })
    const torn = market({ rank: 90, best: 40, stdDev: 15 })
    const noSpread = computeUpsideScores([calm, torn])
    const withSpread = computeUpsideScores(
      [calm, torn],
      new Map([
        [calm.playerId, 80],
        [torn.playerId, 5],
      ]),
    )
    // spread percentiles pull the torn-panel player down and the calm one up
    expect(withSpread.get(calm.playerId)).toBeGreaterThan(noSpread.get(calm.playerId) as number)
    expect(withSpread.get(torn.playerId)).toBeLessThan(noSpread.get(torn.playerId) as number)
  })

  it('scores players missing components on the mean of what exists', () => {
    const ecrOnly = market({ rank: 50, best: 40, stdDev: 6 })
    const spreadOnly = market(null)
    const both = market({ rank: 90, best: 40, stdDev: 15 })
    const scores = computeUpsideScores(
      [ecrOnly, spreadOnly, both],
      new Map([
        [spreadOnly.playerId, 10],
        [both.playerId, 60],
      ]),
    )
    // spread-only player: scored on the spread percentile alone (lower of the two spreads → 0)
    expect(scores.get(spreadOnly.playerId)).toBe(0)
    // ecr-only player: mean of its two ECR percentiles (lower of two on both → 0)
    expect(scores.get(ecrOnly.playerId)).toBe(0)
    // both: top of every component it carries
    expect(scores.get(both.playerId)).toBe(100)
  })

  it('averages tied ranks', () => {
    const a = market({ rank: 50, best: 40, stdDev: 6 })
    const b = market({ rank: 60, best: 50, stdDev: 6 })
    const scores = computeUpsideScores([a, b])
    // identical signals → identical mid scores
    expect(scores.get(a.playerId)).toBe(scores.get(b.playerId))
  })
})
