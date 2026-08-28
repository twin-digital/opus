/**
 * Mock-draft opponent model: a seeded PRNG plus a room-ADP pick selector with jitter.
 * Pure functions — the App owns the session state, which lives only in memory.
 */
import { sigmaForPick } from '@twin-digital/football-compute'
import type { PlayerId, Position } from '@twin-digital/football-data'

/** Deterministic 32-bit PRNG (mulberry32): same seed → same pick sequence. */
export const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standard normal via Box–Muller; consumes two uniforms per call. */
export const gaussian = (rng: () => number): number => {
  const u = Math.max(rng(), 1e-12)
  const v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export interface OpponentCandidate {
  playerId: PlayerId
  position: Position
  roomAdp: number | null
  adp: number | null
}

export interface OpponentPickInput {
  /** Undrafted players (board rows carry roomAdp). */
  available: OpponentCandidate[]
  /** The picking team's drafted-position counts so far. */
  counts: Partial<Record<Position, number>>
  round: number
  totalRounds: number
  rng: () => number
}

const KICKER_DST = new Set<Position>(['K', 'DST'])
/** Crude positional sanity: no 3rd QB/TE, one K and one DST. */
const POSITION_CAPS: Partial<Record<Position, number>> = { QB: 2, TE: 2, K: 1, DST: 1 }
/** Jitter among this many cheapest candidates; keeps picks near the room's price. */
const POOL_SIZE = 25
const NO_ADP_PRICE = 9999

const priceOf = (candidate: OpponentCandidate): number => candidate.roomAdp ?? candidate.adp ?? NO_ADP_PRICE
const byPrice = (a: OpponentCandidate, b: OpponentCandidate): number =>
  priceOf(a) - priceOf(b) || a.playerId.localeCompare(b.playerId)

/**
 * One opponent pick: cheapest room ADP with seeded Normal jitter over the top of the eligible
 * pool. K/DST wait for the last two rounds, where a missing K/DST is filled first by ADP.
 * Players without a roomAdp are ignored until nothing else remains. Null only on an empty pool.
 */
export const pickForOpponent = (input: OpponentPickInput): PlayerId | null => {
  const { available, counts, round, totalRounds, rng } = input
  const lastTwoRounds = round > totalRounds - 2
  if (lastTwoRounds) {
    const missing = [...KICKER_DST].filter((position) => (counts[position] ?? 0) === 0)
    const fill = available.filter((candidate) => missing.includes(candidate.position)).sort(byPrice)[0]
    if (fill !== undefined) {
      return fill.playerId
    }
  }
  const atCap = (candidate: OpponentCandidate): boolean => {
    const cap = POSITION_CAPS[candidate.position]
    return cap !== undefined && (counts[candidate.position] ?? 0) >= cap
  }
  const tooEarlyKDst = (candidate: OpponentCandidate): boolean => !lastTwoRounds && KICKER_DST.has(candidate.position)
  let eligible = available.filter((c) => c.roomAdp !== null && !atCap(c) && !tooEarlyKDst(c))
  if (eligible.length === 0) {
    eligible = available.filter((c) => !atCap(c) && !tooEarlyKDst(c))
  }
  if (eligible.length === 0) {
    eligible = available.filter((c) => !atCap(c))
  }
  if (eligible.length === 0) {
    eligible = available
  }
  const pool = [...eligible].sort(byPrice).slice(0, POOL_SIZE)
  let best: OpponentCandidate | null = null
  let bestScore = Infinity
  for (const candidate of pool) {
    const price = priceOf(candidate)
    const score = price + gaussian(rng) * 0.5 * sigmaForPick(price, null)
    if (score < bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return best === null ? null : best.playerId
}
