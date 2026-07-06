/**
 * A small, fast, deterministic PRNG (mulberry32). Same seed → same stream.
 * Worldgen must be reproducible: `--seed 7` should always yield the same compact.
 */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number
  /** True with probability `p`. */
  chance(p: number): boolean
  /** Pick one element. */
  pick<T>(items: readonly T[]): T
  /** Pick one element, biased by `weight` (non-positive weights are treated as 0). */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T
  /** A shuffled copy (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[]
  /** Up to `count` distinct elements. */
  sample<T>(items: readonly T[], count: number): T[]
}

/**
 * Scramble an integer seed so that adjacent seeds (7, 8, 9 …) produce well-separated
 * streams. mulberry32 has a weak avalanche on its first draw for adjacent seeds; run the
 * user-facing seed through this first (splitmix32 finalizer) to decorrelate them.
 */
export const hashSeed = (seed: number): number => {
  let x = seed >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  return (x ^ (x >>> 16)) >>> 0
}

export const createRng = (seed: number): Rng => {
  let a = seed >>> 0

  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1))

  const chance = (p: number): boolean => next() < p

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new RangeError('cannot pick from an empty array')
    }
    return items[int(0, items.length - 1)]
  }

  const weighted = <T>(items: readonly T[], weight: (item: T) => number): T => {
    if (items.length === 0) {
      throw new RangeError('cannot pick from an empty array')
    }
    let total = 0
    for (const item of items) {
      total += Math.max(0, weight(item))
    }
    if (total <= 0) {
      return pick(items)
    }
    let r = next() * total
    for (const item of items) {
      r -= Math.max(0, weight(item))
      if (r < 0) {
        return item
      }
    }
    return items[items.length - 1]
  }

  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = items.slice()
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i)
      const tmp = out[i]
      out[i] = out[j]
      out[j] = tmp
    }
    return out
  }

  const sample = <T>(items: readonly T[], count: number): T[] =>
    shuffle(items).slice(0, Math.max(0, Math.min(count, items.length)))

  return { next, int, chance, pick, weighted, shuffle, sample }
}
