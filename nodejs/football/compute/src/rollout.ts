import type { LeagueSettings, LineupSlot, PlayerId, Position } from '@twin-digital/football-data'

import type { BoardState } from './board.js'
import { buildConsensusV2 } from './consensus.js'
import { overallPicksForSlot } from './draft-math.js'
import { applyOverrides, type PlayerOverride } from './overrides.js'
import { buildLeagueScorer } from './rescore.js'
import { argmaxTake, countTeamPositions, teamAtPick, type PositionCounts, type RoomProfiles } from './room-profiles.js'
import { roomAdp } from './room.js'
import { bestLineup, lineupTotalWithReplacement } from './roster.js'
import { computeUpsideScores } from './upside.js'
import { computeReplacementLevels, type ReplacementLevel } from './vor.js'

const SKILL_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const

/** The upside slate lane only seats players with a real room price inside the draft horizon. */
const UPSIDE_LANE_MAX_ADP = 175
type SkillPosition = (typeof SKILL_POSITIONS)[number]
const SKILL_SET = new Set<Position>(SKILL_POSITIONS)

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
  /**
   * Per-team opponent profiles: room segments become per-team argmax takeProbability instead of
   * global roomAdp order. Omit for the pure-ADP room model.
   */
  profiles?: RoomProfiles
}

/** Everything a profile-aware segment needs to know who picks at each overall pick. */
export interface RoomSegmentModel {
  profiles: RoomProfiles
  /** Round-1 teamId order of the snake draft (LeagueSettings.draft.pickOrder). */
  pickOrder: number[]
  /**
   * Per-simulation positional memory (teamId → position → takes on this path): spends each
   * team's pos-boosts and drives the ROOM_NEED multipliers. Rollouts seed one per simulated
   * draft from the live picks; absent = boosts always active, no need shaping.
   */
  positionCounts?: Map<number, PositionCounts>
}

export interface RosterState {
  players: RolloutPlayer[]
  lineupSlots: LeagueSettings['lineupSlots']
  /** Baseline an open starting seat is worth; defaults to 0 per position when absent. */
  replacementPoints?: Partial<Record<Position, number>>
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
  /** Explicit candidate slate; default = top `count` by VOR + top-3 per position + the upside lane. */
  candidates?: PlayerId[]
  count?: number
  /** Upside lane of the default slate: top-N by upsideScore among priced availables (default 10). */
  upsideCount?: number
}

// -- pool -------------------------------------------------------------------

interface Pool {
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

const buildPool = (state: BoardState, options: RolloutOptions = {}): Pool => {
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

// -- my picks ---------------------------------------------------------------

/** RB/WR absorb FLEX and real depth; QB/TE stop at one backup. Structural anti-hoarding. */
const positionCaps = (lineupSlots: LeagueSettings['lineupSlots']): Record<SkillPosition, number> => ({
  QB: lineupSlots.QB + 1,
  RB: lineupSlots.RB + lineupSlots.FLEX + 3,
  WR: lineupSlots.WR + lineupSlots.FLEX + 3,
  TE: lineupSlots.TE + 1,
})

/**
 * Need-aware pick for my simulated turns. Starting seats are chosen by marginal starter points
 * over a replacement-filled baseline — an open seat is already worth a freely available player,
 * so a 180-pt QB over a 170-pt replacement loses to a 150-pt RB over a 60-pt one. When no seat
 * improves on replacement (bench territory), bench seats are lottery tickets: choose by upside
 * score, points as tiebreak. Position caps stop hoarding structurally.
 */
export const chooseForRoster = (
  available: RolloutPlayer[],
  roster: RosterState,
  upsideScores: Map<PlayerId, number>,
): RolloutPlayer | null => {
  const caps = positionCaps(roster.lineupSlots)
  const counts: Partial<Record<Position, number>> = {}
  for (const player of roster.players) {
    counts[player.position] = (counts[player.position] ?? 0) + 1
  }
  const replacementPoints = roster.replacementPoints ?? {}
  const openPositions = SKILL_POSITIONS.filter((position) => (counts[position] ?? 0) < caps[position])
  const skill = available.filter((player) => player.points !== null && SKILL_SET.has(player.position))

  const baseTotal = lineupTotalWithReplacement(roster.players, roster.lineupSlots, replacementPoints)
  let bestStarter: RolloutPlayer | null = null
  let bestMarginal = 1e-6
  for (const position of openPositions) {
    // Within a position the top-points player maximizes marginal, so only he needs checking.
    let top: RolloutPlayer | null = null
    for (const player of skill) {
      if (player.position === position && (top === null || (player.points as number) > (top.points as number))) {
        top = player
      }
    }
    if (top === null) {
      continue
    }
    const marginal =
      lineupTotalWithReplacement([...roster.players, top], roster.lineupSlots, replacementPoints) - baseTotal
    if (marginal > bestMarginal) {
      bestMarginal = marginal
      bestStarter = top
    }
  }
  if (bestStarter !== null) {
    return bestStarter
  }

  // Caps only bind while a cap-legal player exists; a draft pick can't be passed.
  const capped = skill.filter((player) => openPositions.includes(player.position as SkillPosition))
  const benchPool = capped.length > 0 ? capped : skill
  let bestBench: RolloutPlayer | null = null
  for (const player of benchPool) {
    if (bestBench === null) {
      bestBench = player
      continue
    }
    const score = upsideScores.get(player.playerId) ?? player.upsideScore ?? 0
    const bestScore = upsideScores.get(bestBench.playerId) ?? bestBench.upsideScore ?? 0
    if (score > bestScore || (score === bestScore && (player.points ?? 0) > (bestBench.points ?? 0))) {
      bestBench = player
    }
  }
  return bestBench
}

// -- the room ---------------------------------------------------------------

const byRoomAdp = (a: RolloutPlayer, b: RolloutPlayer): number =>
  (a.roomAdp ?? Number.POSITIVE_INFINITY) - (b.roomAdp ?? Number.POSITIVE_INFINITY) ||
  (b.points ?? 0) - (a.points ?? 0) ||
  a.playerId.localeCompare(b.playerId)

/**
 * Mean-path room behavior: picks fromPick..toPick−1 remove players, skipping players I hold,
 * and return the remaining pool. Without a model, the top toPick−fromPick players come off in
 * roomAdp order (nulls last). With a model, each pick removes the on-clock team's argmax
 * takeProbability player — per-team σ, positional timing, and loyalty included — so the mean
 * path is per-team, still deterministic.
 */
export const simulateRoomSegment = (
  available: RolloutPlayer[],
  fromPick: number,
  toPick: number,
  heldIds: Set<PlayerId> = new Set(),
  model?: RoomSegmentModel,
): RolloutPlayer[] => {
  const count = Math.max(0, toPick - fromPick)
  if (count === 0) {
    return available
  }
  const taken = new Set<PlayerId>()
  if (model !== undefined) {
    let pool = available.filter((player) => !heldIds.has(player.playerId))
    for (let pick = fromPick; pick < toPick; pick += 1) {
      const teamId = teamAtPick(model.pickOrder, pick)
      const choice = argmaxTake(model.profiles, model.pickOrder, pick, pool, model.positionCounts?.get(teamId))
      if (choice !== null) {
        taken.add(choice.playerId)
        pool = pool.filter((player) => player.playerId !== choice.playerId)
        if (model.positionCounts !== undefined) {
          const counts = model.positionCounts.get(teamId) ?? new Map<Position, number>()
          counts.set(choice.position, (counts.get(choice.position) ?? 0) + 1)
          model.positionCounts.set(teamId, counts)
        }
      }
    }
    return available.filter((player) => !taken.has(player.playerId))
  }
  for (const player of [...available].sort(byRoomAdp)) {
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

const rolloutOnPool = (
  pool: Pool,
  myRosterIds: PlayerId[],
  fromOverallPick: number,
  myDraftSlot: number,
  model?: RoomSegmentModel,
): RolloutResult => {
  const { settings } = pool
  const held = new Set(myRosterIds)
  const roster: RolloutPlayer[] = []
  for (const id of myRosterIds) {
    const player = pool.byId.get(id)
    if (player !== undefined) {
      roster.push(player)
    }
  }
  let available = pool.all.filter(
    (player) =>
      !pool.drafted.has(player.playerId) && !held.has(player.playerId) && !pool.bannedIds.has(player.playerId),
  )

  const myPicks = overallPicksForSlot(myDraftSlot, settings.size, pool.totalRounds).filter(
    (pick) => pick >= fromOverallPick,
  )
  // Fresh positional memory per simulated draft (live-pick seed cloned): candidate rollouts
  // must not share or mutate each other's counts.
  const liveModel =
    model === undefined ? undefined : (
      {
        ...model,
        positionCounts: new Map(
          [...(model.positionCounts ?? new Map<number, PositionCounts>())].map(([teamId, counts]) => [
            teamId,
            new Map(counts),
          ]),
        ),
      }
    )
  let cursor = fromOverallPick
  for (const pick of myPicks) {
    if (roster.filter((player) => SKILL_SET.has(player.position)).length >= pool.skillRounds) {
      break
    }
    available = simulateRoomSegment(available, cursor, pick, undefined, liveModel)
    const choice = chooseForRoster(
      available,
      { players: roster, lineupSlots: settings.lineupSlots, replacementPoints: pool.replacement.points },
      pool.upsideScores,
    )
    if (choice !== null) {
      roster.push(choice)
      available = available.filter((player) => player.playerId !== choice.playerId)
    }
    cursor = pick + 1
  }

  const starterTotal = lineupTotalWithReplacement(roster, settings.lineupSlots, pool.replacement.points)
  const lineup = bestLineup(roster, settings.lineupSlots)
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
const segmentModel = (state: BoardState, options: RolloutOptions): RoomSegmentModel | undefined => {
  if (options.profiles === undefined) {
    return undefined
  }
  const positionById = new Map(state.players.map((player) => [player.id, player.position]))
  // Live picks seed the per-team position counts; unknown teams (manual marks) count for no one.
  const livePicks = (state.teamPicks ?? []).flatMap((pick) => {
    const position = positionById.get(pick.playerId)
    return pick.teamId === null || position === undefined ? [] : [{ teamId: pick.teamId, position }]
  })
  return {
    profiles: options.profiles,
    pickOrder: state.settings.draft.pickOrder,
    positionCounts: countTeamPositions(livePicks),
  }
}

export const rolloutFrom = (
  state: BoardState,
  myRoster: PlayerId[],
  fromOverallPick: number,
  options: RolloutOptions = {},
): RolloutResult =>
  rolloutOnPool(buildPool(state, options), myRoster, fromOverallPick, state.myDraftSlot, segmentModel(state, options))

/**
 * One rollout per candidate, each assuming the candidate is taken with the pick on the clock.
 * Sorted by estTeamScore descending; banned players never enter, boosts are already in the
 * points. Default slate: top `count` (40) by VOR, top-3 at each skill position, and the top
 * `upsideCount` (10) by upsideScore among priced availables.
 */
export const evaluateCandidates = (state: BoardState, options: EvaluateOptions = {}): CandidateEvaluation[] => {
  const pool = buildPool(state, options)
  const model = segmentModel(state, options)
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
    // Upside lane: the VOR cut is mean-biased and can drop lottery tickets late in a draft,
    // exactly when upside becomes the ranking key; priced high-upside availables get a rollout.
    // The lane needs a price this room could actually pay: a real room ADP inside the draft
    // horizon (roomAdp already nulls ESPN's 169.5 undrafted sentinel). Upside scores already
    // require a real price at the pool level (UPSIDE.MAX_REAL_ADP); this is the lane's own belt.
    const byUpside = eligible
      .filter(
        (player) => player.upsideScore !== null && player.roomAdp !== null && player.roomAdp <= UPSIDE_LANE_MAX_ADP,
      )
      .sort((a, b) => (b.upsideScore ?? 0) - (a.upsideScore ?? 0))
    for (const player of byUpside.slice(0, options.upsideCount ?? 10)) {
      if (!included.has(player.playerId)) {
        included.add(player.playerId)
        slate.push(player)
      }
    }
    candidateIds = slate.map((player) => player.playerId)
  }

  const evaluations = candidateIds.flatMap((id) => {
    const candidate = pool.byId.get(id)
    if (candidate === undefined) {
      return []
    }
    const result = rolloutOnPool(pool, [...myIds, id], currentOverall + 1, state.myDraftSlot, model)
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
