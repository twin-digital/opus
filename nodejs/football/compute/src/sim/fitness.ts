/**
 * Two fitness scorings for a drafted roster, computed over the SAME drafts:
 *
 * - projection-truth: the projected starter total (open skill seats at replacement) and its
 *   capture ratio against the pool benchmarks — "how well did you draft the projections".
 * - outcome-sampled: each player's realized season is drawn once per trial as
 *   Normal(projected, σ(position)·projected) with a crude position-scaled σ (RB/WR 0.25,
 *   QB/TE 0.20, σ floor 20, realized floor 0), and the roster is scored as its best
 *   realized lineup — "how well does the draft hold up when projections miss".
 *
 * Realized draws are keyed on (outcome stream, playerId), so every arm of a comparison
 * sees the same realized season for the same player in the same trial. K/DST carry no
 * projections and contribute 0 to both scorings.
 */
import type { PlayerId, Position } from '@twin-digital/football-data'

import { captureRatio, type RolloutPlayer } from '../rollout.js'
import { bestLineup, lineupTotalWithReplacement } from '../roster.js'

import { hashString, normalSample, type Rng } from './rng.js'
import type { SimPool } from './state.js'

/** Fraction of projected points used as realized-season σ, per position. */
export const OUTCOME_SIGMA_RATE: Partial<Record<Position, number>> = {
  QB: 0.2,
  TE: 0.2,
  RB: 0.25,
  WR: 0.25,
}

export const OUTCOME_SIGMA_FLOOR = 20

/** One realized season per projected player, keyed draws — order-independent. */
export const sampleRealizedPoints = (pool: SimPool, rng: Rng): Map<PlayerId, number> => {
  const realized = new Map<PlayerId, number>()
  for (const player of pool.players) {
    if (player.points === null) {
      continue
    }
    const sigma = Math.max(OUTCOME_SIGMA_FLOOR, (OUTCOME_SIGMA_RATE[player.position] ?? 0.2) * player.points)
    const draw = normalSample(rng.fork(hashString(player.playerId)), player.points, sigma)
    realized.set(player.playerId, Math.max(0, draw))
  }
  return realized
}

export interface ProjectionFitness {
  starterTotal: number
  captureRatio: number
}

export const projectionFitness = (pool: SimPool, roster: RolloutPlayer[]): ProjectionFitness => {
  const starterTotal = lineupTotalWithReplacement(roster, pool.lineupSlots, pool.replacementPoints)
  return { starterTotal, captureRatio: captureRatio(starterTotal, pool.benchmarks) }
}

/** Best realized lineup from the drafted roster (unfilled seats contribute 0). */
export const realizedFitness = (pool: SimPool, roster: RolloutPlayer[], realizedById: Map<PlayerId, number>): number =>
  bestLineup(
    roster.map((player) => ({
      playerId: player.playerId,
      position: player.position,
      points: realizedById.get(player.playerId) ?? null,
    })),
    pool.lineupSlots,
  ).total
