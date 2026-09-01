import { describe, expect, it } from 'vitest'

import type { LineupSlot, PlayerId, Position } from '@twin-digital/football-data'

import { buildRoster, type RosterPlayer } from './roster.js'

const LINEUP: Record<LineupSlot, number> = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BENCH: 5, IR: 1 }

let seq = 0
const rp = (name: string, position: Position, byeWeek: number | null = null): RosterPlayer => ({
  playerId: `p-${String((seq += 1))}`,
  name,
  position,
  team: 'DET',
  byeWeek,
})

describe('buildRoster', () => {
  it('fills dedicated slots, spills to FLEX, then BENCH, in draft order', () => {
    const roster = buildRoster(
      [rp('RB One', 'RB'), rp('RB Two', 'RB'), rp('RB Three', 'RB'), rp('RB Four', 'RB'), rp('QB One', 'QB')],
      LINEUP,
    )
    const bySlot = new Map(roster.slots.map((slot) => [slot.slot, slot]))
    expect(bySlot.get('RB')?.players.map((p) => p.name)).toEqual(['RB One', 'RB Two'])
    expect(bySlot.get('FLEX')?.players.map((p) => p.name)).toEqual(['RB Three'])
    expect(bySlot.get('BENCH')?.players.map((p) => p.name)).toEqual(['RB Four'])
    expect(bySlot.get('QB')?.players.map((p) => p.name)).toEqual(['QB One'])
    // 9 starting seats, 4 filled (QB, RB x2, FLEX)
    expect(roster.openStarters).toBe(5)
    expect(roster.totalOpen).toBe(5 + 4)
  })

  it('does not spill K/DST into FLEX', () => {
    const roster = buildRoster([rp('K One', 'K'), rp('K Two', 'K')], LINEUP)
    const bySlot = new Map(roster.slots.map((slot) => [slot.slot, slot]))
    expect(bySlot.get('K')?.players).toHaveLength(1)
    expect(bySlot.get('FLEX')?.players).toHaveLength(0)
    expect(bySlot.get('BENCH')?.players.map((p) => p.name)).toEqual(['K Two'])
  })

  it('flags bye-week collisions', () => {
    const roster = buildRoster([rp('A', 'RB', 8), rp('B', 'WR', 8), rp('C', 'QB', 10), rp('D', 'TE', null)], LINEUP)
    expect(roster.byeCollisions).toEqual([{ byeWeek: 8, players: ['A (RB)', 'B (WR)'] }])
  })
})
