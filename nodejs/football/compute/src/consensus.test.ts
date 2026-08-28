import type { PlayerId, Position, SeasonProjection, StatKey } from '@twin-digital/football-data'
import { describe, expect, it } from 'vitest'

import { buildConsensus, buildConsensusV2, type ConsensusContext } from './consensus.js'
import { TUNING } from './tuning.js'

const row = (overrides: Partial<SeasonProjection>): SeasonProjection => ({
  playerId: 'p-1',
  source: 'sleeper',
  season: 2026,
  gamesPlayed: 17,
  stats: {},
  prescored: {},
  ...overrides,
})

describe('buildConsensus', () => {
  it('takes the per-stat median across the sources that carry the stat', () => {
    const consensus = buildConsensus(
      [
        row({ source: 'sleeper', stats: { rushYd: 1200, rec: 60, recTgt: 80 } }),
        row({ source: 'espn', stats: { rushYd: 1000, rec: 50 } }),
      ],
      2026,
    )
    expect(consensus).toHaveLength(1)
    expect(consensus[0]?.stats).toEqual({ rushYd: 1100, rec: 55, recTgt: 80 })
    expect(consensus[0]?.source).toBe('consensus')
    expect(consensus[0]?.prescored).toEqual({})
  })

  it('is robust to one outlier source among three', () => {
    const consensus = buildConsensus(
      [
        row({ source: 'sleeper', stats: { passYd: 4000 } }),
        row({ source: 'espn', stats: { passYd: 4100 } }),
        row({ source: 'fantasypros', stats: { passYd: 9000 } }),
      ],
      2026,
    )
    expect(consensus[0]?.stats.passYd).toBe(4100)
  })

  it('passes single-source players through and medians gamesPlayed', () => {
    const consensus = buildConsensus(
      [
        row({ playerId: 'p-solo', stats: { rec: 40 }, gamesPlayed: 15 }),
        row({ playerId: 'p-both', source: 'sleeper', stats: { rec: 10 }, gamesPlayed: 16 }),
        row({ playerId: 'p-both', source: 'espn', stats: { rec: 20 }, gamesPlayed: null }),
      ],
      2026,
    )
    const solo = consensus.find((c) => c.playerId === 'p-solo')
    expect(solo?.stats).toEqual({ rec: 40 })
    expect(solo?.gamesPlayed).toBe(15)
    expect(consensus.find((c) => c.playerId === 'p-both')?.gamesPlayed).toBe(16)
  })

  it('ignores other seasons and stale consensus rows', () => {
    const consensus = buildConsensus(
      [
        row({ season: 2025, stats: { rec: 99 } }),
        row({ source: 'consensus', stats: { rec: 42 } }),
        row({ source: 'sleeper', stats: { rec: 10 } }),
      ],
      2026,
    )
    expect(consensus).toHaveLength(1)
    expect(consensus[0]?.stats).toEqual({ rec: 10 })
  })
})

describe('buildConsensusV2', () => {
  // 0.1/rushYd + 0.5/rec keeps expected points easy to read off the fixtures.
  const score = (stats: Partial<Record<StatKey, number>>): number => (stats.rushYd ?? 0) * 0.1 + (stats.rec ?? 0) * 0.5

  const context = (
    positions: Record<string, Position>,
    ecr: Record<string, { rank: number; stdDev: number }> = {},
  ): ConsensusContext => ({
    score,
    positionById: new Map(Object.entries(positions) as [PlayerId, Position][]),
    ecrById: new Map(Object.entries(ecr) as [PlayerId, { rank: number; stdDev: number }][]),
  })

  const points = (result: { rows: SeasonProjection[] }, playerId: string): number =>
    score((result.rows.find((r) => r.playerId === playerId) as SeasonProjection).stats)

  /** One player, FP at 300 pts, sleeper+espn both at 280 — a 20-pt panel-vs-shops gap. */
  const fpTrio = (stdDev: number): { projections: SeasonProjection[]; ctx: ConsensusContext } => ({
    projections: [
      row({ playerId: 'p-a', source: 'fantasypros', stats: { rushYd: 3000 } }),
      row({ playerId: 'p-a', source: 'sleeper', stats: { rushYd: 2800 } }),
      row({ playerId: 'p-a', source: 'espn', stats: { rushYd: 2800 } }),
    ],
    ctx: context({ 'p-a': 'RB' }, { 'p-a': { rank: 1, stdDev } }),
  })

  it('barely moves FP when the expert panel is tight (k clamps at K_MIN)', () => {
    const { projections, ctx } = fpTrio(0.15) // normStd 0.15 → k → K_MIN
    const result = buildConsensusV2(projections, 2026, ctx)
    expect(points(result, 'p-a')).toBeCloseTo(300 + TUNING.K_MIN * (280 - 300), 6) // 299
  })

  it('moves meaningfully toward unanimous deviators when the panel is torn (k clamps at K_MAX)', () => {
    const { projections, ctx } = fpTrio(3) // normStd 3 → k → K_MAX
    const result = buildConsensusV2(projections, 2026, ctx)
    expect(points(result, 'p-a')).toBeCloseTo(300 + TUNING.K_MAX * (280 - 300), 6) // 293
  })

  it('uses K_BASE without ECR and scales the stat line uniformly to the target', () => {
    const projections = [
      row({ playerId: 'p-a', source: 'fantasypros', stats: { rushYd: 1000, rec: 50 } }), // 125
      row({ playerId: 'p-a', source: 'sleeper', stats: { rushYd: 1400, rec: 60 } }), // 170
    ]
    const result = buildConsensusV2(projections, 2026, context({ 'p-a': 'RB' }))
    const target = 125 + TUNING.K_BASE * (170 - 125) // 134
    const stats = result.rows[0]?.stats as { rushYd: number; rec: number }
    expect(score(stats)).toBeCloseTo(target, 6)
    expect(stats.rushYd / stats.rec).toBeCloseTo(1200 / 55, 6) // per-stat median line, scaled uniformly
  })

  it('half-weights ESPN: an ESPN-only deviation moves half of a Sleeper-only one', () => {
    const projections = [
      row({ playerId: 'p-s', source: 'fantasypros', stats: { rushYd: 3000 } }),
      row({ playerId: 'p-s', source: 'sleeper', stats: { rushYd: 3300 } }),
      row({ playerId: 'p-s', source: 'espn', stats: { rushYd: 3000 } }),
      row({ playerId: 'p-e', source: 'fantasypros', stats: { rushYd: 3000 } }),
      row({ playerId: 'p-e', source: 'sleeper', stats: { rushYd: 3000 } }),
      row({ playerId: 'p-e', source: 'espn', stats: { rushYd: 3300 } }),
    ]
    const result = buildConsensusV2(projections, 2026, context({ 'p-s': 'RB', 'p-e': 'RB' }))
    const sleeperMove = points(result, 'p-s') - 300
    const espnMove = points(result, 'p-e') - 300
    expect(sleeperMove).toBeGreaterThan(0)
    expect(espnMove).toBeCloseTo(sleeperMove / 2, 6)
  })

  it('keeps median behavior for players without an FP row', () => {
    const projections = [
      row({ playerId: 'p-a', source: 'sleeper', stats: { rushYd: 2000 } }),
      row({ playerId: 'p-a', source: 'espn', stats: { rushYd: 2400 } }),
      row({ playerId: 'p-a', source: 'nflverse', stats: { rushYd: 2200 } }),
    ]
    const result = buildConsensusV2(projections, 2026, context({ 'p-a': 'RB' }))
    expect(points(result, 'p-a')).toBeCloseTo(220, 6)
    expect(result.rows[0]?.stats.rushYd).toBeCloseTo(2200, 6)
  })

  it('flags contested at the residual-spread threshold, never for single-source players', () => {
    const projections = [
      row({ playerId: 'p-torn', source: 'sleeper', stats: { rushYd: 2000 } }), // 200
      row({ playerId: 'p-torn', source: 'espn', stats: { rushYd: 2500 } }), // 250 → spread 50
      row({ playerId: 'p-calm', source: 'sleeper', stats: { rushYd: 1000 } }),
      row({ playerId: 'p-calm', source: 'espn', stats: { rushYd: 1100 } }), // spread 10
      row({ playerId: 'p-solo', source: 'sleeper', stats: { rushYd: 900 } }),
    ]
    const { signals } = buildConsensusV2(projections, 2026, context({ 'p-torn': 'RB', 'p-calm': 'RB', 'p-solo': 'RB' }))
    expect(signals.get('p-torn')).toEqual({ sourceCount: 2, residualSpread: 50, contested: true })
    expect(signals.get('p-calm')).toEqual({ sourceCount: 2, residualSpread: 10, contested: false })
    expect(signals.get('p-solo')).toEqual({ sourceCount: 1, residualSpread: null, contested: false })
  })

  it('debiases before flagging: systematic top-band heat is not contested, idiosyncratic mid-band spread is', () => {
    // 12 top RBs where ESPN runs a uniform 20% hot, plus one genuinely disputed band-2 RB.
    const projections: SeasonProjection[] = []
    const positions: Record<string, Position> = {}
    for (let i = 0; i < 12; i += 1) {
      const id: PlayerId = `p-rb-${String(i)}`
      positions[id] = 'RB'
      projections.push(row({ playerId: id, source: 'sleeper', stats: { rushYd: 3000 - 100 * i } }))
      projections.push(row({ playerId: id, source: 'espn', stats: { rushYd: (3000 - 100 * i) * 1.2 } }))
    }
    positions['p-rb-mid'] = 'RB'
    projections.push(row({ playerId: 'p-rb-mid', source: 'sleeper', stats: { rushYd: 1000 } }))
    projections.push(row({ playerId: 'p-rb-mid', source: 'espn', stats: { rushYd: 1500 } }))

    const result = buildConsensusV2(projections, 2026, context(positions))
    const top = result.signals.get('p-rb-0')
    expect(top?.residualSpread).toBeCloseTo(0, 6) // both sources land on the 330 panel median
    expect(top?.contested).toBe(false)
    expect(points(result, 'p-rb-0')).toBeCloseTo(330, 6)
    expect(result.signals.get('p-rb-mid')?.contested).toBe(true)
  })

  it('passes unknown-position players through as the plain per-stat median', () => {
    const projections = [
      row({ playerId: 'p-x', source: 'sleeper', stats: { rushYd: 1000 } }),
      row({ playerId: 'p-x', source: 'espn', stats: { rushYd: 2000 } }),
    ]
    const result = buildConsensusV2(projections, 2026, context({}))
    expect(result.rows[0]?.stats.rushYd).toBe(1500)
    expect(result.signals.get('p-x')).toEqual({ sourceCount: 2, residualSpread: null, contested: false })
  })
})
