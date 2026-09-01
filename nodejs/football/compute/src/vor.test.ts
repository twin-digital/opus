import type { LeagueSettings, Position } from '@twin-digital/football-data'
import { describe, expect, it } from 'vitest'

import { computeReplacementLevels, valueOverReplacement, type ScoredPlayer } from './vor.js'

const LINEUP: LeagueSettings['lineupSlots'] = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  FLEX: 1,
  DST: 1,
  K: 1,
  BENCH: 5,
  IR: 1,
}

let seq = 0
const scored = (position: Position, points: number): ScoredPlayer => ({
  playerId: `p-${String((seq += 1))}`,
  position,
  points,
})

/** 2-team league: seats QB 2, RB 4, WR 4, TE 2, FLEX 2. */
const pool = (): ScoredPlayer[] => [
  ...[40, 30, 20].map((p) => scored('QB', p)),
  ...[100, 90, 80, 70, 60, 55, 50].map((p) => scored('RB', p)),
  ...[52, 45, 40, 35, 30].map((p) => scored('WR', p)),
  ...[25, 22, 18].map((p) => scored('TE', p)),
]

describe('computeReplacementLevels', () => {
  it('allocates FLEX greedily to the best remaining RB/WR/TE and reads replacement off the pool', () => {
    const result = computeReplacementLevels(pool(), LINEUP, 2)
    // QB has no FLEX path: replacement is QB3 at 20.
    expect(result.rank.QB).toBe(3)
    expect(result.points.QB).toBe(20)
    // RB60 and RB55 outscore the best benched WR (WR3 40), so both FLEX seats go to RBs:
    // replacement RB is RB7 at 50, WR is WR5 at 30, TE is TE3 at 18.
    expect(result.rank.RB).toBe(7)
    expect(result.points.RB).toBe(50)
    expect(result.rank.WR).toBe(5)
    expect(result.points.WR).toBe(30)
    expect(result.rank.TE).toBe(3)
    expect(result.points.TE).toBe(18)
  })

  it('lets a strong WR class claim FLEX instead', () => {
    const players = [
      ...[100, 90, 80, 70].map((p) => scored('RB', p)),
      ...[95, 85, 75, 65, 60, 58, 25].map((p) => scored('WR', p)),
      ...[40, 30].map((p) => scored('QB', p)),
      ...[20, 15].map((p) => scored('TE', p)),
      scored('RB', 50),
    ]
    const result = computeReplacementLevels(players, LINEUP, 2)
    // WR5 (60) and WR6 (58) beat RB5 (50) for the two FLEX seats.
    expect(result.rank.WR).toBe(7)
    expect(result.rank.RB).toBe(5)
    expect(result.points.RB).toBe(50)
  })

  it('ignores K/DST and leaves a position without a replacement when the pool runs dry', () => {
    const players = [scored('K', 150), scored('QB', 40), scored('QB', 30)]
    const result = computeReplacementLevels(players, LINEUP, 2)
    expect(result.points.K).toBeUndefined()
    expect(result.points.QB).toBeUndefined() // both QBs start; nobody left to define replacement
  })
})

describe('valueOverReplacement', () => {
  it('is points minus the position replacement level, null where none exists', () => {
    const replacement = { points: { RB: 50 }, rank: { RB: 7 } }
    expect(valueOverReplacement(scored('RB', 90), replacement)).toBe(40)
    expect(valueOverReplacement(scored('WR', 90), replacement)).toBeNull()
  })
})
