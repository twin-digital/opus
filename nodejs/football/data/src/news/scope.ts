import type { MarketData, Player } from '../models.js'

/**
 * ESPN pins players outside its ranked list to an ADP plateau at the ~170 cap (observed
 * 169–171.7, ~750 players); those values carry no draft signal and are ignored.
 */
const ESPN_ADP_PLATEAU = 169

const bestAdp = (market: MarketData | undefined): number | null => {
  if (!market) {
    return null
  }
  let best: number | null = null
  for (const [source, formats] of Object.entries(market.adp)) {
    for (const value of Object.values(formats)) {
      if (source === 'espn' && value >= ESPN_ADP_PLATEAU) {
        continue
      }
      if (best === null || value < best) {
        best = value
      }
    }
  }
  return best
}

/** Draftable by market signal (any ADP ≤ 170 or ECR ≤ 200), or injury-flagged inside ECR 300. */
export const isNewsworthy = (player: Player, market: MarketData | undefined): boolean => {
  const adp = bestAdp(market)
  const ecr = market?.ecr?.rank ?? null
  if ((adp !== null && adp <= 170) || (ecr !== null && ecr <= 200)) {
    return true
  }
  return player.injuryStatus !== 'ACTIVE' && ecr !== null && ecr <= 300
}

export const selectNewsworthyPool = (players: Player[], market: MarketData[]): Player[] => {
  const byPlayer = new Map(market.map((row) => [row.playerId, row]))
  return players.filter((player) => isNewsworthy(player, byPlayer.get(player.id)))
}
