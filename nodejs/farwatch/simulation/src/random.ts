import type { Rng } from '@thrashplay/fw-core'

/** Pick `k` distinct indices from `[0, n)` using `rng` (partial Fisher–Yates). */
export const pickDistinct = (rng: Rng, n: number, k: number): number[] => {
  const pool = Array.from({ length: n }, (_, i) => i)
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng.next() * (n - i))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
  }
  return pool.slice(0, k)
}
