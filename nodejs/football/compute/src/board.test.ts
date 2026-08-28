import type { LeagueSettings, Player, PlayerId, Position, SeasonProjection, StatKey } from '@twin-digital/football-data'
import { describe, expect, it } from 'vitest'

import { board, pickAdp, type BoardState } from './board.js'

const SETTINGS: LeagueSettings = {
  leagueId: 'test',
  name: 'Fixture League',
  size: 2,
  scoringRules: [
    { stat: 'rushYd', points: 0.1 },
    { stat: 'recYd', points: 0.1 },
    { stat: 'rec', points: 0.5 },
    { stat: 'passYd', points: 0.04 },
  ],
  lineupSlots: { QB: 1, RB: 1, WR: 1, TE: 0, FLEX: 1, DST: 0, K: 1, BENCH: 2, IR: 0 },
  draft: { type: 'snake', date: null, pickOrder: [1, 2] },
}

let seq = 0
const player = (position: Position, name: string): Player => ({
  id: `p-${String((seq += 1))}`,
  name,
  position,
  team: 'DET',
  byeWeek: 8,
  age: null,
  yearsExp: null,
  injuryStatus: 'ACTIVE',
})

const projection = (playerId: PlayerId, stats: Partial<Record<StatKey, number>>): SeasonProjection => ({
  playerId,
  source: 'sleeper',
  season: 2026,
  gamesPlayed: 17,
  stats,
  prescored: {},
})

const state = (): { state: BoardState; players: Record<string, Player> } => {
  const rb1 = player('RB', 'Elite RB')
  const rb2 = player('RB', 'Good RB')
  const rb3 = player('RB', 'Flex RB')
  const rb4 = player('RB', 'Replacement RB')
  const wr1 = player('WR', 'Elite WR')
  const wr2 = player('WR', 'Good WR')
  const wr3 = player('WR', 'Flex WR')
  const wr4 = player('WR', 'Replacement WR')
  const qb1 = player('QB', 'QB One')
  const qb2 = player('QB', 'QB Two')
  const qb3 = player('QB', 'QB Three')
  const k1 = player('K', 'The Kicker')
  return {
    players: { rb1, rb2, rb3, rb4, wr1, wr2, wr3, wr4, qb1, qb2, qb3, k1 },
    state: {
      settings: SETTINGS,
      players: [rb1, rb2, rb3, rb4, wr1, wr2, wr3, wr4, qb1, qb2, qb3, k1],
      projections: [
        projection(rb1.id, { rushYd: 2100 }), // 210 pts
        projection(rb2.id, { rushYd: 1500 }), // 150 pts
        projection(rb3.id, { rushYd: 950 }), // 95 pts
        projection(rb4.id, { rushYd: 600 }), // 60 pts
        projection(wr1.id, { recYd: 1500, rec: 110 }), // 205 pts
        projection(wr2.id, { recYd: 1000, rec: 82 }), // 141 pts
        projection(wr3.id, { recYd: 600, rec: 60 }), // 90 pts
        projection(wr4.id, { recYd: 400, rec: 20 }), // 50 pts
        projection(qb1.id, { passYd: 5000 }), // 200 pts
        projection(qb2.id, { passYd: 4100 }), // 164 pts
        projection(qb3.id, { passYd: 3000 }), // 120 pts
      ],
      market: [
        {
          playerId: rb1.id,
          adp: { sleeper: { half: 1.5 } },
          ecr: { rank: 2, posRank: 'RB1', tier: 1, best: 1, worst: 4, stdDev: 1.5 },
          percentRostered: null,
          asOf: 'now',
        },
        {
          playerId: k1.id,
          adp: { sleeper: { half: 30 }, espn: { ppr: 40 } },
          ecr: null,
          percentRostered: null,
          asOf: 'now',
        },
      ],
      draftedPlayerIds: [],
      myDraftSlot: 2,
      season: 2026,
    },
  }
}

describe('board', () => {
  it('ranks by VOR descending with market-only players trailing by ADP', () => {
    const result = board(state().state)
    // Seats: QB 2, RB 2, WR 2, FLEX 2. Both FLEX seats go greedily to Flex RB (95) and
    // Flex WR (90), so replacement emerges at QB3/120, RB4/60, WR4/50.
    expect(result.replacement.points).toEqual({ QB: 120, RB: 60, WR: 50 })
    expect(result.replacement.rank).toEqual({ QB: 3, RB: 4, WR: 4 })
    // VOR: WR1 155, RB1 150, WR2 91, RB2 90, QB1 80, QB2 44, WR3 40, RB3 35, then zeros.
    expect(result.rows.map((row) => row.name)).toEqual([
      'Elite WR',
      'Elite RB',
      'Good WR',
      'Good RB',
      'QB One',
      'QB Two',
      'Flex WR',
      'Flex RB',
      'Replacement RB',
      'Replacement WR',
      'QB Three',
      'The Kicker',
    ])
    expect(result.rows.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    const kicker = result.rows.at(-1)
    expect(kicker?.points).toBeNull()
    expect(kicker?.vor).toBeNull()
    expect(kicker?.adp).toBe(30)
  })

  it('filters drafted players and by position without disturbing valuations', () => {
    const fixture = state()
    fixture.state.draftedPlayerIds = [fixture.players.rb1?.id as PlayerId]
    const result = board(fixture.state, { position: 'RB' })
    expect(result.rows.map((row) => row.name)).toEqual(['Good RB', 'Flex RB', 'Replacement RB'])
    expect(result.currentOverall).toBe(2)
    // Slot 2 of 2: picks 2 and 3 are both mine (the turn).
    expect(result.myNextPicks).toEqual([2, 3])
    // Valuations unchanged by the removal: replacement is still read off the full pool.
    expect(result.replacement.points.RB).toBe(60)
  })

  it('computes make-it-back odds only where ADP exists', () => {
    const result = board(state().state)
    const eliteRb = result.rows.find((row) => row.name === 'Elite RB')
    expect(eliteRb?.pNextPick).toBeGreaterThan(0)
    expect(eliteRb?.pNextPick).toBeLessThan(1)
    expect(result.rows.find((row) => row.name === 'QB One')?.pNextPick).toBeNull()
  })

  it('assigns tiers per position from our points, none for market-only positions', () => {
    const result = board(state().state)
    const rbTiers = result.rows.filter((row) => row.position === 'RB').map((row) => row.tier)
    expect(rbTiers.every((tier) => tier !== null)).toBe(true)
    expect(result.rows.find((row) => row.position === 'K')?.tier).toBeNull()
  })

  it('returns the consensus rows for the caller to persist', () => {
    const fixture = state()
    const result = board(fixture.state)
    expect(result.consensus).toHaveLength(11)
    expect(result.consensus.every((row) => row.source === 'consensus')).toBe(true)
  })

  it('carries room pricing and upside on rows', () => {
    const result = board(state().state)
    const eliteRb = result.rows.find((row) => row.name === 'Elite RB')
    expect(eliteRb?.roomAdp).toBe(1.5) // no ESPN price → Sleeper half fallback
    expect(eliteRb?.roomDelta).toBeNull()
    expect(eliteRb?.upsideScore).not.toBeNull()
    const kicker = result.rows.find((row) => row.name === 'The Kicker')
    expect(kicker?.roomAdp).toBe(40) // ESPN preferred
    expect(kicker?.roomDelta).toBe(10) // espn 40 − sleeper 30: the room lets him fall
    const qb = result.rows.find((row) => row.name === 'QB One')
    expect(qb?.roomAdp).toBeNull()
    expect(qb?.upsideScore).toBeNull()
  })

  it('carries source-disagreement signals on rows', () => {
    const fixture = state()
    const rb2 = fixture.players.rb2 as Player
    // Second source for Good RB, 50 pts apart → contested; everyone else stays single-source.
    fixture.state.projections.push({ ...projection(rb2.id, { rushYd: 2500 }), source: 'espn' })
    const result = board(fixture.state)
    const contested = result.rows.find((row) => row.name === 'Good RB')
    expect(contested?.sourceCount).toBe(2)
    expect(contested?.residualSpread).toBe(100)
    expect(contested?.contested).toBe(true)
    const solo = result.rows.find((row) => row.name === 'Elite RB')
    expect(solo?.sourceCount).toBe(1)
    expect(solo?.residualSpread).toBeNull()
    expect(solo?.contested).toBe(false)
    const kicker = result.rows.find((row) => row.name === 'The Kicker')
    expect(kicker?.sourceCount).toBe(0)
  })

  it('computes benchmarks and the capture-so-far grade', () => {
    const fixture = state()
    // Ceiling: QB 200 + RB 210 + WR 205 + FLEX (Good RB 150). Replacement team: 120+60+50+60.
    const empty = board(fixture.state)
    expect(empty.benchmarks).toEqual({ ceiling: 765, replacement: 290 })
    expect(empty.captureRatio).toBe(0)

    fixture.state.draftedPlayerIds = [fixture.players.rb1?.id as PlayerId]
    fixture.state.myDraftedPlayerIds = [fixture.players.rb1?.id as PlayerId]
    const drafted = board(fixture.state)
    expect(drafted.benchmarks).toEqual({ ceiling: 765, replacement: 290 }) // stable as the draft runs
    // My starters so far: RB 210 + open seats at replacement (120 + 50 + 60) = 440.
    expect(drafted.captureRatio).toBeCloseTo((440 - 290) / (765 - 290), 6)
  })

  it('applies overrides: boosts reprice, bans stay visible but flagged', () => {
    const fixture = state()
    const result = board(fixture.state, {
      overrides: [
        { playerId: fixture.players.rb2?.id as PlayerId, action: 'boost', points: 100 },
        { playerId: fixture.players.wr1?.id as PlayerId, action: 'ban' },
      ],
    })
    const rb2 = result.rows.find((row) => row.name === 'Good RB')
    expect(rb2?.points).toBe(250)
    expect(result.rows[0]?.name).toBe('Good RB') // boost flows into VOR and the sort
    const wr1 = result.rows.find((row) => row.name === 'Elite WR')
    expect(wr1?.banned).toBe(true)
    expect(wr1?.points).toBe(205) // still fully priced as data
    expect(result.rows.filter((row) => row.banned)).toHaveLength(1)
  })
})

describe('pickAdp', () => {
  it('prefers half-PPR, then PPR, sleeper before espn', () => {
    expect(pickAdp({ sleeper: { half: 12, ppr: 10 }, espn: { ppr: 8 } })).toBe(12)
    expect(pickAdp({ sleeper: { ppr: 10 }, espn: { ppr: 8 } })).toBe(10)
    expect(pickAdp({ espn: { ppr: 8 } })).toBe(8)
    expect(pickAdp({})).toBeNull()
    expect(pickAdp(undefined)).toBeNull()
  })
})
