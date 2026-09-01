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
  it('reads ceilingJump and sigma off ECR, normalized by √rank', () => {
    const signals = upsideSignals(market({ rank: 60, best: 35, stdDev: 11 }))
    expect(signals?.ceilingJump).toBeCloseTo(25 / Math.sqrt(60), 9)
    expect(signals?.sigma).toBeCloseTo(11 / Math.sqrt(60), 9)
    expect(signals?.spread).toBeNull()
    expect(upsideSignals(market(null))).toBeNull()
  })

  it('carries the residual spread and keeps ECR-less players once a spread exists', () => {
    expect(upsideSignals(market(null), 40)).toEqual({ ceilingJump: null, sigma: null, spread: 40 })
  })
})

describe('isDraftable', () => {
  it('requires a real price at or under MAX_REAL_ADP from some source', () => {
    expect(isDraftable(market(null, { sleeper: { half: 50 } }))).toBe(true)
    expect(isDraftable(market(null, {}))).toBe(false)
    expect(isDraftable(market(null, { espn: { ppr: 170 } }))).toBe(false)
    expect(isDraftable(market(null, { sleeper: { half: 200 } }))).toBe(false)
    // ESPN's sentinel shoulder (167–169.4) is not a real price…
    expect(isDraftable(market(null, { espn: { half: 168 } }))).toBe(false)
    // …unless another source prices him inside the horizon.
    expect(isDraftable(market(null, { espn: { half: 168 }, sleeper: { half: 120 } }))).toBe(true)
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

  it('a deep-tail name with a huge raw spread but no real price scores below a genuine ticket', () => {
    // The Mendoza case: ECR 300, enormous raw ceilingJump/stdDev, but ESPN prices him on the
    // sentinel shoulder and the market past the horizon — no score at all.
    const deepTail = market({ rank: 300, best: 120, stdDev: 55 }, { espn: { half: 168 }, sleeper: { half: 188 } })
    // A draftable-range genuine ticket: moderate spread, real price.
    const genuine = market({ rank: 120, best: 55, stdDev: 20 }, { sleeper: { half: 150 } })
    const baseline = market({ rank: 40, best: 38, stdDev: 4 }, { sleeper: { half: 40 } })
    const scores = computeUpsideScores([deepTail, genuine, baseline])
    expect(scores.has(deepTail.playerId)).toBe(false)
    const genuineScore = scores.get(genuine.playerId) as number
    expect(genuineScore).toBeGreaterThan(50)
    expect(scores.get(deepTail.playerId) ?? -1).toBeLessThan(genuineScore)
  })

  it('√rank normalization: a deeper player no longer wins on a bigger raw jump alone', () => {
    // Raw jumps 90 > 68, but 90/√300 = 5.2 < 68/√120 = 6.2 — depth stops paying rent.
    const deep = market({ rank: 300, best: 210, stdDev: 30 }, { sleeper: { half: 150 } })
    const shallow = market({ rank: 120, best: 52, stdDev: 20 }, { sleeper: { half: 150 } })
    const baseline = market({ rank: 40, best: 38, stdDev: 4 }, { sleeper: { half: 40 } })
    const scores = computeUpsideScores([deep, shallow, baseline])
    expect(scores.get(shallow.playerId) as number).toBeGreaterThan(scores.get(deep.playerId) as number)
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
    const b = market({ rank: 50, best: 40, stdDev: 6 })
    const scores = computeUpsideScores([a, b])
    // identical (normalized) signals → identical mid scores
    expect(scores.get(a.playerId)).toBe(scores.get(b.playerId))
  })
})
