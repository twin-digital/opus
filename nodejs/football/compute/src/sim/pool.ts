/**
 * BoardState → SimPool: the bridge from the ingested snapshot to the strategy layer.
 * Valuations (points, VOR, replacement, benchmarks, upside) come from the same
 * `buildPool` the frozen rollout API uses; pick-σ comes from the survival-odds model
 * with FantasyPros expert dispersion where present.
 */
import type { PlayerId } from '@twin-digital/football-data'

import type { BoardState } from '../board.js'
import { planningAdp, sigmaForPick } from '../draft-math.js'
import { buildPool, simPoolFromPool, type RolloutOptions } from '../rollout.js'

import { makeSimPool, SKILL_SET, type SimPool } from './state.js'

export const buildSimPool = (state: BoardState, options: RolloutOptions = {}): SimPool => {
  const base = simPoolFromPool(buildPool(state, options))
  const sigmaById = new Map<PlayerId, number>()
  for (const market of state.market) {
    const adp = planningAdp(market)
    if (adp !== null) {
      sigmaById.set(market.playerId, sigmaForPick(adp, market.ecr?.stdDev))
    }
  }
  return { ...base, sigmaById }
}

/**
 * Shrink a pool to its draft-relevant core for bulk simulation: the first `priced` players
 * in room-ADP order (K/DST included — they carry real ADPs) plus the top `deepSkill`
 * projected skill players by VOR beyond them. Valuation metadata (replacement, benchmarks)
 * is untouched, so fitness numbers stay comparable with the full pool's.
 */
export const trimSimPool = (pool: SimPool, priced = 280, deepSkill = 80): SimPool => {
  const keep = new Set<PlayerId>()
  for (const player of pool.byAdp.slice(0, priced)) {
    keep.add(player.playerId)
  }
  let added = 0
  for (const player of pool.skillByVor) {
    if (added >= deepSkill) {
      break
    }
    if (!keep.has(player.playerId) && SKILL_SET.has(player.position)) {
      keep.add(player.playerId)
      added += 1
    }
  }
  return makeSimPool({
    players: pool.players.filter((player) => keep.has(player.playerId)),
    teams: pool.teams,
    rounds: pool.rounds,
    lineupSlots: pool.lineupSlots,
    replacementPoints: pool.replacementPoints,
    benchmarks: pool.benchmarks,
    upsideScores: pool.upsideScores,
    sigmaById: pool.sigmaById,
    unavailable: pool.unavailable,
  })
}
