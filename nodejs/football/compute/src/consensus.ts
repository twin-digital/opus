import type { PlayerId, Position, SeasonProjection, StatKey } from '@twin-digital/football-data'

import { debiasSourcePoints, type SourcePoints } from './debias.js'
import { TUNING } from './tuning.js'

/** Median: robust to an outlier source once three or more report; equals the mean for two. */
const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

const groupBySource = (projections: SeasonProjection[], season: number): Map<PlayerId, SeasonProjection[]> => {
  const bySource = new Map<PlayerId, SeasonProjection[]>()
  for (const row of projections) {
    if (row.source === 'consensus' || row.season !== season) {
      continue
    }
    const list = bySource.get(row.playerId)
    if (list === undefined) {
      bySource.set(row.playerId, [row])
    } else {
      list.push(row)
    }
  }
  return bySource
}

const medianStats = (rows: SeasonProjection[]): Partial<Record<StatKey, number>> => {
  const byStat = new Map<StatKey, number[]>()
  for (const row of rows) {
    for (const [key, value] of Object.entries(row.stats) as [StatKey, number][]) {
      const values = byStat.get(key)
      if (values === undefined) {
        byStat.set(key, [value])
      } else {
        values.push(value)
      }
    }
  }
  const stats: Partial<Record<StatKey, number>> = {}
  for (const [key, values] of byStat) {
    stats[key] = median(values)
  }
  return stats
}

const medianGamesPlayed = (rows: SeasonProjection[]): number | null => {
  const gamesPlayed = rows.map((row) => row.gamesPlayed).filter((g): g is number => g !== null)
  return gamesPlayed.length > 0 ? median(gamesPlayed) : null
}

/**
 * Collapse per-source projection rows into one `source: 'consensus'` row per player: per-stat
 * median across the sources that carry the stat. Sources cover very different player pools
 * (Sleeper ~3100, ESPN ~510), so consensus is over whatever exists — single-source players pass
 * through unchanged. `prescored` stays empty: it exists to cross-check sources, and consensus
 * has no source of its own.
 */
export const buildConsensus = (projections: SeasonProjection[], season: number): SeasonProjection[] => {
  const consensus: SeasonProjection[] = []
  for (const [playerId, rows] of groupBySource(projections, season)) {
    consensus.push({
      playerId,
      source: 'consensus',
      season,
      gamesPlayed: medianGamesPlayed(rows),
      stats: medianStats(rows),
      prescored: {},
    })
  }
  return consensus
}

/** League context the v2 aggregation needs beyond the projection rows themselves. */
export interface ConsensusContext {
  /** League-scored points for a stat line (the compiled league scorer). */
  score: (stats: Partial<Record<StatKey, number>>) => number
  positionById: Map<PlayerId, Position>
  /** FP expert-panel dispersion, where ECR exists. */
  ecrById: Map<PlayerId, { rank: number; stdDev: number }>
}

export interface ConsensusSignals {
  /** Non-consensus projection rows this player has. */
  sourceCount: number
  /** max−min of debiased league-scored points across sources; null under two sources. */
  residualSpread: number | null
  /** residualSpread ≥ TUNING.CONTESTED_THRESHOLD. */
  contested: boolean
}

export interface ConsensusV2Result {
  rows: SeasonProjection[]
  signals: Map<PlayerId, ConsensusSignals>
}

/** k = clamp(K_BASE · (stdDev/√rank)/STD_NORM_REF, K_MIN, K_MAX); no ECR → K_BASE. */
const shrinkageK = (ecr: { rank: number; stdDev: number } | undefined): number => {
  const scaler = ecr === undefined ? 1 : ecr.stdDev / Math.sqrt(Math.max(ecr.rank, 1)) / TUNING.STD_NORM_REF
  return Math.min(Math.max(TUNING.K_BASE * scaler, TUNING.K_MIN), TUNING.K_MAX)
}

/**
 * Consensus v2: debias every source's league-scored points by rank band (see debias.ts), then
 * pick a points target per player — FP-anchored shrinkage where an FP row exists, median of the
 * debiased sources otherwise:
 *
 *   target = FP + k·(weighted_mean(sleeper·1.0, espn·0.5) − FP)
 *
 * FP is a ~110-expert aggregate; the others shrink it, never outvote it. k scales with FP's own
 * panel dispersion (ecr.stdDev normalized by √rank — tight panel barely moves, torn panel moves
 * meaningfully) and stays clamped to [K_MIN, K_MAX]. The stored row keeps the per-stat-median
 * stat line, uniformly scaled so the league scorer reproduces the target points — uniform scaling
 * is approximate for mixed-sign stat lines but keeps the SeasonProjection shape unchanged.
 * Players whose position is unknown pass through as the plain per-stat median.
 */
export const buildConsensusV2 = (
  projections: SeasonProjection[],
  season: number,
  context: ConsensusContext,
): ConsensusV2Result => {
  const bySource = groupBySource(projections, season)

  const sourceRows: SourcePoints[] = []
  for (const [playerId, rows] of bySource) {
    const position = context.positionById.get(playerId)
    if (position === undefined) {
      continue
    }
    for (const row of rows) {
      sourceRows.push({ playerId, source: row.source, position, points: context.score(row.stats) })
    }
  }
  const { byPlayer: debiased } = debiasSourcePoints(sourceRows)

  const consensus: SeasonProjection[] = []
  const signals = new Map<PlayerId, ConsensusSignals>()
  for (const [playerId, rows] of bySource) {
    let stats = medianStats(rows)
    let residualSpread: number | null = null

    const points = debiased.get(playerId)
    if (points !== undefined && points.size > 0) {
      const fp = points.get('fantasypros')
      const others = [...points].filter(([source]) => source !== 'fantasypros')
      let target: number
      if (fp !== undefined && others.length > 0) {
        let weightSum = 0
        let sum = 0
        for (const [source, value] of others) {
          const weight = source === 'espn' ? TUNING.ESPN_WEIGHT : 1
          weightSum += weight
          sum += weight * value
        }
        target = fp + shrinkageK(context.ecrById.get(playerId)) * (sum / weightSum - fp)
      } else if (fp !== undefined) {
        target = fp
      } else {
        target = median([...points.values()])
      }

      const base = context.score(stats)
      if (base > 1e-6) {
        const scale = target / base
        const scaled: Partial<Record<StatKey, number>> = {}
        for (const [key, value] of Object.entries(stats) as [StatKey, number][]) {
          scaled[key] = value * scale
        }
        stats = scaled
      }
      if (points.size >= 2) {
        const values = [...points.values()]
        residualSpread = Math.max(...values) - Math.min(...values)
      }
    }

    signals.set(playerId, {
      sourceCount: rows.length,
      residualSpread,
      contested: residualSpread !== null && residualSpread >= TUNING.CONTESTED_THRESHOLD,
    })
    consensus.push({
      playerId,
      source: 'consensus',
      season,
      gamesPlayed: medianGamesPlayed(rows),
      stats,
      prescored: {},
    })
  }
  return { rows: consensus, signals }
}
