import type { MarketData, PlayerId } from '@twin-digital/football-data'

import { marketAdp, roomAdp } from './room.js'

/**
 * Upside knobs, in one place.
 *
 * RANK_SCALE_EXP — ceilingJump and sigma both grow mechanically with rank depth (one optimist
 * plus plain noise puts ecr.best 150 spots above an ECR-300 name), so each is divided by
 * rank^RANK_SCALE_EXP before percentiling: √rank, the same std/√rank convention the consensus
 * k-scaler uses (TUNING.STD_NORM_REF). The residual-spread component is points-based and needs
 * no rank normalization.
 *
 * MAX_REAL_ADP — a score also requires a real price. ESPN prices its entire undrafted tail in
 * a thin band just under the 169.5 sentinel (measured 2026-08-28: the tail cohort sits at
 * 167–169.4), so a player enters the upside pool only when some source prices him at or under
 * MAX_REAL_ADP, clear of that shoulder. Deep-tail names without a real market (a rookie
 * college QB at ECR 235, market ADP 188) get no score rather than an inflated one.
 */
export const UPSIDE = {
  RANK_SCALE_EXP: 0.5,
  MAX_REAL_ADP: 165,
} as const

export interface UpsideSignals {
  /** Optimist gap (ecr.rank − ecr.best), normalized by rank^RANK_SCALE_EXP. */
  ceilingJump: number | null
  /** Expert disagreement (ecr.stdDev), normalized by rank^RANK_SCALE_EXP. */
  sigma: number | null
  /** Debiased cross-source residual spread in league points — projection-shop disagreement. */
  spread: number | null
}

/** Cheap ceiling proxies from FantasyPros ECR plus source spread; null when none exist. */
export const upsideSignals = (market: MarketData, spread: number | null = null): UpsideSignals | null => {
  const scale = market.ecr === null ? 1 : Math.pow(market.ecr.rank, UPSIDE.RANK_SCALE_EXP)
  const signals: UpsideSignals = {
    ceilingJump: market.ecr === null ? null : (market.ecr.rank - market.ecr.best) / scale,
    sigma: market.ecr === null ? null : market.ecr.stdDev / scale,
    spread,
  }
  return signals.ceilingJump === null && signals.spread === null ? null : signals
}

/**
 * Draftable for upside purposes: somebody actually prices him inside the draft's real range —
 * best available price (room or market) at or under UPSIDE.MAX_REAL_ADP. roomAdp already nulls
 * ESPN's undrafted sentinel; the threshold keeps the sentinel's 167–169.4 shoulder out too.
 */
export const isDraftable = (market: MarketData): boolean => {
  const best = Math.min(roomAdp(market) ?? Number.POSITIVE_INFINITY, marketAdp(market) ?? Number.POSITIVE_INFINITY)
  return best <= UPSIDE.MAX_REAL_ADP
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
