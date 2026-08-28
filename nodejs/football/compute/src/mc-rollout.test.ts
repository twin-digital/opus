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
import { evaluateCandidatesMC, evaluateCandidatesMCAsync } from './mc-rollout.js'
import { resolveRoomRules, takeDistribution, type TakeCandidate } from './room-profiles.js'

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

/**
 * Two teams, snake [1, 2], one RB and one WR seat each — my picks 1 and 4, the room's 2 and 3
 * (both team 2). My pick 1 is the candidate; my pick 4 recovers whatever the sampled room left,
 * so the mean estTeamScore integrates directly over the room's take distribution.
 */
const smallState = (): { state: BoardState; byName: Map<string, Player> } => {
  const roster: [Position, string, number, number][] = [
    ['RB', 'R One', 1000, 1],
    ['WR', 'W One', 900, 2],
    ['WR', 'W Two', 800, 2.5],
    ['WR', 'W Three', 700, 3.5],
    ['RB', 'R Two', 600, 5],
    ['WR', 'W Four', 500, 6],
    ['RB', 'R Three', 400, 7],
  ]
  const players = roster.map(([position, name]) => player(position, name))
  const byName = new Map(players.map((entry) => [entry.name, entry]))
  const settings: LeagueSettings = {
    leagueId: 'test',
    name: 'MC League',
    size: 2,
    scoringRules: [{ stat: 'rushYd', points: 0.1 }],
    lineupSlots: { QB: 0, RB: 1, WR: 1, TE: 0, FLEX: 0, DST: 0, K: 0, BENCH: 0, IR: 0 },
    draft: { type: 'snake', date: null, pickOrder: [1, 2] },
  }
  return {
    byName,
    state: {
      settings,
      players,
      projections: players.map((entry, index) => projection(entry.id, (roster[index] as (typeof roster)[0])[2])),
      market: players.map((entry, index) => market(entry.id, (roster[index] as (typeof roster)[0])[3])),
      draftedPlayerIds: [],
      myDraftSlot: 1,
      season: 2026,
    },
  }
}

describe('evaluateCandidatesMC — sampling honors the take distribution', () => {
  it('matches an exact enumeration of the base room model within Monte Carlo error', () => {
    const { state, byName } = smallState()
    const candidate = byName.get('R One') as Player
    const samples = 3000
    const [evaluation] = evaluateCandidatesMC(state, { candidates: [candidate.id], samples })
    expect(evaluation).toBeDefined()

    // Oracle: enumerate team 2's picks 2 and 3 from takeDistribution (the candidate held by
    // me), then my pick 4 takes the best remaining WR: est = 100 + E[best WR left].
    const points = new Map<PlayerId, number>([...byName.values()].map((p) => [p.id, 0]))
    for (const [name, pts] of [
      ['W One', 90],
      ['W Two', 80],
      ['W Three', 70],
      ['R Two', 60],
      ['W Four', 50],
      ['R Three', 40],
    ] as const) {
      points.set((byName.get(name) as Player).id, pts)
    }
    const pool: TakeCandidate[] = state.market
      .filter((row) => row.playerId !== candidate.id)
      .map((row) => ({
        playerId: row.playerId,
        position: (state.players.find((p) => p.id === row.playerId) as Player).position,
        roomAdp: row.adp.sleeper?.half ?? null,
      }))
    const pickOrder = state.settings.draft.pickOrder
    const bestWr = (taken: Set<PlayerId>): number =>
      Math.max(
        ...pool.filter((p) => p.position === 'WR' && !taken.has(p.playerId)).map((p) => points.get(p.playerId) ?? 0),
        0,
      )
    let expected = 0
    const p2 = takeDistribution(null, pickOrder, 2, pool)
    for (const first of pool) {
      const probFirst = p2.get(first.playerId) ?? 0
      const rest = pool.filter((p) => p.playerId !== first.playerId)
      const p3 = takeDistribution(null, pickOrder, 3, rest)
      for (const second of rest) {
        const prob = probFirst * (p3.get(second.playerId) ?? 0)
        expected += prob * (100 + bestWr(new Set([first.playerId, second.playerId])))
      }
    }
    const mc = evaluation?.estTeamScore ?? 0
    const se = evaluation?.se ?? 0
    expect(Math.abs(mc - expected)).toBeLessThan(Math.max(4 * se, 0.5))
  })

  it('draws a loyalty-boosted player far more often (the est shift he causes)', () => {
    const { state, byName } = smallState()
    const candidate = byName.get('R One') as Player
    const base = evaluateCandidatesMC(state, { candidates: [candidate.id], samples: 500 })
    const profiles = resolveRoomRules(
      { teams: { 2: { sigma: null, rules: [{ kind: 'loyalty', playerName: 'R Two', strength: 1000 }] } } },
      state.players,
    )
    const loyal = evaluateCandidatesMC(state, { candidates: [candidate.id], samples: 500, profiles })
    // Loyalty pulls team 2 onto R Two with one of its picks, leaving me a better WR at pick 4:
    // est ≈ 187.2 with loyalty vs ≈ 184.0 without (measured at 20k samples). Under the
    // SIGMA_FLOOR = 4.5 room the base model already reaches R Two sometimes, so the loyalty
    // shift is ≈ 3.2 pts (it was ≈ 4.5 under the σ = 2 room this test was first calibrated on).
    expect(loyal[0]?.estTeamScore ?? 0).toBeGreaterThan((base[0]?.estTeamScore ?? 0) + 2.5)
    expect(loyal[0]?.estTeamScore ?? 0).toBeGreaterThan(184.5)
  })
})

describe('evaluateCandidatesMC — mass conservation', () => {
  it.each(['greedy', 'one-ply'] as const)(
    'every scenario removes exactly N distinct opponents picks (%s continuation)',
    (continuation) => {
      const { state, byName } = smallState()
      const candidate = byName.get('R One') as Player
      const paths: (readonly string[])[] = []
      evaluateCandidatesMC(state, {
        candidates: [candidate.id],
        samples: 200,
        continuation,
        instrument: (id, scenario, roomPicks) => {
          expect(id).toBe(candidate.id)
          expect(scenario).toBe(paths.length)
          paths.push(roomPicks)
        },
      })
      expect(paths).toHaveLength(200)
      for (const path of paths) {
        // The room owns picks 2 and 3: exactly two removals, distinct, never mine.
        expect(path).toHaveLength(2)
        expect(new Set(path).size).toBe(2)
        expect(path).not.toContain(candidate.id)
      }
    },
  )
})

describe('evaluateCandidatesMC — rejection coupling', () => {
  it('two similar candidates share room paths except where the removed player was picked', () => {
    const { state, byName } = smallState()
    const w1 = byName.get('W One') as Player
    const w2 = byName.get('W Two') as Player
    const samples = 400
    const paths = new Map<string, string[][]>([
      [w1.id, []],
      [w2.id, []],
    ])
    evaluateCandidatesMC(state, {
      candidates: [w1.id, w2.id],
      samples,
      continuation: 'greedy',
      instrument: (id, scenario, roomPicks) => {
        void scenario
        paths.get(id)?.push([...roomPicks])
      },
    })
    let coupled = 0
    let identical = 0
    for (let scenario = 0; scenario < samples; scenario += 1) {
      const pathA = (paths.get(w1.id) as string[][])[scenario] as string[] // W One removed
      const pathB = (paths.get(w2.id) as string[][])[scenario] as string[] // W Two removed
      let ok = true
      let same = true
      for (let i = 0; i < Math.max(pathA.length, pathB.length); i += 1) {
        if (pathA[i] === pathB[i]) {
          continue
        }
        same = false
        // A divergent slot must involve one arm picking the other arm's removed player.
        if (pathA[i] !== w2.id && pathB[i] !== w1.id) {
          ok = false
        }
      }
      coupled += ok ? 1 : 0
      identical += same ? 1 : 0
    }
    // Maximal coupling: nearly every scenario differs only at the removed player's slot.
    expect(coupled / samples).toBeGreaterThan(0.9)
    // And the paths genuinely vary: some identical (room wanted neither), some divergent.
    expect(identical).toBeGreaterThan(0)
    expect(identical).toBeLessThan(samples)
  })
})

describe('evaluateCandidatesMC — CRN and determinism', () => {
  it('same seed → identical results; different seed → different draws', () => {
    const { state } = smallState()
    const a = evaluateCandidatesMC(state, { samples: 100, seed: 42 })
    const b = evaluateCandidatesMC(state, { samples: 100, seed: 42 })
    expect(b).toEqual(a)
    const c = evaluateCandidatesMC(state, { samples: 100, seed: 43 })
    expect(c.map((row) => row.estTeamScore)).not.toEqual(a.map((row) => row.estTeamScore))
  })

  it('CRN pairing keeps delta noise under independent-sampling noise', () => {
    const { state } = smallState()
    const evaluations = evaluateCandidatesMC(state, { samples: 400 })
    const best = evaluations[0]
    for (const row of evaluations.slice(1)) {
      const independent = Math.sqrt(row.se ** 2 + (best?.se ?? 0) ** 2)
      expect(row.deltaSe).toBeLessThan(Math.max(independent, 1e-9) * 1.05)
    }
  })

  it('the async driver returns exactly the sync result', async () => {
    const { state } = smallState()
    const sync = evaluateCandidatesMC(state, { samples: 60, seed: 7 })
    const async = await evaluateCandidatesMCAsync(state, { samples: 60, seed: 7 })
    expect(async).toEqual(sync)
  })
})

describe('evaluateCandidatesMC — report shape', () => {
  it('sorts by mean est, anchors deltas at best, and bounds pBest/se', () => {
    const { state } = smallState()
    const evaluations = evaluateCandidatesMC(state, { samples: 200 })
    expect(evaluations.length).toBeGreaterThan(1)
    expect(evaluations[0]?.deltaVsBest).toBe(0)
    for (let i = 1; i < evaluations.length; i += 1) {
      const row = evaluations[i]
      expect(row?.estTeamScore).toBeLessThanOrEqual(evaluations[i - 1]?.estTeamScore ?? 0)
      expect(row?.deltaVsBest).toBeCloseTo((row?.estTeamScore ?? 0) - (evaluations[0]?.estTeamScore ?? 0), 9)
    }
    for (const row of evaluations) {
      expect(row.pBest).toBeGreaterThanOrEqual(0)
      expect(row.pBest).toBeLessThanOrEqual(1)
      expect(row.se).toBeGreaterThanOrEqual(0)
      expect(row.samples).toBe(200)
      expect(row.landsOn).toBeDefined()
    }
    // Tie-splitting makes pBest a distribution: the winner shares sum to exactly 1.
    const winners = evaluations.reduce((sum, row) => sum + row.pBest, 0)
    expect(winners).toBeCloseTo(1, 9)
  })

  it('splits exact ties 1/m and reports the tie cardinality', () => {
    const { state, byName } = smallState()
    const r1 = byName.get('R One') as Player
    const w1 = byName.get('W One') as Player
    const w2 = byName.get('W Two') as Player
    const r2 = byName.get('R Two') as Player
    const r3 = byName.get('R Three') as Player
    // Roster settled (no picks left): R Two and R Three both ride the bench behind R One —
    // bit-identical totals in every scenario.
    const drafted: BoardState = {
      ...state,
      draftedPlayerIds: [r1.id, w1.id, w2.id],
      myDraftedPlayerIds: [r1.id],
    }
    const evaluations = evaluateCandidatesMC(drafted, { candidates: [r2.id, r3.id], samples: 20 })
    expect(evaluations).toHaveLength(2)
    for (const row of evaluations) {
      expect(row.pBest).toBeCloseTo(0.5, 9)
      expect(row.exactTies).toBe(2)
      expect(row.deltaVsBest).toBe(0)
    }
  })

  it('anchors deltaVsRef on the top-VOR candidate, independent of the estimates', () => {
    const { state } = smallState()
    const evaluations = evaluateCandidatesMC(state, { samples: 100 })
    const byVor = [...evaluations].sort(
      (a, b) => (b.vor ?? Number.NEGATIVE_INFINITY) - (a.vor ?? Number.NEGATIVE_INFINITY),
    )
    const reference = byVor[0]
    expect(reference?.deltaVsRef).toBe(0)
    for (const row of evaluations) {
      expect(row.deltaVsRef).toBeCloseTo(row.estTeamScore - (reference?.estTeamScore ?? 0), 9)
    }
  })

  it('handles a board with no future picks of mine (roster already settled)', () => {
    const { state, byName } = smallState()
    const r1 = byName.get('R One') as Player
    const w1 = byName.get('W One') as Player
    const w2 = byName.get('W Two') as Player
    const r2 = byName.get('R Two') as Player
    const drafted: BoardState = {
      ...state,
      draftedPlayerIds: [r1.id, w1.id, w2.id],
      myDraftedPlayerIds: [r1.id],
    }
    const evaluations = evaluateCandidatesMC(drafted, { candidates: [r2.id], samples: 10 })
    // Pick 4 (mine) is on the clock; no picks follow, so est is exact: R One starts (100),
    // R Two rides the bench, and the open WR seat scores replacement level (W Three, 70).
    expect(evaluations[0]?.estTeamScore).toBeCloseTo(170, 6)
    expect(evaluations[0]?.se).toBe(0)
    expect(evaluations[0]?.pBest).toBe(1)
    expect(evaluations[0]?.landsOn).toBe('BENCH')
  })
})
