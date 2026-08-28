/**
 * Pick policies — one team's behavior at one pick. Any scorer becomes a policy via
 * `argmaxPolicy`; any policy can serve as the opponent model inside a simulating scorer.
 *
 * K/DST handling: every policy first checks `forcedKdstPick` — once a team's remaining
 * picks are only enough to cover its unfilled K/DST seats (the last two rounds in a
 * standard lineup), it fills them by room ADP, like real rooms do.
 */
import type { PlayerId, Position } from '@twin-digital/football-data'

import { sigmaForPick } from '../draft-math.js'
import type { RolloutPlayer } from '../rollout.js'

import { chooseForRoster } from './marginal.js'
import { hashString, normalSample } from './rng.js'
import type { PickScorer } from './scorers.js'
import {
  availablePlayers,
  currentOverall,
  currentRound,
  rosterOf,
  SKILL_SET,
  type DraftState,
  type PickPolicy,
} from './state.js'

const KDST: readonly Position[] = ['K', 'DST']

/**
 * The forced K/DST fill: null while the team still has spare picks; once remaining picks ≤
 * unfilled K/DST seats, the best-room-ADP player at a needed position.
 */
export const forcedKdstPick = (state: DraftState, teamId: number): PlayerId | null => {
  const slots = state.pool.lineupSlots
  if (slots.K + slots.DST === 0) {
    return null
  }
  const counts: Partial<Record<Position, number>> = {}
  for (const player of rosterOf(state, teamId)) {
    counts[player.position] = (counts[player.position] ?? 0) + 1
  }
  const need = KDST.filter((position) => (counts[position] ?? 0) < slots[position as 'K' | 'DST'])
  if (need.length === 0) {
    return null
  }
  let remaining = 0
  for (let overall = currentOverall(state); overall <= state.pickOrder.length; overall += 1) {
    if (state.pickOrder[overall - 1] === teamId) {
      remaining += 1
    }
  }
  const unfilled = need.reduce((sum, position) => sum + (slots[position as 'K' | 'DST'] - (counts[position] ?? 0)), 0)
  if (remaining > unfilled) {
    return null
  }
  for (const player of state.pool.byAdp) {
    if (need.includes(player.position) && !state.taken.has(player.playerId)) {
      return player.playerId
    }
  }
  return null
}

const firstAvailableByAdp = (state: DraftState): PlayerId | null => {
  for (const player of state.pool.byAdp) {
    if (!state.taken.has(player.playerId)) {
      return player.playerId
    }
  }
  return null
}

/**
 * Strict room-ADP order — the mean path the deterministic rollout has always assumed
 * (`simulateRoomSegment` sequentialized), plus the forced K/DST fill at the end.
 */
export const adpPolicy: PickPolicy = (state, teamId) => forcedKdstPick(state, teamId) ?? firstAvailableByAdp(state)

/**
 * ADP + noise: each pick, every priced player's board position is perturbed by
 * Normal(0, σscale·σ) with σ from the existing survival-odds model (`sigmaForPick`), and the
 * lowest perturbed position wins. Draws are keyed on (team stream, round, playerId), so the
 * same seed reproduces the same room whatever the seat does. σscale = 0 degenerates to
 * `adpPolicy`.
 */
export const noisyAdpPolicy = (sigmaScale: number): PickPolicy => {
  return (state, teamId, rng) => {
    const forced = forcedKdstPick(state, teamId)
    if (forced !== null) {
      return forced
    }
    if (sigmaScale === 0) {
      return firstAvailableByAdp(state)
    }
    const round = currentRound(state)
    let best: RolloutPlayer | null = null
    let bestKey = Number.POSITIVE_INFINITY
    for (const player of state.pool.byAdp) {
      if (state.taken.has(player.playerId)) {
        continue
      }
      if (player.roomAdp === null) {
        // Unpriced players sort behind every priced one (byAdp order); take the first only
        // if nothing priced remains.
        best ??= player
        break
      }
      const sigma = state.pool.sigmaById.get(player.playerId) ?? sigmaForPick(player.roomAdp, null)
      const noise = normalSample(rng.fork(round, hashString(player.playerId)), 0, sigmaScale * sigma)
      const key = player.roomAdp + noise
      if (key < bestKey) {
        bestKey = key
        best = player
      }
    }
    return best?.playerId ?? null
  }
}

/**
 * The current engine's "my future picks" behavior: need-aware marginal chooser
 * (`chooseForRoster`) with an ADP fallback when no projected skill player remains.
 */
export const marginalPolicy: PickPolicy = (state, teamId) => {
  const forced = forcedKdstPick(state, teamId)
  if (forced !== null) {
    return forced
  }
  const roster = {
    players: rosterOf(state, teamId),
    lineupSlots: state.pool.lineupSlots,
    replacementPoints: state.pool.replacementPoints,
  }
  const choice = chooseForRoster(availablePlayers(state), roster, new Map(state.pool.upsideScores))
  return choice?.playerId ?? firstAvailableByAdp(state)
}

/** Candidate slate for an argmax policy: which players get scored at this pick. */
export type SlateBuilder = (state: DraftState, teamId: number) => PlayerId[]

/** Every available projected skill player — exact but slow for simulating scorers. */
export const fullSkillSlate: SlateBuilder = (state) =>
  state.pool.skillByPoints.filter((player) => !state.taken.has(player.playerId)).map((player) => player.playerId)

/** Top `count` available by VOR plus the top `perPosition` at each skill position. */
export const topVorSlate =
  (count: number, perPosition: number): SlateBuilder =>
  (state) => {
    const slate: PlayerId[] = []
    const included = new Set<PlayerId>()
    for (const player of state.pool.skillByVor) {
      if (slate.length >= count) {
        break
      }
      if (!state.taken.has(player.playerId)) {
        slate.push(player.playerId)
        included.add(player.playerId)
      }
    }
    for (const position of SKILL_SET) {
      let found = 0
      for (const player of state.pool.skillByVor) {
        if (found >= perPosition) {
          break
        }
        if (player.position === position && !state.taken.has(player.playerId)) {
          found += 1
          if (!included.has(player.playerId)) {
            included.add(player.playerId)
            slate.push(player.playerId)
          }
        }
      }
    }
    return slate
  }

/**
 * Turn any scorer into a policy: score the slate (default: every available projected skill
 * player), take the argmax; first-seen wins ties. Forced K/DST fill applies first; ADP
 * fallback when the slate is empty or nothing scores above −∞.
 */
export const argmaxPolicy = (scorer: PickScorer, slate: SlateBuilder = fullSkillSlate): PickPolicy => {
  return (state, teamId, rng) => {
    const forced = forcedKdstPick(state, teamId)
    if (forced !== null) {
      return forced
    }
    let best: PlayerId | null = null
    let bestScore = Number.NEGATIVE_INFINITY
    for (const candidate of slate(state, teamId)) {
      const score = scorer.scorePick(state, teamId, candidate, rng)
      if (score > bestScore) {
        bestScore = score
        best = candidate
      }
    }
    return best ?? firstAvailableByAdp(state)
  }
}
