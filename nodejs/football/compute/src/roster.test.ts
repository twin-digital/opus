import type { LineupSlot, PlayerId, Position } from '@twin-digital/football-data'
import { describe, expect, it } from 'vitest'

import { bestLineup, buildRoster, lineupTotalWithReplacement, type LineupPlayer } from './roster.js'

const LINEUP: Record<LineupSlot, number> = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BENCH: 5, IR: 1 }

let seq = 0
const lp = (position: Position, points: number | null): LineupPlayer => ({
  playerId: `p-${String((seq += 1))}`,
  position,
  points,
})

describe('bestLineup', () => {
  it('starts the best players regardless of draft order, flexing the best leftover', () => {
    const rb1 = lp('RB', 120)
    const rb2 = lp('RB', 150) // drafted later, still starts
    const rb3 = lp('RB', 110)
    const wr1 = lp('WR', 140)
    const wr2 = lp('WR', 90)
    const wr3 = lp('WR', 100)
    const lineup = bestLineup([rb1, rb2, rb3, wr1, wr2, wr3], LINEUP)
    expect(lineup.slotByPlayer.get(rb2.playerId)).toBe('RB')
    expect(lineup.slotByPlayer.get(rb1.playerId)).toBe('RB')
    expect(lineup.slotByPlayer.get(rb3.playerId)).toBe('FLEX') // 110 beats WR3's 100 for the flex
    expect(lineup.slotByPlayer.get(wr3.playerId)).toBe('WR')
    expect(lineup.slotByPlayer.get(wr2.playerId)).toBe('BENCH')
    expect(lineup.total).toBe(150 + 120 + 110 + 140 + 100)
  })

  it('fills K/DST seats without adding to the total', () => {
    const k = lp('K', null)
    const lineup = bestLineup([k, lp('QB', 200)], LINEUP)
    expect(lineup.slotByPlayer.get(k.playerId)).toBe('K')
    expect(lineup.total).toBe(200)
  })
})

describe('lineupTotalWithReplacement', () => {
  const replacement = { QB: 120, RB: 60, WR: 50, TE: 40 } as const

  it('values open skill seats at replacement, FLEX at the best eligible level', () => {
    // Empty roster = the all-replacement team: QB + 2 RB + 2 WR + TE + FLEX(best of RB/WR/TE).
    expect(lineupTotalWithReplacement([], LINEUP, replacement)).toBe(120 + 2 * 60 + 2 * 50 + 40 + 60)
  })

  it('counts rostered starters at their points and leaves K/DST seats out', () => {
    const total = lineupTotalWithReplacement([lp('RB', 150), lp('K', null)], LINEUP, replacement)
    expect(total).toBe(120 + (150 + 60) + 2 * 50 + 40 + 60)
  })
})

describe('buildRoster (moved from web)', () => {
  it('fills dedicated slots in draft order, spills to FLEX then BENCH', () => {
    const players = [
      { playerId: 'p-a' as PlayerId, name: 'A', position: 'RB' as Position, team: null, byeWeek: null },
      { playerId: 'p-b' as PlayerId, name: 'B', position: 'RB' as Position, team: null, byeWeek: null },
      { playerId: 'p-c' as PlayerId, name: 'C', position: 'RB' as Position, team: null, byeWeek: null },
      { playerId: 'p-d' as PlayerId, name: 'D', position: 'RB' as Position, team: null, byeWeek: null },
    ]
    const roster = buildRoster(players, LINEUP)
    const bySlot = new Map(roster.slots.map((slot) => [slot.slot, slot]))
    expect(bySlot.get('RB')?.players.map((p) => p.name)).toEqual(['A', 'B'])
    expect(bySlot.get('FLEX')?.players.map((p) => p.name)).toEqual(['C'])
    expect(bySlot.get('BENCH')?.players.map((p) => p.name)).toEqual(['D'])
  })
})
