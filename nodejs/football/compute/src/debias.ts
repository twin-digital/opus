import type { PlayerId, Position } from '@twin-digital/football-data'

import { TUNING } from './tuning.js'

/** One source's league-scored points for one player. */
export interface SourcePoints {
  playerId: PlayerId
  source: string
  position: Position
  points: number
}

/** source → position → one multiplicative factor per rank band. */
export type DebiasFactors = Map<string, Map<Position, number[]>>

export interface DebiasResult {
  factors: DebiasFactors
  /** playerId → source → debiased league points. */
  byPlayer: Map<PlayerId, Map<string, number>>
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

/** 1-based positional rank → band index; the last band is open-ended. */
export const bandIndex = (positionalRank: number): number =>
  Math.min(Math.floor((positionalRank - 1) / TUNING.BAND_SIZE), TUNING.BAND_COUNT - 1)

const clampFactor = (factor: number): number => Math.min(Math.max(factor, TUNING.FACTOR_MIN), TUNING.FACTOR_MAX)

/**
 * Rank-band debiasing. Sources disagree by rank band, not by flat position offsets (ESPN runs
 * hot at the top of QB/RB/WR; Sleeper at the TE top), so: band each source's players by that
 * source's own positional ordering (1–12, 13–24, 25–36, 37+); within a band, each player
 * covered by ≥2 sources contributes the ratio (cross-source panel median / this source's
 * points); the band factor is the median ratio, clamped, and every point from that
 * source/position/band is multiplied by it. Bands with too few multi-source players — or only
 * near-zero points — keep factor 1, so single-source deep names pass through unchanged.
 */
export const debiasSourcePoints = (rows: SourcePoints[]): DebiasResult => {
  const panel = new Map<PlayerId, number[]>()
  for (const row of rows) {
    const points = panel.get(row.playerId)
    if (points === undefined) {
      panel.set(row.playerId, [row.points])
    } else {
      points.push(row.points)
    }
  }

  // Band assignment from each source's own ordering, points descending.
  const bySourcePosition = new Map<string, Map<Position, SourcePoints[]>>()
  for (const row of rows) {
    const positions = bySourcePosition.get(row.source) ?? new Map<Position, SourcePoints[]>()
    bySourcePosition.set(row.source, positions)
    const list = positions.get(row.position) ?? []
    positions.set(row.position, list)
    list.push(row)
  }

  const factors: DebiasFactors = new Map()
  const bandOf = new Map<SourcePoints, number>()
  for (const [source, positions] of bySourcePosition) {
    const byPosition = new Map<Position, number[]>()
    factors.set(source, byPosition)
    for (const [position, list] of positions) {
      list.sort((a, b) => b.points - a.points)
      const samples: number[][] = Array.from({ length: TUNING.BAND_COUNT }, () => [])
      list.forEach((row, index) => {
        const band = bandIndex(index + 1)
        bandOf.set(row, band)
        const panelPoints = panel.get(row.playerId) as number[]
        const panelMedian = median(panelPoints)
        if (panelPoints.length >= 2 && row.points >= TUNING.MIN_BAND_POINTS && panelMedian >= TUNING.MIN_BAND_POINTS) {
          ;(samples[band] as number[]).push(panelMedian / row.points)
        }
      })
      byPosition.set(
        position,
        samples.map((ratios) => (ratios.length >= TUNING.MIN_BAND_PLAYERS ? clampFactor(median(ratios)) : 1)),
      )
    }
  }

  const byPlayer = new Map<PlayerId, Map<string, number>>()
  for (const row of rows) {
    const factor = factors.get(row.source)?.get(row.position)?.[bandOf.get(row) as number] ?? 1
    const sources = byPlayer.get(row.playerId) ?? new Map<string, number>()
    byPlayer.set(row.playerId, sources)
    sources.set(row.source, row.points * factor)
  }
  return { factors, byPlayer }
}
