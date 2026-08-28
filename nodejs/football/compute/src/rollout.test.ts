import type {
  LeagueSettings,
  MarketData,
  Player,
  PlayerId,
  Position,
  SeasonProjection,
} from '@twin-digital/football-data'
import { describe, expect, it } from 'vitest'

import type { BoardState } from './board.js'
import {
  captureRatio,
  chooseForRoster,
  computeBenchmarks,
  evaluateCandidates,
  rolloutFrom,
  simulateRoomSegment,
  type RolloutPlayer,
} from './rollout.js'

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

const projection = (playerId: PlayerId, rushYd: number): SeasonProjection => ({
  playerId,
  source: 'sleeper',
  season: 2026,
  gamesPlayed: 17,
  stats: { rushYd },
  prescored: {},
})

const market = (playerId: PlayerId, half: number): MarketData => ({
  playerId,
  adp: { sleeper: { half } },
  ecr: null,
  percentRostered: null,
  asOf: 'now',
})

const rolloutPlayer = (overrides: Partial<RolloutPlayer> & { playerId: string }): RolloutPlayer => ({
  name: overrides.playerId,
  position: 'RB',
  points: null,
  roomAdp: null,
  vor: null,
  upsideScore: null,
  ...overrides,
  playerId: overrides.playerId,
})

/**
 * The ideas-doc cliff: two teams, one RB and one WR seat each, my picks 1 and 4, the room picks
 * 2 and 3. A (RB 100) beats B (WR 90) by 10 now, but by pick 4 RB has dropped 3 (A3 97) while
 * WR has dropped 25 (B2 65) — taking B first wins the sequence by 22.
 */
const cliffState = (): { state: BoardState; A: Player; B: Player; A3: Player; B2: Player } => {
  const A = player('RB', 'RB Now')
  const A2 = player('RB', 'RB Also Elite')
  const A3 = player('RB', 'RB Small Drop')
  const A4 = player('RB', 'RB Deep')
  const B = player('WR', 'WR Now')
  const B2 = player('WR', 'WR Cliff Bottom')
  const B3 = player('WR', 'WR Deep')
  const settings: LeagueSettings = {
    leagueId: 'test',
    name: 'Cliff League',
    size: 2,
    scoringRules: [{ stat: 'rushYd', points: 0.1 }],
    lineupSlots: { QB: 0, RB: 1, WR: 1, TE: 0, FLEX: 0, DST: 0, K: 0, BENCH: 0, IR: 0 },
    draft: { type: 'snake', date: null, pickOrder: [1, 2] },
  }
  return {
    A,
    B,
    A3,
    B2,
    state: {
      settings,
      players: [A, A2, A3, A4, B, B2, B3],
      projections: [
        projection(A.id, 1000), // 100
        projection(A2.id, 990), // 99
        projection(A3.id, 970), // 97
        projection(A4.id, 600), // 60
        projection(B.id, 900), // 90
        projection(B2.id, 650), // 65
        projection(B3.id, 500), // 50
      ],
      market: [
        market(A.id, 1.5),
        market(B.id, 2),
        market(A2.id, 3),
        market(A3.id, 3.5),
        market(B2.id, 5),
        market(A4.id, 6),
        market(B3.id, 7),
      ],
      draftedPlayerIds: [],
      myDraftSlot: 1,
      season: 2026,
    },
  }
}

describe('evaluateCandidates — the cliff', () => {
  it('ranks the shallow-cliff pick ~22 points above the higher-VOR one', () => {
    const { state, A, B } = cliffState()
    const evaluations = evaluateCandidates(state)
    const evalA = evaluations.find((entry) => entry.playerId === A.id)
    const evalB = evaluations.find((entry) => entry.playerId === B.id)
    expect((evalA?.points as number) - (evalB?.points as number)).toBeCloseTo(10, 6) // A wins "now"
    // Take A: room eats B and A2; my pick 4 is B2 → 100 + 65. Take B: room eats A and A2;
    // my pick 4 is A3 → 90 + 97. The sequence flips by 22.
    expect(evalB?.estTeamScore).toBeCloseTo(187, 6)
    expect(evalA?.estTeamScore).toBeCloseTo(165, 6)
    expect((evalB?.estTeamScore as number) - (evalA?.estTeamScore as number)).toBeCloseTo(22, 6)
    expect(evaluations[0]?.playerId).toBe(B.id)
    expect(evaluations[0]?.deltaVsBest).toBe(0)
    expect(evalA?.deltaVsBest).toBeCloseTo(-22, 6)
    expect(evalA?.landsOn).toBe('RB')
    expect(evalB?.landsOn).toBe('WR')
  })

  it('excludes banned players from the slate; boosts move est team scores', () => {
    const { state, A, B } = cliffState()
    const banned = evaluateCandidates(state, { overrides: [{ playerId: B.id, action: 'ban' }] })
    expect(banned.some((entry) => entry.playerId === B.id)).toBe(false)
    expect(banned.some((entry) => entry.playerId === A.id)).toBe(true)

    const boosted = evaluateCandidates(state, { overrides: [{ playerId: A.id, action: 'boost', points: 50 }] })
    const evalA = boosted.find((entry) => entry.playerId === A.id)
    // +50 on A lifts his own rollout by 50 (his seat) → 215; he overtakes B.
    expect(evalA?.estTeamScore).toBeCloseTo(215, 6)
    expect(boosted[0]?.playerId).toBe(A.id)
  })

  it('honors an explicit candidate slate', () => {
    const { state, A } = cliffState()
    const evaluations = evaluateCandidates(state, { candidates: [A.id] })
    expect(evaluations.map((entry) => entry.playerId)).toEqual([A.id])
  })
})

describe('benchmarks and captureRatio', () => {
  it('computes ceiling and all-replacement totals from the pool', () => {
    const { state } = cliffState()
    const benchmarks = computeBenchmarks(state)
    // Ceiling: best RB 100 + best WR 90. Replacement: RB3 (97) + WR3 (50) — league seats are
    // 2 per position, so replacement is the third-best at each.
    expect(benchmarks.ceiling).toBeCloseTo(190, 6)
    expect(benchmarks.replacement).toBeCloseTo(147, 6)
    expect(captureRatio(190, benchmarks)).toBeCloseTo(1, 6)
    expect(captureRatio(147, benchmarks)).toBeCloseTo(0, 6)
    expect(captureRatio(100, { ceiling: 100, replacement: 100 })).toBe(0)
  })
})

describe('simulateRoomSegment', () => {
  const pool = [
    rolloutPlayer({ playerId: 'p-a', roomAdp: 3 }),
    rolloutPlayer({ playerId: 'p-b', roomAdp: 1 }),
    rolloutPlayer({ playerId: 'p-c', roomAdp: null, points: 50 }),
    rolloutPlayer({ playerId: 'p-d', roomAdp: 2 }),
  ]

  it('removes toPick − fromPick players in roomAdp order, nulls last', () => {
    const remaining = simulateRoomSegment(pool, 5, 7)
    expect(remaining.map((p) => p.playerId)).toEqual(['p-a', 'p-c'])
    expect(simulateRoomSegment(pool, 5, 5)).toEqual(pool)
  })

  it('skips players I hold', () => {
    const remaining = simulateRoomSegment(pool, 5, 7, new Set(['p-d']))
    expect(remaining.map((p) => p.playerId)).toEqual(['p-c', 'p-d'])
  })
})

describe('chooseForRoster', () => {
  const lineupSlots = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BENCH: 5, IR: 0 }
  const replacementPoints = { QB: 170, RB: 60, WR: 50, TE: 40 }

  it('prefers the position with the larger gain over replacement, not raw points', () => {
    const available = [
      rolloutPlayer({ playerId: 'p-qb', position: 'QB', points: 180 }),
      rolloutPlayer({ playerId: 'p-rb', position: 'RB', points: 150 }),
    ]
    const choice = chooseForRoster(available, { players: [], lineupSlots, replacementPoints }, new Map())
    expect(choice?.playerId).toBe('p-rb') // +90 over RB replacement beats +10 over QB's
  })

  it('caps positions: a second backup QB/TE is never taken', () => {
    const roster = [
      rolloutPlayer({ playerId: 'p-t1', position: 'TE', points: 120 }),
      rolloutPlayer({ playerId: 'p-t2', position: 'TE', points: 110 }),
    ]
    const available = [
      rolloutPlayer({ playerId: 'p-t3', position: 'TE', points: 200 }),
      rolloutPlayer({ playerId: 'p-w1', position: 'WR', points: 55 }),
    ]
    const choice = chooseForRoster(available, { players: roster, lineupSlots, replacementPoints }, new Map())
    expect(choice?.playerId).toBe('p-w1') // TE at cap (starters+1), even for a 200-pt TE
  })

  it('falls back to upside once no starting seat improves on replacement', () => {
    const roster = [
      rolloutPlayer({ playerId: 'p-q', position: 'QB', points: 200 }),
      rolloutPlayer({ playerId: 'p-r1', position: 'RB', points: 150 }),
      rolloutPlayer({ playerId: 'p-r2', position: 'RB', points: 140 }),
      rolloutPlayer({ playerId: 'p-w1', position: 'WR', points: 130 }),
      rolloutPlayer({ playerId: 'p-w2', position: 'WR', points: 120 }),
      rolloutPlayer({ playerId: 'p-te', position: 'TE', points: 100 }),
      rolloutPlayer({ playerId: 'p-fx', position: 'RB', points: 110 }),
    ]
    const available = [
      rolloutPlayer({ playerId: 'p-mean', position: 'WR', points: 49 }),
      rolloutPlayer({ playerId: 'p-lottery', position: 'WR', points: 45 }),
    ]
    const upside = new Map<PlayerId, number>([
      ['p-mean', 10],
      ['p-lottery', 80],
    ])
    const choice = chooseForRoster(available, { players: roster, lineupSlots, replacementPoints }, upside)
    expect(choice?.playerId).toBe('p-lottery')
  })

  it('returns null when nothing is available', () => {
    expect(chooseForRoster([], { players: [], lineupSlots, replacementPoints }, new Map())).toBeNull()
  })
})

describe('rolloutFrom — anti-hoarding', () => {
  it('never hoards a position past its cap and keeps WR2 above replacement', () => {
    // A TE-glut pool: six startable TEs whose VOR dwarfs the WRs'. Pure VOR-greedy benching
    // hoards them; the need-aware chooser must stop at TE2 and still field real WRs.
    const players: Player[] = []
    const projections: SeasonProjection[] = []
    const marketRows: MarketData[] = []
    const add = (position: Position, name: string, points: number, adp: number): Player => {
      const p = player(position, name)
      players.push(p)
      projections.push(projection(p.id, points * 10))
      marketRows.push(market(p.id, adp))
      return p
    }
    let adp = 1
    for (let i = 0; i < 6; i += 1) {
      add('TE', `TE ${String(i + 1)}`, 200 - 5 * i, adp++)
    }
    for (let i = 0; i < 12; i += 1) {
      add('RB', `RB ${String(i + 1)}`, 160 - 10 * i, adp++)
    }
    for (let i = 0; i < 12; i += 1) {
      add('WR', `WR ${String(i + 1)}`, 150 - 10 * i, adp++)
    }
    for (let i = 0; i < 4; i += 1) {
      add('QB', `QB ${String(i + 1)}`, 300 - 15 * i, adp++)
    }
    const settings: LeagueSettings = {
      leagueId: 'test',
      name: 'Hoard League',
      size: 2,
      scoringRules: [{ stat: 'rushYd', points: 0.1 }],
      lineupSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 0, K: 0, BENCH: 5, IR: 0 },
      draft: { type: 'snake', date: null, pickOrder: [1, 2] },
    }
    const state: BoardState = {
      settings,
      players,
      projections,
      market: marketRows,
      draftedPlayerIds: [],
      myDraftSlot: 1,
      season: 2026,
    }

    const result = rolloutFrom(state, [], 1)
    expect(result.finalRoster).toHaveLength(12)
    const counts = new Map<Position, number>()
    for (const rostered of result.finalRoster) {
      counts.set(rostered.position, (counts.get(rostered.position) ?? 0) + 1)
    }
    expect(counts.get('TE') ?? 0).toBeLessThanOrEqual(2)
    expect(counts.get('QB') ?? 0).toBeLessThanOrEqual(2)
    const myWrs = result.finalRoster
      .filter((rostered) => rostered.position === 'WR')
      .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    expect(myWrs.length).toBeGreaterThanOrEqual(2)
    // League WR seats = 2×2 + flexes; replacement is well under 120 here.
    expect(myWrs[1]?.points ?? 0).toBeGreaterThan(100)
    expect(result.starterTotal).toBeGreaterThan(0)
    expect(result.captureRatio).toBeGreaterThan(0)
    expect(result.captureRatio).toBeLessThanOrEqual(1)
  })
})
