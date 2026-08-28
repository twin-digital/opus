/**
 * Seeded RNG for the simulation layer. Every stochastic sim call threads one of these
 * explicitly — Math.random never appears — so a trial is a pure function of its seed.
 *
 * `fork` derives an independent child stream from the parent's seed plus integer parts.
 * Policies use counter-style forks keyed on (round, playerId) so a draw depends only on
 * its coordinates, not on how many draws other code consumed — two tournament arms with
 * the same seed see identical room noise even where their seats diverge.
 */

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
  /** Independent child stream keyed by this stream's seed plus `parts`. */
  fork(...parts: number[]): Rng
  readonly seed: number
}

/** mulberry32: fast 32-bit PRNG, good enough statistical quality for draft sims. */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Mix integer parts into a 32-bit seed (splitmix-style avalanche per part). */
export const hashSeed = (...parts: number[]): number => {
  let h = 0x9e3779b9
  for (const part of parts) {
    h = (h + (part >>> 0)) >>> 0
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
    h ^= h >>> 16
  }
  return h >>> 0
}

/** FNV-1a over a string — lets forks be keyed by player ids. */
export const hashString = (value: string): number => {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export const makeRng = (seed: number): Rng => {
  const next = mulberry32(seed)
  return {
    next,
    seed: seed >>> 0,
    fork: (...parts: number[]) => makeRng(hashSeed(seed, ...parts)),
  }
}

/** One Normal(mean, sigma) draw via Box–Muller (first variate only). */
export const normalSample = (rng: Rng, mean = 0, sigma = 1): number => {
  const u1 = Math.max(rng.next(), 1e-12)
  const u2 = rng.next()
  return mean + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}
