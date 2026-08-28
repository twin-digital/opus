import type { MarketData } from '@twin-digital/football-data'

/**
 * ESPN reports undrafted players with an ADP pinned at the draft length (~170 in a 12×14
 * board); values at or past 169.5 are a sentinel, not a price.
 */
export const ESPN_UNDRAFTED_SENTINEL = 169.5

const espnAdp = (market: MarketData): number | null => {
  const adp = market.adp.espn
  if (adp === undefined) {
    return null
  }
  for (const format of ['half', 'ppr', 'std'] as const) {
    const value = adp[format]
    if (value !== undefined && value < ESPN_UNDRAFTED_SENTINEL) {
      return value
    }
  }
  return null
}

/**
 * The price the room will actually pay: ESPN ADP first — the league drafts in ESPN's UI, so
 * ESPN's board predicts this room — falling back to Sleeper half-PPR where ESPN has none.
 */
export const roomAdp = (market: MarketData): number | null => espnAdp(market) ?? market.adp.sleeper?.half ?? null

/** Market (non-ESPN) ADP: half-PPR first, Sleeper before FantasyPros. */
export const marketAdp = (market: MarketData): number | null => {
  for (const format of ['half', 'ppr', 'std'] as const) {
    for (const source of ['sleeper', 'fantasypros'] as const) {
      const value = market.adp[source]?.[format]
      if (value !== undefined) {
        return value
      }
    }
  }
  return null
}

/**
 * Signed ESPN − market gap where both prices exist. Positive = ESPN-buried (the room lets him
 * fall past his market price); negative = ESPN-hyped (gone before market ADP says).
 */
export const roomDelta = (market: MarketData): number | null => {
  const espn = espnAdp(market)
  const other = marketAdp(market)
  return espn !== null && other !== null ? espn - other : null
}
