import type { PlayerId, Position } from '@twin-digital/football-data'
import { describe, expect, it } from 'vitest'

import type { RolloutPlayer } from '../rollout.js'

import { chooseForRoster } from './marginal.js'
import { projectionFitness, realizedFitness, sampleRealizedPoints } from './fitness.js'
import { adpPolicy, argmaxPolicy, forcedKdstPick, marginalPolicy, noisyAdpPolicy } from './policies.js'
import { hashSeed, makeRng } from './rng.js'
import { marginalScorer, pointsScorer, rolloutScorer, vorScorer } from './scorers.js'
import {
  applyPick,
  availablePlayers,
  currentOverall,
  isComplete,
  makeDraftState,
  makeSimPool,
  rosterIdsOf,
  rosterOf,
  runDraft,
  snakePickOrder,
  teamOnClock,
  type SimPool,
} from './state.js'
import { tournament } from './tournament.js'

const mkPlayer = (
  id: string,
  position: Position,
  points: number | null,
  roomAdp: number | null,
  vor: number | null = null,
  upsideScore: number | null = null,
): RolloutPlayer => ({ playerId: id as PlayerId, name: id, position, points, roomAdp, vor, upsideScore })

/** 2-team, 3-round league: QB1/RB1/WR1, no K/DST, no bench. */
const skillLineup = { QB: 1, RB: 1, WR: 1, TE: 0, FLEX: 0, DST: 0, K: 0, BENCH: 0, IR: 0 }

const skillPool = (): SimPool =>
  makeSimPool({
    players: [
      mkPlayer('p-qb1', 'QB', 300, 5, 60),
      mkPlayer('p-qb2', 'QB', 280, 6, 40),
      mkPlayer('p-rb1', 'RB', 200, 1, 120),
      mkPlayer('p-rb2', 'RB', 180, 2, 100),
      mkPlayer('p-rb3', 'RB', 100, 7, 20),
      mkPlayer('p-wr1', 'WR', 190, 3, 110),
      mkPlayer('p-wr2', 'WR', 170, 4, 90),
      mkPlayer('p-wr3', 'WR', 90, 8, 10),
    ],
    teams: 2,
    rounds: 3,
    lineupSlots: skillLineup,
    replacementPoints: { QB: 240, RB: 80, WR: 80 },
    benchmarks: { ceiling: 690, replacement: 400 },
  })

describe('snakePickOrder / teamOnClock / applyPick', () => {
  it('snakes: odd rounds ascend, even rounds descend', () => {
    expect(snakePickOrder(3, 2)).toEqual([1, 2, 3, 3, 2, 1])
  })

  it('applyPick is immutable and attributes the pick to the team on the clock', () => {
    const state = makeDraftState(skillPool())
    expect(currentOverall(state)).toBe(1)
    expect(teamOnClock(state)).toBe(1)
    const next = applyPick(state, 'p-rb1')
    expect(state.picks).toHaveLength(0)
    expect(state.taken.has('p-rb1')).toBe(false)
    expect(next.picks).toEqual([{ overall: 1, teamId: 1, playerId: 'p-rb1' }])
    expect(teamOnClock(next)).toBe(2)
    expect(availablePlayers(next).some((player) => player.playerId === 'p-rb1')).toBe(false)
  })

  it('rejects double-picks and unknown players', () => {
    const state = applyPick(makeDraftState(skillPool()), 'p-rb1')
    expect(() => applyPick(state, 'p-rb1')).toThrow(/off the board/)
    expect(() => applyPick(state, 'p-nobody')).toThrow(/not in pool/)
  })

  it('supports mid-draft entry: baseOverall and initialRosters', () => {
    const state = makeDraftState(skillPool(), {
      baseOverall: 3,
      initialRosters: new Map([
        [1, ['p-rb1']],
        [2, ['p-wr1']],
      ]),
    })
    expect(teamOnClock(state)).toBe(2) // pick 3 of 1,2,2,1,1,2
    expect(state.taken.has('p-rb1')).toBe(true)
    expect(rosterOf(state, 1).map((player) => player.playerId)).toEqual(['p-rb1'])
  })
})

describe('runDraft', () => {
  it('runs to completion with unique picks matching the pick order', () => {
    const final = runDraft(makeDraftState(skillPool()), () => adpPolicy, makeRng(1))
    expect(isComplete(final)).toBe(true)
    expect(final.picks).toHaveLength(6)
    const ids = final.picks.map((pick) => pick.playerId)
    expect(new Set(ids).size).toBe(6)
    expect(final.picks.map((pick) => pick.teamId)).toEqual([1, 2, 2, 1, 1, 2])
    // ADP order end-to-end: rb1, rb2, wr1, wr2, qb1, qb2
    expect(ids).toEqual(['p-rb1', 'p-rb2', 'p-wr1', 'p-wr2', 'p-qb1', 'p-qb2'])
  })

  it('is deterministic under a seed with a noisy field, and seeds change outcomes', () => {
    const run = (seed: number): string =>
      runDraft(makeDraftState(skillPool()), () => noisyAdpPolicy(3), makeRng(seed))
        .picks.map((pick) => pick.playerId)
        .join(',')
    expect(run(7)).toBe(run(7))
    const distinct = new Set([run(1), run(2), run(3), run(4), run(5)])
    expect(distinct.size).toBeGreaterThan(1)
  })
})

describe('policies', () => {
  it('noisyAdp(0) equals the deterministic adpPolicy', () => {
    const byNoisy = runDraft(makeDraftState(skillPool()), () => noisyAdpPolicy(0), makeRng(9))
    const byAdp = runDraft(makeDraftState(skillPool()), () => adpPolicy, makeRng(9))
    expect(byNoisy.picks).toEqual(byAdp.picks)
  })

  it('noisyAdp draws are keyed, not sequence-dependent: same seed, same pick', () => {
    const state = makeDraftState(skillPool())
    const policy = noisyAdpPolicy(2)
    const rng = makeRng(11)
    const first = policy(state, 1, rng)
    rng.next() // burn draws on the parent stream
    rng.next()
    expect(policy(state, 1, rng)).toBe(first)
  })

  it('fills missing K/DST by ADP once only forced picks remain', () => {
    const pool = makeSimPool({
      players: [
        mkPlayer('p-qb1', 'QB', 300, 1, 60),
        mkPlayer('p-qb2', 'QB', 280, 2, 40),
        mkPlayer('p-rb1', 'RB', 200, 3, 120),
        mkPlayer('p-rb2', 'RB', 180, 4, 100),
        mkPlayer('p-wr1', 'WR', 190, 5, 110),
        mkPlayer('p-wr2', 'WR', 170, 6, 90),
        mkPlayer('p-dst1', 'DST', null, 8),
        mkPlayer('p-dst2', 'DST', null, 9),
        mkPlayer('p-k1', 'K', null, 10),
        mkPlayer('p-k2', 'K', null, 11),
      ],
      teams: 2,
      rounds: 5,
      lineupSlots: { QB: 1, RB: 1, WR: 1, TE: 0, FLEX: 0, DST: 1, K: 1, BENCH: 0, IR: 0 },
      replacementPoints: { QB: 240, RB: 80, WR: 80 },
      benchmarks: { ceiling: 690, replacement: 400 },
    })
    const state = makeDraftState(pool)
    expect(forcedKdstPick(state, 1)).toBeNull() // rounds to spare
    const final = runDraft(state, () => marginalPolicy, makeRng(3))
    for (const teamId of [1, 2]) {
      const positions = rosterOf(final, teamId).map((player) => player.position)
      expect(positions.filter((position) => position === 'DST')).toHaveLength(1)
      expect(positions.filter((position) => position === 'K')).toHaveLength(1)
      // K/DST arrive in the last two rounds, never earlier
      const picks = final.picks.filter((pick) => pick.teamId === teamId)
      const early = picks.slice(0, 3).map((pick) => pool.byId.get(pick.playerId)?.position)
      expect(early).not.toContain('DST')
      expect(early).not.toContain('K')
    }
  })
})

describe('scorers × argmax composition', () => {
  it('argmax(points) takes the highest-points player', () => {
    const pick = argmaxPolicy(pointsScorer)(makeDraftState(skillPool()), 1, makeRng(1))
    expect(pick).toBe('p-qb1')
  })

  it('argmax(vor) takes the highest-VOR player', () => {
    const pick = argmaxPolicy(vorScorer)(makeDraftState(skillPool()), 1, makeRng(1))
    expect(pick).toBe('p-rb1')
  })

  it('argmax(marginal) reproduces chooseForRoster', () => {
    const pool = skillPool()
    let state = makeDraftState(pool)
    const rng = makeRng(5)
    while (!isComplete(state)) {
      const teamId = teamOnClock(state)
      const direct = chooseForRoster(
        availablePlayers(state),
        { players: rosterOf(state, teamId), lineupSlots: pool.lineupSlots, replacementPoints: pool.replacementPoints },
        new Map(pool.upsideScores),
      )
      const viaArgmax = argmaxPolicy(marginalScorer)(state, teamId, rng)
      expect(viaArgmax).toBe(direct?.playerId ?? null)
      if (viaArgmax === null) {
        break
      }
      state = applyPick(state, viaArgmax)
    }
  })

  it('rolloutScorer values a candidate by playing the sequence out', () => {
    // Team 1 picks at overalls 1, 4, 5; the room (team 2) eats the top two ADP players between.
    const pool = skillPool()
    const state = makeDraftState(pool)
    const scorer = rolloutScorer()
    const rng = makeRng(1)
    const scoreRb = scorer.scorePick(state, 1, 'p-rb1', rng)
    const scoreWr = scorer.scorePick(state, 1, 'p-wr1', rng)
    // rb1 now → room takes rb2, wr1 → my 4/5: wr2 (+90) then qb1 (+60) → 200+170+300
    expect(scoreRb).toBeCloseTo(200 + 170 + 300, 6)
    // wr1 now → room takes rb1, rb2 → my 4/5: qb1 (+60) then rb3 (+20) → 190+300+100
    expect(scoreWr).toBeCloseTo(190 + 300 + 100, 6)
    expect(scoreRb).toBeGreaterThan(scoreWr)
  })
})

describe('fitness scorings', () => {
  it('projection fitness: starter total with replacement-filled seats and capture ratio', () => {
    const pool = skillPool()
    const roster = [pool.byId.get('p-rb1'), pool.byId.get('p-wr1')] as RolloutPlayer[]
    const fitness = projectionFitness(pool, roster)
    expect(fitness.starterTotal).toBeCloseTo(200 + 190 + 240, 6) // open QB seat at replacement
    expect(fitness.captureRatio).toBeCloseTo((630 - 400) / (690 - 400), 6)
  })

  it('outcome sampling is seed-deterministic and keyed per player', () => {
    const pool = skillPool()
    const a = sampleRealizedPoints(pool, makeRng(hashSeed(42, 0)))
    const b = sampleRealizedPoints(pool, makeRng(hashSeed(42, 0)))
    expect([...a.entries()]).toEqual([...b.entries()])
    const c = sampleRealizedPoints(pool, makeRng(hashSeed(43, 0)))
    expect([...a.values()]).not.toEqual([...c.values()])
    for (const [id, realized] of a) {
      expect(realized).toBeGreaterThanOrEqual(0)
      const projected = pool.byId.get(id)?.points as number
      expect(Math.abs(realized - projected)).toBeLessThan(projected * 1.5 + 200)
    }
  })

  it('realized fitness scores the best realized lineup, not the projected one', () => {
    const pool = skillPool()
    const roster = [pool.byId.get('p-rb1'), pool.byId.get('p-rb2')] as RolloutPlayer[]
    const realized = new Map<PlayerId, number>([
      ['p-rb1', 50], // projected 200, busted
      ['p-rb2', 250], // projected 180, smashed
    ])
    // RB seat takes rb2 (250); rb1 has no seat (no FLEX) → 250
    expect(realizedFitness(pool, roster, realized)).toBeCloseTo(250, 6)
  })
})

describe('tournament', () => {
  it('is reproducible: same seed, same trials, identical results', () => {
    const pool = skillPool()
    const run = (): unknown =>
      tournament({
        pool,
        seatSlot: 1,
        seatPolicy: argmaxPolicy(marginalScorer),
        fieldPolicy: noisyAdpPolicy(1),
        trials: 4,
        seed: 99,
      })
    expect(run()).toEqual(run())
  })

  it('shares room noise across arms: identical seat choices imply identical trials', () => {
    const pool = skillPool()
    const [armA, armB] = [argmaxPolicy(marginalScorer), marginalPolicy].map((seatPolicy) =>
      tournament({ pool, seatSlot: 1, seatPolicy, fieldPolicy: noisyAdpPolicy(1), trials: 6, seed: 7 }),
    )
    // marginalPolicy and argmax(marginalScorer) agree pick-for-pick, so with shared field
    // streams and shared outcome draws every trial must match exactly across the two arms.
    expect(armA).toEqual(armB)
  })

  it('scores every trial both ways over full rosters', () => {
    const pool = skillPool()
    const results = tournament({
      pool,
      seatSlot: 2,
      seatPolicy: argmaxPolicy(vorScorer),
      fieldPolicy: adpPolicy,
      trials: 3,
      seed: 5,
    })
    for (const trial of results) {
      expect(trial.rosterIds).toHaveLength(3)
      expect(trial.starterTotal).toBeGreaterThan(0)
      expect(trial.realizedTotal).toBeGreaterThan(0)
      expect(trial.captureRatio).toBeLessThanOrEqual(1.01)
    }
  })
})

describe('rosterIdsOf', () => {
  it('merges initial holdings with in-state picks', () => {
    const state = applyPick(
      makeDraftState(skillPool(), { baseOverall: 2, initialRosters: new Map([[2, ['p-qb1']]]) }),
      'p-rb1', // pick 2 belongs to team 2
    )
    expect(rosterIdsOf(state, 2)).toEqual(['p-qb1', 'p-rb1'])
  })
})
