export interface TierOptions {
  /** Players considered for break detection; everyone deeper lands in one trailing tier. */
  poolSize?: number
  /** Break sensitivity: a drop beyond mean + z·stddev of the pool's drops starts a new tier. */
  z?: number
}

/**
 * Gap-based tiers over a position's points, sorted descending. Natural breaks: a new tier starts
 * where the drop to the next player exceeds mean + z·stddev of the consecutive drops within the
 * draft-relevant pool — so the threshold scales with the position's own variance, and flat
 * positions (QB mid-tier plateaus) do not shatter into singletons. Returns 1-based tier numbers
 * aligned to the input order.
 */
export const assignTiers = (pointsDesc: number[], options: TierOptions = {}): number[] => {
  const poolSize = Math.min(pointsDesc.length, Math.max(2, options.poolSize ?? pointsDesc.length))
  const z = options.z ?? 1
  if (pointsDesc.length === 0) {
    return []
  }

  const gaps: number[] = []
  for (let i = 0; i < poolSize - 1; i += 1) {
    gaps.push((pointsDesc[i] as number) - (pointsDesc[i + 1] as number))
  }
  const mean = gaps.reduce((a, b) => a + b, 0) / Math.max(gaps.length, 1)
  const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(gaps.length, 1)
  const threshold = mean + z * Math.sqrt(variance)

  const tiers: number[] = [1]
  let tier = 1
  for (let i = 1; i < pointsDesc.length; i += 1) {
    if (i < poolSize) {
      if ((gaps[i - 1] as number) > threshold) {
        tier += 1
      }
    } else if (i === poolSize) {
      tier += 1 // everyone past the pool: one undifferentiated trailing tier
    }
    tiers.push(tier)
  }
  return tiers
}
