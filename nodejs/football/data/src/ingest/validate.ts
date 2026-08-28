import type { EspnKonaPlayer } from '../fetchers/espn.js'
import { summarizeEspnProjection } from '../fetchers/espn.js'
import type { FpProjectionRow } from '../fetchers/fantasypros-projections.js'
import type { SleeperProjectionRow } from '../fetchers/sleeper.js'
import { ESPN_PRO_TEAM_IDS, type NflTeam } from '../reference/nfl-team.js'
import { SCORING_FORMATS, type ScoringFormat } from '../reference/scoring-format.js'
import { ESPN_STAT_IDS, SLEEPER_STAT_FIELDS, type StatKey } from '../reference/stat-key.js'
import { ESPN_DEFAULT_PPR, SLEEPER_DEFAULT_PPR, scoreStats, type ScoringRuleSet } from '../scoring.js'

/** A mapping-assertion failure: the ingest is failed rather than storing silently wrong rows. */
export class ValidationError extends Error {
  constructor(check: string, culprit: string, detail: string) {
    super(`Validation failed [${check}] for ${culprit}: ${detail}`)
    this.name = 'ValidationError'
  }
}

export interface ValidationReport {
  sleeperChecked: number
  sleeperMaxDelta: number
  espnChecked: number
  espnMaxDelta: number
  proTeamSpotChecks: number
}

/** Sleeper prescores exactly from its own stat fields; beyond per-stat rounding = a broken map. */
const SLEEPER_TOLERANCE = 0.5
/** ESPN appliedTotal carries small unmapped residuals (misc return/recovery ids); a real mapping
 *  error (a whole stat miscounted) is tens of points over a season. Observed residual ≈ 0.07. */
const ESPN_TOLERANCE = 1.5

export const mapSleeperStats = (stats: Record<string, number>): Partial<Record<StatKey, number>> => {
  const mapped: Partial<Record<StatKey, number>> = {}
  for (const [field, value] of Object.entries(stats)) {
    const key = SLEEPER_STAT_FIELDS.get(field)
    if (key !== undefined) {
      mapped[key] = value
    }
  }
  return mapped
}

export const mapEspnStats = (stats: Record<string, number>): Partial<Record<StatKey, number>> => {
  const mapped: Partial<Record<StatKey, number>> = {}
  for (const [statId, value] of Object.entries(stats)) {
    const key = ESPN_STAT_IDS.get(Number(statId))
    if (key !== undefined) {
      mapped[key] = value
    }
  }
  return mapped
}

/** Cross-check our scoring of Sleeper stat lines against their own pts_ppr. */
export const validateSleeperPrescoring = (
  rows: { row: SleeperProjectionRow; name: string }[],
): { checked: number; maxDelta: number } => {
  let checked = 0
  let maxDelta = 0
  for (const { row, name } of rows) {
    const prescored: number | undefined = row.stats.pts_ppr
    if (prescored === undefined) {
      continue
    }
    // Two-way players (e.g. Travis Hunter) carry idp_* stats that Sleeper's own prescore counts;
    // the offense-only StatKey set cannot reproduce those, so they are not checkable.
    if (Object.keys(row.stats).some((key) => key.startsWith('idp_'))) {
      continue
    }
    const rescored = scoreStats(mapSleeperStats(row.stats), SLEEPER_DEFAULT_PPR)
    const delta = Math.abs(rescored - prescored)
    checked++
    maxDelta = Math.max(maxDelta, delta)
    if (delta > SLEEPER_TOLERANCE) {
      throw new ValidationError(
        'sleeper-prescored',
        name,
        `our PPR score ${rescored.toFixed(2)} vs Sleeper pts_ppr ${prescored.toFixed(2)} (delta ${delta.toFixed(2)})`,
      )
    }
  }
  return { checked, maxDelta }
}

/** ESPN's default scoring also counts kick/punt return TDs (statIds 101/102, outside the
 *  canonical StatKey set); the cross-check scores them so returners reconcile. */
const ESPN_EXTRA_SCORED_IDS: Record<string, number> = { '101': 6, '102': 6 }

/** Cross-check our scoring of ESPN weekly stat dicts against summed appliedTotal — the guard on
 *  the community-documented statId map. */
export const validateEspnPrescoring = (
  players: EspnKonaPlayer[],
  season: number,
): { checked: number; maxDelta: number } => {
  let checked = 0
  let maxDelta = 0
  for (const wrapper of players) {
    const player = wrapper.player
    if (player.defaultPositionId === 5 || player.defaultPositionId === 16) {
      continue
    } // K/DST vocab deferred
    const summary = summarizeEspnProjection(player.stats, season)
    if (!summary || summary.appliedTotal === 0) {
      continue
    }
    let rescored = scoreStats(mapEspnStats(summary.stats), ESPN_DEFAULT_PPR)
    for (const [statId, points] of Object.entries(ESPN_EXTRA_SCORED_IDS)) {
      rescored += (summary.stats[statId] ?? 0) * points
    }
    const delta = Math.abs(rescored - summary.appliedTotal)
    checked++
    maxDelta = Math.max(maxDelta, delta)
    if (delta > ESPN_TOLERANCE) {
      throw new ValidationError(
        'espn-applied-total',
        player.fullName,
        `our PPR score ${rescored.toFixed(2)} vs appliedTotal ${summary.appliedTotal.toFixed(2)} (delta ${delta.toFixed(2)})`,
      )
    }
  }
  if (checked === 0) {
    throw new ValidationError('espn-applied-total', 'espn projections', 'no players were checkable')
  }
  return { checked, maxDelta }
}

/** FantasyPros' own scoring, minus the reception value: matches ESPN defaults except
 *  interceptions (-1, verified against live FPTS). The reception value is the format under test. */
const FP_BASE_RULES: ScoringRuleSet = {
  passYd: 0.04,
  passTd: 4,
  passInt: -1,
  rushYd: 0.1,
  rushTd: 6,
  recYd: 0.1,
  recTd: 6,
  fumLost: -2,
}

const FP_REC_POINTS: Record<ScoringFormat, number> = { std: 0, half: 0.5, ppr: 1 }

/** Displayed stats are rounded to 0.1, so exact FPTS reproduction drifts; observed residual ≈ 0.47.
 *  The formats differ by 0.5 × receptions, far outside this for any fantasy-relevant receiver. */
const FP_TOLERANCE = 1.0

/**
 * Determine which scoring format the FPTS column carries by rescoring every row under each
 * format, and cross-check the column-order stat map at the same time. The page legend claims
 * Standard scoring but the served numbers disagree (half-PPR observed live), so the format is
 * trusted only when exactly one reproduces FPTS within tolerance.
 */
export const validateFantasyProsPrescoring = (
  rows: FpProjectionRow[],
): { checked: number; maxDelta: number; format: ScoringFormat } => {
  if (rows.length === 0) {
    throw new ValidationError('fantasypros-fpts', 'fantasypros projections', 'no rows were checkable')
  }
  const deltas = new Map<ScoringFormat, number>()
  for (const format of SCORING_FORMATS) {
    const rules: ScoringRuleSet = { ...FP_BASE_RULES, rec: FP_REC_POINTS[format] }
    let maxDelta = 0
    for (const row of rows) {
      maxDelta = Math.max(maxDelta, Math.abs(scoreStats(row.stats, rules) - row.fpts))
    }
    deltas.set(format, maxDelta)
  }
  const matching = SCORING_FORMATS.filter((format) => (deltas.get(format) ?? Infinity) <= FP_TOLERANCE)
  const summary = SCORING_FORMATS.map((f) => `${f}: ${(deltas.get(f) ?? Infinity).toFixed(2)}`).join(', ')
  if (matching.length === 0) {
    throw new ValidationError(
      'fantasypros-fpts',
      'fantasypros projections',
      `no scoring format reproduces FPTS (max deltas — ${summary})`,
    )
  }
  if (matching.length > 1) {
    // Only possible when no row carries receptions — a structural anomaly, not a real sample.
    throw new ValidationError(
      'fantasypros-fpts',
      'fantasypros projections',
      `scoring format is ambiguous (max deltas — ${summary})`,
    )
  }
  const format = matching[0] as ScoringFormat
  return { checked: rows.length, maxDelta: deltas.get(format) ?? 0, format }
}

/** Long-tenured players whose team should not move; guards the community-documented proTeamId map. */
const PRO_TEAM_SPOT_CHECKS: { espnId: number; name: string; team: NflTeam }[] = [
  { espnId: 3139477, name: 'Patrick Mahomes', team: 'KC' },
  { espnId: 3918298, name: 'Josh Allen', team: 'BUF' },
  { espnId: 4262921, name: 'Justin Jefferson', team: 'MIN' },
  { espnId: 4241389, name: 'CeeDee Lamb', team: 'DAL' },
  { espnId: 4430807, name: 'Bijan Robinson', team: 'ATL' },
]

export const validateEspnProTeams = (players: EspnKonaPlayer[]): number => {
  let found = 0
  for (const check of PRO_TEAM_SPOT_CHECKS) {
    const wrapper = players.find((p) => p.player.id === check.espnId)
    if (!wrapper) {
      continue
    }
    found++
    const mapped: NflTeam | undefined = ESPN_PRO_TEAM_IDS[wrapper.player.proTeamId]
    if (mapped !== check.team) {
      throw new ValidationError(
        'espn-pro-team-map',
        check.name,
        `proTeamId ${wrapper.player.proTeamId} maps to ${mapped ?? 'unknown'}, expected ${check.team}`,
      )
    }
  }
  if (found < 3) {
    throw new ValidationError('espn-pro-team-map', 'spot checks', `only ${found}/5 known players present in the fetch`)
  }
  return found
}
