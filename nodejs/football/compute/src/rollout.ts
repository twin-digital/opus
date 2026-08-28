import type { LeagueSettings, LineupSlot, PlayerId, Position } from '@twin-digital/football-data'

import type { BoardState } from './board.js'
import { buildConsensusV2 } from './consensus.js'
import { applyOverrides, type PlayerOverride } from './overrides.js'
import { buildLeagueScorer } from './rescore.js'
import { roomAdp } from './room.js'
import { bestLineup, lineupTotalWithReplacement } from './roster.js'
import { chooseForRoster, type RosterState } from './sim/marginal.js'
import { makeRng } from './sim/rng.js'
import { completeDraft } from './sim/scorers.js'
import {
  compareByRoomAdp,
  makeDraftState,
  makeSimPool,
  rosterOf,
  SKILL_POSITIONS,
  SKILL_SET,
  type SimPool,
} from './sim/state.js'
import { computeUpsideScores } from './upside.js'
import { computeReplacementLevels, type ReplacementLevel } from './vor.js'

// The marginal chooser and its roster shape live in the strategy layer now; these exports
// are the frozen API's original names for them.
export { chooseForRoster, type RosterState }

export interface RolloutPlayer {
  playerId: PlayerId
  name: string
  position: Position
  /** League points with boosts applied; null = no stat-line projection (K/DST, deep names). */
  points: number | null
  roomAdp: number | null
  vor: number | null
  upsideScore: number | null
}

export interface Benchmarks {
  /** Best-possible starter total from the pool (skill seats; K/DST carry no projections and are excluded). */
  ceiling: number
  /** Starter total of a team fielding replacement level at every skill seat. */
  replacement: number
}

export interface RolloutOptions {
  overrides?: PlayerOverride[]
}

export interface RolloutResult {
  finalRoster: (RolloutPlayer & { slot: LineupSlot })[]
  starterTotal: number
  captureRatio: number
}

export interface CandidateEvaluation {
  playerId: PlayerId
  name: string
  position: Position
  points: number | null
  vor: number | null
  /** Projected final starter total if this candidate is taken now. */
  estTeamScore: number
  captureRatio: number
  /** estTeamScore − the top candidate's (≤ 0); the trustworthy part of the rollout. */
  deltaVsBest: number
  /** Where the candidate himself ends up in the final best lineup. */
  landsOn: LineupSlot
  upsideScore: number | null
}

export interface EvaluateOptions extends RolloutOptions {
  /** Explicit candidate slate; default = top `count` by VOR plus top-3 per position. */
  candidates?: PlayerId[]
  count?: number
}

// -- pool -------------------------------------------------------------------

export interface Pool {
  settings: LeagueSettings
  /** Every projected-or-priced player, drafted included — valuations stay stable over it. */
  all: RolloutPlayer[]
  byId: Map<PlayerId, RolloutPlayer>
  replacement: ReplacementLevel
  benchmarks: Benchmarks
  upsideScores: Map<PlayerId, number>
  bannedIds: Set<PlayerId>
  drafted: Set<PlayerId>
  totalRounds: number
  skillRounds: number
}

/** Non-IR roster seats = draft rounds; skill rounds leave the K/DST seats to autopicks. */
const roundCounts = (lineupSlots: LeagueSettings['lineupSlots']): { total: number; skill: number } => {
  const total = Object.entries(lineupSlots).reduce((sum, [slot, count]) => (slot === 'IR' ? sum : sum + count), 0)
  return { total, skill: total - lineupSlots.K - lineupSlots.DST }
}

export const buildPool = (state: BoardState, options: RolloutOptions = {}): Pool => {
  const { settings } = state
  const scorer = buildLeagueScorer(settings.scoringRules, () => undefined)
  const playerById = new Map(state.players.map((player) => [player.id, player]))
  const marketById = new Map(state.market.map((row) => [row.playerId, row]))
  const { rows: consensus } = buildConsensusV2(state.projections, state.season, {
    score: scorer.score,
    positionById: new Map(state.players.map((player) => [player.id, player.position])),
    ecrById: new Map(
      state.market.flatMap((row) =>
        row.ecr === null ? [] : [[row.playerId, { rank: row.ecr.rank, stdDev: row.ecr.stdDev }] as const],
      ),
    ),
  })

  const scored: { playerId: PlayerId; position: Position; points: number | null }[] = []
  const seen = new Set<PlayerId>()
  for (const row of consensus) {
    const player = playerById.get(row.playerId)
    if (player === undefined) {
      continue
    }
    seen.add(row.playerId)
    scored.push({ playerId: row.playerId, position: player.position, points: scorer.score(row.stats) })
  }
  for (const market of state.market) {
    const player = playerById.get(market.playerId)
    if (player === undefined || seen.has(market.playerId)) {
      continue
    }
    seen.add(market.playerId)
    scored.push({ playerId: market.playerId, position: player.position, points: null })
  }

  const { rows: boosted, bannedIds } = applyOverrides(scored, options.overrides ?? [])
  const projected = boosted.filter(
    (row): row is { playerId: PlayerId; position: Position; points: number } => row.points !== null,
  )
  const replacement = computeReplacementLevels(projected, settings.lineupSlots, settings.size)
  // No residual spreads here: source disagreement feeds human-facing signals, never rollout rankings.
  const upsideScores = computeUpsideScores(state.market)

  const all: RolloutPlayer[] = boosted.map((row) => {
    const player = playerById.get(row.playerId) as { name: string }
    const market = marketById.get(row.playerId)
    const level = row.points !== null ? replacement.points[row.position] : undefined
    return {
      playerId: row.playerId,
      name: player.name,
      position: row.position,
      points: row.points,
      roomAdp: market !== undefined ? roomAdp(market) : null,
      vor: row.points !== null && level !== undefined ? row.points - level : null,
      upsideScore: upsideScores.get(row.playerId) ?? null,
    }
  })

  const rounds = roundCounts(settings.lineupSlots)
  return {
    settings,
    all,
    byId: new Map(all.map((row) => [row.playerId, row])),
    replacement,
    benchmarks: benchmarksForPool(all, settings.lineupSlots, replacement),
    upsideScores,
    bannedIds,
    drafted: new Set(state.draftedPlayerIds),
    totalRounds: rounds.total,
    skillRounds: rounds.skill,
  }
}

/** The board pool as a strategy-layer SimPool (drafted and banned players unavailable). */
export const simPoolFromPool = (pool: Pool): SimPool => {
  const unavailable = new Set(pool.drafted)
  for (const id of pool.bannedIds) {
    unavailable.add(id)
  }
  return makeSimPool({
    players: pool.all,
    teams: pool.settings.size,
    rounds: pool.totalRounds,
    lineupSlots: pool.settings.lineupSlots,
    replacementPoints: pool.replacement.points,
    benchmarks: pool.benchmarks,
    upsideScores: pool.upsideScores,
    unavailable,
  })
}

// -- benchmarks -------------------------------------------------------------

/** Ceiling = best lineup over the whole pool; replacement = every skill seat at replacement level. */
export const benchmarksForPool = (
  pool: { playerId: PlayerId; position: Position; points: number | null }[],
  lineupSlots: LeagueSettings['lineupSlots'],
  replacement: ReplacementLevel,
): Benchmarks => ({
  ceiling: bestLineup(pool, lineupSlots).total,
  replacement: lineupTotalWithReplacement([], lineupSlots, replacement.points),
})

/** {ceiling, replacement} starter totals for the state's projected pool (overrides applied). */
export const computeBenchmarks = (state: BoardState, options: RolloutOptions = {}): Benchmarks =>
  buildPool(state, options).benchmarks

/** (team − replacement) / (ceiling − replacement): the live draft grade, 0–1ish. */
export const captureRatio = (starterTotal: number, benchmarks: Benchmarks): number => {
  const range = benchmarks.ceiling - benchmarks.replacement
  return range <= 0 ? 0 : (starterTotal - benchmarks.replacement) / range
}

// -- the room ---------------------------------------------------------------

/**
 * Mean-path room behavior: picks fromPick..toPick−1 remove the top toPick−fromPick players in
 * roomAdp order (nulls last), skipping players I hold. Returns the remaining pool. The order
 * is `compareByRoomAdp` — the same comparator `adpPolicy` walks, so a segment removal equals
 * that many sequential ADP-policy picks.
 */
export const simulateRoomSegment = (
  available: RolloutPlayer[],
  fromPick: number,
  toPick: number,
  heldIds: Set<PlayerId> = new Set(),
): RolloutPlayer[] => {
  const count = Math.max(0, toPick - fromPick)
  if (count === 0) {
    return available
  }
  const taken = new Set<PlayerId>()
  for (const player of [...available].sort(compareByRoomAdp)) {
    if (taken.size >= count) {
      break
    }
    if (!heldIds.has(player.playerId)) {
      taken.add(player.playerId)
    }
  }
  return available.filter((player) => !taken.has(player.playerId))
}

// -- rollout ----------------------------------------------------------------

/**
 * One deterministic rollout on the strategy layer: enter the draft at `fromOverallPick`
 * holding `myRosterIds`, let the default simulating-scorer policies play it out (mean-path
 * ADP room, marginal chooser for my picks), and read my final roster back.
 */
const rolloutOnSimPool = (
  pool: Pool,
  simPool: SimPool,
  myRosterIds: PlayerId[],
  fromOverallPick: number,
  myDraftSlot: number,
): RolloutResult => {
  const state = makeDraftState(simPool, {
    baseOverall: fromOverallPick,
    initialRosters: new Map([[myDraftSlot, myRosterIds]]),
  })
  const final = completeDraft(state, myDraftSlot, makeRng(0))
  const roster = rosterOf(final, myDraftSlot)
  const starterTotal = lineupTotalWithReplacement(roster, pool.settings.lineupSlots, pool.replacement.points)
  const lineup = bestLineup(roster, pool.settings.lineupSlots)
  return {
    finalRoster: roster.map((player) => ({ ...player, slot: lineup.slotByPlayer.get(player.playerId) ?? 'BENCH' })),
    starterTotal,
    captureRatio: captureRatio(starterTotal, pool.benchmarks),
  }
}

/**
 * Deterministic rollout from `fromOverallPick`: alternate mean-path room segments with my picks
 * (overallPicksForSlot) until the last round or my roster's skill seats fill. Absolutes carry
 * false confidence — deltas between rollouts are the trustworthy part.
 */
export const rolloutFrom = (
  state: BoardState,
  myRoster: PlayerId[],
  fromOverallPick: number,
  options: RolloutOptions = {},
): RolloutResult => {
  const pool = buildPool(state, options)
  return rolloutOnSimPool(pool, simPoolFromPool(pool), myRoster, fromOverallPick, state.myDraftSlot)
}

/**
 * One rollout per candidate, each assuming the candidate is taken with the pick on the clock.
 * Sorted by estTeamScore descending; banned players never enter, boosts are already in the
 * points. Default slate: top `count` (40) by VOR plus top-3 at each skill position.
 */
export const evaluateCandidates = (state: BoardState, options: EvaluateOptions = {}): CandidateEvaluation[] => {
  const pool = buildPool(state, options)
  const simPool = simPoolFromPool(pool)
  const currentOverall = state.draftedPlayerIds.length + 1
  const myIds = state.myDraftedPlayerIds ?? []
  const held = new Set(myIds)

  let candidateIds: PlayerId[]
  if (options.candidates !== undefined) {
    candidateIds = options.candidates.filter((id) => pool.byId.has(id) && !pool.bannedIds.has(id))
  } else {
    const eligible = pool.all
      .filter(
        (player) =>
          player.points !== null &&
          SKILL_SET.has(player.position) &&
          !pool.drafted.has(player.playerId) &&
          !held.has(player.playerId) &&
          !pool.bannedIds.has(player.playerId),
      )
      .sort((a, b) => (b.vor ?? Number.NEGATIVE_INFINITY) - (a.vor ?? Number.NEGATIVE_INFINITY))
    const slate = eligible.slice(0, options.count ?? 40)
    const included = new Set(slate.map((player) => player.playerId))
    for (const position of SKILL_POSITIONS) {
      for (const player of eligible.filter((p) => p.position === position).slice(0, 3)) {
        if (!included.has(player.playerId)) {
          included.add(player.playerId)
          slate.push(player)
        }
      }
    }
    candidateIds = slate.map((player) => player.playerId)
  }

  const evaluations = candidateIds.flatMap((id) => {
    const candidate = pool.byId.get(id)
    if (candidate === undefined) {
      return []
    }
    const result = rolloutOnSimPool(pool, simPool, [...myIds, id], currentOverall + 1, state.myDraftSlot)
    return [
      {
        playerId: id,
        name: candidate.name,
        position: candidate.position,
        points: candidate.points,
        vor: candidate.vor,
        estTeamScore: result.starterTotal,
        captureRatio: result.captureRatio,
        deltaVsBest: 0,
        landsOn: result.finalRoster.find((player) => player.playerId === id)?.slot ?? 'BENCH',
        upsideScore: candidate.upsideScore,
      },
    ]
  })

  evaluations.sort((a, b) => b.estTeamScore - a.estTeamScore)
  const best = evaluations[0]?.estTeamScore ?? 0
  for (const evaluation of evaluations) {
    evaluation.deltaVsBest = evaluation.estTeamScore - best
  }
  return evaluations
}
