/**
 * Pick scorers — a number for "how good is taking this candidate here". Scorers compose
 * with policies: `argmaxPolicy(scorer)` is a policy, and any policy can be the opponent
 * model inside a simulating scorer (`rolloutScorer`, `recursiveScorer`).
 */
import type { PlayerId } from '@twin-digital/football-data'

import type { RolloutPlayer } from '../rollout.js'
import { lineupTotalWithReplacement } from '../roster.js'

import { chooseForRoster, positionCaps } from './marginal.js'
import { adpPolicy, marginalPolicy, topVorSlate } from './policies.js'
import type { Rng } from './rng.js'
import {
  applyPick,
  isComplete,
  rosterOf,
  runDraft,
  SKILL_SET,
  teamOnClock,
  untilSeatSkillFull,
  type DraftState,
  type PickPolicy,
  type SkillPosition,
} from './state.js'

export interface PickScorer {
  name: string
  scorePick(state: DraftState, teamId: number, candidate: PlayerId, rng: Rng): number
}

const playerOf = (state: DraftState, candidate: PlayerId): RolloutPlayer | undefined => state.pool.byId.get(candidate)

/** Raw projected league points — the naive baseline. */
export const pointsScorer: PickScorer = {
  name: 'points',
  scorePick: (state, _teamId, candidate) => playerOf(state, candidate)?.points ?? Number.NEGATIVE_INFINITY,
}

/** Value over replacement — position-aware, sequence-blind. */
export const vorScorer: PickScorer = {
  name: 'vor',
  scorePick: (state, _teamId, candidate) => playerOf(state, candidate)?.vor ?? Number.NEGATIVE_INFINITY,
}

/**
 * The `chooseForRoster` logic as a score. Starter-improving picks score 1e6 + marginal
 * starter points (so they always beat bench picks); bench picks score by cap-legality,
 * then upside, points as a whisker tiebreak. argmax over this reproduces the marginal
 * chooser's decisions.
 */
export const marginalScorer: PickScorer = {
  name: 'marginal',
  scorePick: (state, teamId, candidate) => {
    const player = playerOf(state, candidate)
    if (player?.points == null || !SKILL_SET.has(player.position)) {
      return Number.NEGATIVE_INFINITY
    }
    const roster = rosterOf(state, teamId)
    const { lineupSlots, replacementPoints, upsideScores } = state.pool
    const caps = positionCaps(lineupSlots)
    const count = roster.filter((held) => held.position === player.position).length
    const open = count < caps[player.position as SkillPosition]
    if (open) {
      const base = lineupTotalWithReplacement(roster, lineupSlots, replacementPoints)
      const marginal = lineupTotalWithReplacement([...roster, player], lineupSlots, replacementPoints) - base
      if (marginal > 1e-6) {
        return 1e6 + marginal
      }
    }
    const upside = upsideScores.get(candidate) ?? player.upsideScore ?? 0
    return (open ? 1e3 : 0) + upside + player.points * 1e-6
  },
}

export interface SimulatingScorerOptions {
  /** Model of every other team; defaults to the deterministic mean path (`adpPolicy`). */
  opponents?: PickPolicy
  /** Model of my own future picks; defaults to the marginal chooser (`marginalPolicy`). */
  futureMe?: PickPolicy
}

/**
 * Complete a draft from `state` with the seat played by `futureMe` and everyone else by
 * `opponents`, stopping once the seat's skill seats are full (later picks can't move a
 * fitness metric).
 */
export const completeDraft = (
  state: DraftState,
  seatId: number,
  rng: Rng,
  options: SimulatingScorerOptions = {},
): DraftState => {
  const opponents = options.opponents ?? adpPolicy
  const futureMe = options.futureMe ?? marginalPolicy
  return runDraft(state, (teamId) => (teamId === seatId ? futureMe : opponents), rng, untilSeatSkillFull(seatId))
}

/** Seat's projected starter total (open seats at replacement) in `state`. */
export const seatStarterTotal = (state: DraftState, seatId: number): number =>
  lineupTotalWithReplacement(rosterOf(state, seatId), state.pool.lineupSlots, state.pool.replacementPoints)

export interface RolloutValue {
  starterTotal: number
  finalState: DraftState
}

/** Take the candidate now, play the rest out, and report the seat's final starter total. */
export const rolloutValue = (
  state: DraftState,
  teamId: number,
  candidate: PlayerId,
  rng: Rng,
  options: SimulatingScorerOptions = {},
): RolloutValue => {
  const finalState = completeDraft(applyPick(state, candidate), teamId, rng, options)
  return { starterTotal: seatStarterTotal(finalState, teamId), finalState }
}

/**
 * The current engine as a scorer: deterministic rollout of the whole remaining draft —
 * `opponents` (default mean-path ADP) plays the room, `futureMe` (default marginal) plays
 * my later picks — scored as my final starter total.
 */
export const rolloutScorer = (options: SimulatingScorerOptions = {}): PickScorer => ({
  name: 'rollout',
  scorePick: (state, teamId, candidate, rng) => rolloutValue(state, teamId, candidate, rng, options).starterTotal,
})

export interface RecursiveScorerOptions extends SimulatingScorerOptions {
  /** Branching width at my NEXT pick: how many candidates get their own greedy rollout. */
  depth: number
}

/**
 * One extra ply of lookahead: candidate now → opponents play to my next pick → the top
 * `depth` candidates there each get a greedy rollout, and the best branch is my score.
 * Lookahead is applied at the next pick only — full recursion over all remaining picks is
 * exponential (depth^picks rollouts), so everything after the next pick stays greedy.
 */
export const recursiveScorer = (options: RecursiveScorerOptions): PickScorer => {
  const opponents = options.opponents ?? adpPolicy
  const slate = topVorSlate(options.depth, 1)
  return {
    name: `recursive-${String(options.depth)}`,
    scorePick: (state, teamId, candidate, rng) => {
      const seatDone = untilSeatSkillFull(teamId)
      const afterCandidate = applyPick(state, candidate)
      const atNextPick = runDraft(
        afterCandidate,
        () => opponents,
        rng,
        (current) => seatDone(current) || teamOnClock(current) === teamId,
      )
      if (isComplete(atNextPick) || seatDone(atNextPick)) {
        return seatStarterTotal(atNextPick, teamId)
      }
      let best = Number.NEGATIVE_INFINITY
      for (const nextCandidate of slate(atNextPick, teamId)) {
        const { starterTotal } = rolloutValue(atNextPick, teamId, nextCandidate, rng, options)
        if (starterTotal > best) {
          best = starterTotal
        }
      }
      // An empty slate (skill pool drained) falls back to a plain greedy completion.
      return best === Number.NEGATIVE_INFINITY ?
          seatStarterTotal(completeDraft(atNextPick, teamId, rng, options), teamId)
        : best
    },
  }
}

// Re-exported here so scorer users see the composition seam without importing marginal.js.
export { chooseForRoster }
