import type { PlayerId } from '@twin-digital/football-data'

/** A positional candidate for the cost-of-waiting expectation; `points` is consensus points. */
export interface WaitingCandidate {
  playerId: PlayerId
  name: string
  points: number
}

export interface ExpectedBest {
  /**
   * First-available expectation over the points-sorted list: Σ_i pts_i × P_i × Π_{j<i}(1 − P_j),
   * where P_i is P(player i still available at the pick). The residual mass where every listed
   * player is gone contributes 0 — negligible for a deep pool, honest for a shallow one.
   */
  expected: number
  /** The candidate likeliest to be the best one available (argmax P_i × Π_{j<i}(1 − P_j)). */
  likely: (WaitingCandidate & { probFirst: number }) | null
}

/**
 * Expected best-available points at a future pick. `candidates` must be sorted by points
 * descending; `survival(playerId)` is P(still available at the pick) from the room model.
 */
export const expectedBestAvailable = (
  candidates: WaitingCandidate[],
  survival: (playerId: PlayerId) => number,
): ExpectedBest => {
  let expected = 0
  let allGone = 1
  let likely: (WaitingCandidate & { probFirst: number }) | null = null
  for (const candidate of candidates) {
    const p = survival(candidate.playerId)
    const probFirst = p * allGone
    expected += candidate.points * probFirst
    if (likely === null || probFirst > likely.probFirst) {
      likely = { ...candidate, probFirst }
    }
    allGone *= 1 - p
    if (allGone <= 0) {
      break
    }
  }
  return { expected, likely }
}
