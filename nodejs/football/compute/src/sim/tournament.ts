/**
 * Simulation tournament: one seat plays `seatPolicy` from `seatSlot`, the other eleven
 * (or N−1) seats play `fieldPolicy`, `trials` full drafts are run, and every trial is
 * scored both ways (projection-truth and outcome-sampled).
 *
 * Determinism: trial i derives its seed as hash(seed, i); each team gets its own RNG
 * stream hash(trialSeed, teamId), and outcome sampling gets hash(trialSeed, OUTCOME_TAG).
 * Two tournaments sharing (seed, trials) therefore share room noise and realized seasons
 * trial-for-trial — arms of an A/B differ only through the seat's own choices.
 */
import type { PlayerId } from '@twin-digital/football-data'

import { projectionFitness, realizedFitness, sampleRealizedPoints } from './fitness.js'
import { hashSeed, makeRng } from './rng.js'
import {
  makeDraftState,
  rosterIdsOf,
  rosterOf,
  runDraft,
  untilSeatSkillFull,
  type PickPolicy,
  type SimPool,
} from './state.js'

const OUTCOME_TAG = 0x0ddba11

export interface TournamentOptions {
  pool: SimPool
  /** The seat under test: a 1-based draft slot. */
  seatSlot: number
  seatPolicy: PickPolicy
  fieldPolicy: PickPolicy
  trials: number
  seed: number
  /** Progress hook, called after each trial. */
  onTrial?: (completed: number, total: number) => void
}

export interface TrialResult {
  trial: number
  trialSeed: number
  rosterIds: PlayerId[]
  /** Projection-truth: projected starter total and capture ratio. */
  starterTotal: number
  captureRatio: number
  /** Outcome-sampled: best realized lineup total for this trial's sampled seasons. */
  realizedTotal: number
}

export const tournament = (options: TournamentOptions): TrialResult[] => {
  const { pool, seatSlot, seatPolicy, fieldPolicy, trials, seed } = options
  const results: TrialResult[] = []
  for (let trial = 0; trial < trials; trial += 1) {
    const trialSeed = hashSeed(seed, trial)
    const teamRngs = new Map<number, ReturnType<typeof makeRng>>()
    const policies = (teamId: number): PickPolicy => {
      const base = teamId === seatSlot ? seatPolicy : fieldPolicy
      let rng = teamRngs.get(teamId)
      if (rng === undefined) {
        rng = makeRng(hashSeed(trialSeed, teamId))
        teamRngs.set(teamId, rng)
      }
      const teamRng = rng
      return (state, id, _rng) => base(state, id, teamRng)
    }
    const final = runDraft(makeDraftState(pool), policies, makeRng(trialSeed), untilSeatSkillFull(seatSlot))
    const roster = rosterOf(final, seatSlot)
    const projection = projectionFitness(pool, roster)
    const realizedById = sampleRealizedPoints(pool, makeRng(hashSeed(trialSeed, OUTCOME_TAG)))
    results.push({
      trial,
      trialSeed,
      rosterIds: rosterIdsOf(final, seatSlot),
      starterTotal: projection.starterTotal,
      captureRatio: projection.captureRatio,
      realizedTotal: realizedFitness(pool, roster, realizedById),
    })
    options.onTrial?.(trial + 1, trials)
  }
  return results
}
