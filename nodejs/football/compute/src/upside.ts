import type { MarketData, PlayerId } from '@twin-digital/football-data'

import { marketAdp, roomAdp, ESPN_UNDRAFTED_SENTINEL } from './room.js'

export interface UpsideSignals {
  /** How far above consensus the most optimistic expert ranks him: ecr.rank − ecr.best. */
  ceilingJump: number | null
  /** Expert disagreement (ecr.stdDev) — a wide outcome distribution. */
  sigma: number | null
  /** Debiased cross-source residual spread in league points — projection-shop disagreement. */
  spread: number | null
}

/** Cheap ceiling proxies from FantasyPros ECR plus source spread; null when none exist. */
export const upsideSignals = (market: MarketData, spread: number | null = null): UpsideSignals | null => {
  const signals: UpsideSignals = {
    ceilingJump: market.ecr === null ? null : market.ecr.rank - market.ecr.best,
    sigma: market.ecr === null ? null : market.ecr.stdDev,
    spread,
  }
  return signals.ceilingJump === null && signals.spread === null ? null : signals
}

/** Draftable: some ADP under the draft horizon (roomAdp already nulls ESPN's undrafted sentinel). */
export const isDraftable = (market: MarketData): boolean => {
  const adp = roomAdp(market) ?? marketAdp(market)
  return adp !== null && adp < ESPN_UNDRAFTED_SENTINEL
}

/** Average sorted-rank percentile of `values` (ties share their mean rank), scaled 0–100. */
const percentiles = (values: number[]): number[] => {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value)
  const ranks = new Array<number>(values.length)
  let i = 0
  while (i < order.length) {
    let j = i
    while (
      j + 1 < order.length &&
      (order[j + 1] as { value: number }).value === (order[i] as { value: number }).value
    ) {
      j += 1
    }
    const meanRank = (i + j) / 2
    for (let k = i; k <= j; k += 1) {
      ranks[(order[k] as { index: number }).index] = meanRank
    }
    i = j + 1
  }
  const span = Math.max(values.length - 1, 1)
  return ranks.map((rank) => (100 * rank) / span)
}

const SIGNAL_KEYS = ['ceilingJump', 'sigma', 'spread'] as const

/**
 * Upside score 0–100 over the draftable pool: the mean of up to three rank percentiles —
 * ceilingJump (ecr.rank − ecr.best), sigma (ecr.stdDev), and the debiased cross-source residual
 * spread — so a player is high-upside when experts disagree widely, someone ranks him far above
 * consensus, or the projection shops can't agree on his season. Each percentile is ranked over
 * the players that carry that signal; a player missing a component gets the mean of what exists.
 * Players with no components get no score. Callers pass the draftable pool; rows failing
 * `isDraftable` are dropped here too.
 */
export const computeUpsideScores = (
  pool: MarketData[],
  spreads: Map<PlayerId, number> = new Map(),
): Map<PlayerId, number> => {
  const scored = pool
    .filter((market) => isDraftable(market))
    .map((market) => ({
      playerId: market.playerId,
      signals: upsideSignals(market, spreads.get(market.playerId) ?? null),
    }))
    .filter((entry): entry is { playerId: PlayerId; signals: UpsideSignals } => entry.signals !== null)
  if (scored.length === 0) {
    return new Map()
  }

  // Per-component percentiles over the subset carrying that component.
  const componentPct = new Map<PlayerId, number[]>()
  for (const key of SIGNAL_KEYS) {
    const present = scored.filter((entry) => entry.signals[key] !== null)
    const pct = percentiles(present.map((entry) => entry.signals[key] as number))
    present.forEach((entry, index) => {
      const list = componentPct.get(entry.playerId) ?? []
      componentPct.set(entry.playerId, list)
      list.push(pct[index] as number)
    })
  }

  return new Map(
    scored.map((entry) => {
      const parts = componentPct.get(entry.playerId) as number[]
      return [entry.playerId, parts.reduce((sum, value) => sum + value, 0) / parts.length]
    }),
  )
}
