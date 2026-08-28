import type { BoardRow } from '@twin-digital/football-compute'
import type { Position } from '@twin-digital/football-data'

export interface TierScarcity {
  position: Position
  /** The best (lowest-numbered) tier with anyone still available. */
  tier: number
  remaining: number
}

/** Per position, how many players remain in the current top tier. Rows are the available set. */
export const tierScarcity = (rows: BoardRow[]): TierScarcity[] => {
  const result: TierScarcity[] = []
  for (const position of ['QB', 'RB', 'WR', 'TE'] as const) {
    const tiers = rows.filter((row) => row.position === position && row.tier !== null).map((row) => row.tier as number)
    if (tiers.length === 0) {
      continue
    }
    const top = Math.min(...tiers)
    result.push({ position, tier: top, remaining: tiers.filter((tier) => tier === top).length })
  }
  return result
}
