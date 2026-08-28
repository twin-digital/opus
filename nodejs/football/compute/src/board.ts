import type {
  InjuryStatus,
  LeagueSettings,
  MarketData,
  NflTeam,
  Player,
  PlayerId,
  Position,
  SeasonProjection,
} from '@twin-digital/football-data'

import { buildConsensusV2 } from './consensus.js'
import { planningAdp, sigmaForPick, makeItBackOdds, upcomingPicksForSlot, type AdpSource } from './draft-math.js'
import { applyOverrides, type PlayerOverride } from './overrides.js'
import { buildLeagueScorer } from './rescore.js'
import { benchmarksForPool, captureRatio, type Benchmarks } from './rollout.js'
import { roomAdp, roomDelta } from './room.js'
import { lineupTotalWithReplacement } from './roster.js'
import { computeUpsideScores } from './upside.js'
import { computeReplacementLevels, type ReplacementLevel, type ScoredPlayer } from './vor.js'
import { assignTiers } from './tiers.js'

export interface BoardState {
  settings: LeagueSettings
  players: Player[]
  /** Per-source SeasonProjection rows (any `consensus` rows present are ignored and rebuilt). */
  projections: SeasonProjection[]
  market: MarketData[]
  /** Already off the board, in pick order where known. */
  draftedPlayerIds: PlayerId[]
  /** My picks among the drafted — feeds the capture-so-far grade and rollouts. */
  myDraftedPlayerIds?: PlayerId[]
  /** The owner's 1-based draft slot. */
  myDraftSlot: number
  season: number
}

export interface BoardRow {
  rank: number
  playerId: PlayerId
  name: string
  position: Position
  team: NflTeam | null
  byeWeek: number | null
  /** League points from the consensus stat line (boosts applied); null for K/DST (market-ranked). */
  points: number | null
  vor: number | null
  tier: number | null
  ecrRank: number | null
  ecrTier: number | null
  adp: number | null
  /** The price this room pays: ESPN ADP, Sleeper half-PPR fallback. */
  roomAdp: number | null
  /** Signed ESPN − market ADP gap; positive = the room lets him fall. */
  roomDelta: number | null
  /** 0–100 ceiling-percentile blend over the draftable pool; null without ECR or spread. */
  upsideScore: number | null
  /** Debiased max−min league points across projection sources; null under two sources. */
  residualSpread: number | null
  /** residualSpread at or past the contested threshold — sources genuinely disagree. */
  contested: boolean
  /** Projection sources covering this player (0 = market-only). */
  sourceCount: number
  /** Ban-overridden: shown as data, excluded from recommendations. */
  banned: boolean
  injuryStatus: InjuryStatus
  /** P(still available at my next pick / the pick after), given the board now. */
  pNextPick: number | null
  pPickAfter: number | null
}

export interface BoardResult {
  rows: BoardRow[]
  consensus: SeasonProjection[]
  replacement: ReplacementLevel
  benchmarks: Benchmarks
  /** Capture so far: my drafted starters (open seats at replacement) against the benchmarks. */
  captureRatio: number
  skippedEspnStatIds: number[]
  currentOverall: number
  myNextPicks: number[]
}

export interface BoardOptions {
  position?: Position
  overrides?: PlayerOverride[]
  /** ADP source for availability odds; 'room' (default) models this ESPN-led draft. */
  adpSource?: AdpSource
  log?: (message: string) => void
}

/** Best half-PPR-first ADP across sources; ESPN rides along where Sleeper has none. */
export const pickAdp = (adp: MarketData['adp'] | undefined): number | null => {
  if (adp === undefined) {
    return null
  }
  for (const format of ['half', 'ppr', 'std'] as const) {
    for (const source of ['sleeper', 'fantasypros', 'espn'] as const) {
      const value = adp[source]?.[format]
      if (value !== undefined) {
        return value
      }
    }
  }
  return null
}

/**
 * The board query: consensus → league rescore → overrides → VOR → tiers, joined with market
 * data, room pricing, upside scores, and make-it-back odds for the owner's next two picks. Pure
 * over its inputs — all I/O stays with the caller. Sorted VOR descending; players without
 * stat-line value (K/DST, deep unprojected names) trail, ordered by market ADP.
 */
export const board = (state: BoardState, options: BoardOptions = {}): BoardResult => {
  const log = options.log ?? (() => undefined)
  const { settings } = state

  const scorer = buildLeagueScorer(settings.scoringRules, log)
  const playerById = new Map(state.players.map((player) => [player.id, player]))
  const marketById = new Map(state.market.map((row) => [row.playerId, row]))

  const { rows: consensus, signals } = buildConsensusV2(state.projections, state.season, {
    score: scorer.score,
    positionById: new Map(state.players.map((player) => [player.id, player.position])),
    ecrById: new Map(
      state.market.flatMap((row) =>
        row.ecr === null ? [] : [[row.playerId, { rank: row.ecr.rank, stdDev: row.ecr.stdDev }] as const],
      ),
    ),
  })
  const rawScored: { playerId: PlayerId; position: Position; points: number | null }[] = []
  const projectedIds = new Set<PlayerId>()
  for (const row of consensus) {
    const player = playerById.get(row.playerId)
    if (player === undefined) {
      continue
    }
    projectedIds.add(row.playerId)
    rawScored.push({ playerId: row.playerId, position: player.position, points: scorer.score(row.stats) })
  }
  for (const market of state.market) {
    const player = playerById.get(market.playerId)
    if (player === undefined || projectedIds.has(market.playerId)) {
      continue
    }
    rawScored.push({ playerId: market.playerId, position: player.position, points: null })
  }

  const { rows: boosted, bannedIds } = applyOverrides(rawScored, options.overrides ?? [])
  const pointsById = new Map<PlayerId, number>()
  const scored: ScoredPlayer[] = []
  for (const row of boosted) {
    if (row.points !== null) {
      pointsById.set(row.playerId, row.points)
      scored.push({ playerId: row.playerId, position: row.position, points: row.points })
    }
  }

  // Valuations are computed over the full projected pool, drafted players included, so VOR,
  // replacement levels, tiers, and benchmarks stay stable as the draft removes players.
  const replacement = computeReplacementLevels(scored, settings.lineupSlots, settings.size)
  const benchmarks = benchmarksForPool(boosted, settings.lineupSlots, replacement)
  const residualSpreads = new Map<PlayerId, number>()
  for (const [playerId, signal] of signals) {
    if (signal.residualSpread !== null) {
      residualSpreads.set(playerId, signal.residualSpread)
    }
  }
  const upsideScores = computeUpsideScores(state.market, residualSpreads)

  const tierById = new Map<PlayerId, number>()
  for (const position of ['QB', 'RB', 'WR', 'TE'] as const) {
    const atPosition = scored.filter((p) => p.position === position).sort((a, b) => b.points - a.points)
    const replacementRank = replacement.rank[position] ?? 12
    const poolSize = Math.min(atPosition.length, Math.max(12, 2 * replacementRank))
    const tiers = assignTiers(
      atPosition.map((p) => p.points),
      { poolSize },
    )
    atPosition.forEach((p, i) => tierById.set(p.playerId, tiers[i] as number))
  }

  const drafted = new Set(state.draftedPlayerIds)
  const currentOverall = state.draftedPlayerIds.length + 1
  const myNextPicks = upcomingPicksForSlot(state.myDraftSlot, settings.size, currentOverall, 2)

  const myPlayers = (state.myDraftedPlayerIds ?? []).flatMap((id) => {
    const player = playerById.get(id)
    return player === undefined ? [] : [{ playerId: id, position: player.position, points: pointsById.get(id) ?? null }]
  })
  const myStarterTotal = lineupTotalWithReplacement(myPlayers, settings.lineupSlots, replacement.points)

  const rows: BoardRow[] = []
  for (const player of state.players) {
    if (drafted.has(player.id)) {
      continue
    }
    const market = marketById.get(player.id)
    const adp = pickAdp(market?.adp)
    const points = pointsById.get(player.id) ?? null
    const level = replacement.points[player.position]
    const vor = points !== null && level !== undefined ? points - level : null
    if (points === null && market === undefined) {
      continue // no projection and no market signal: not draft-relevant
    }
    let pNextPick: number | null = null
    let pPickAfter: number | null = null
    const oddsAdp = market !== undefined ? planningAdp(market, { adpSource: options.adpSource }) : null
    if (oddsAdp !== null) {
      const sigma = sigmaForPick(oddsAdp, market?.ecr?.stdDev)
      pNextPick = myNextPicks[0] !== undefined ? makeItBackOdds(oddsAdp, sigma, currentOverall, myNextPicks[0]) : null
      pPickAfter = myNextPicks[1] !== undefined ? makeItBackOdds(oddsAdp, sigma, currentOverall, myNextPicks[1]) : null
    }
    rows.push({
      rank: 0,
      playerId: player.id,
      name: player.name,
      position: player.position,
      team: player.team,
      byeWeek: player.byeWeek,
      points,
      vor,
      tier: tierById.get(player.id) ?? null,
      ecrRank: market?.ecr?.rank ?? null,
      ecrTier: market?.ecr?.tier ?? null,
      adp,
      roomAdp: market !== undefined ? roomAdp(market) : null,
      roomDelta: market !== undefined ? roomDelta(market) : null,
      upsideScore: upsideScores.get(player.id) ?? null,
      residualSpread: signals.get(player.id)?.residualSpread ?? null,
      contested: signals.get(player.id)?.contested ?? false,
      sourceCount: signals.get(player.id)?.sourceCount ?? 0,
      banned: bannedIds.has(player.id),
      injuryStatus: player.injuryStatus,
      pNextPick,
      pPickAfter,
    })
  }

  rows.sort((a, b) => {
    if (a.vor !== null && b.vor !== null) {
      return b.vor - a.vor
    }
    if (a.vor !== null) {
      return -1
    }
    if (b.vor !== null) {
      return 1
    }
    return (a.adp ?? Number.POSITIVE_INFINITY) - (b.adp ?? Number.POSITIVE_INFINITY)
  })
  rows.forEach((row, i) => {
    row.rank = i + 1
  })

  return {
    rows: options.position === undefined ? rows : rows.filter((row) => row.position === options.position),
    consensus,
    replacement,
    benchmarks,
    captureRatio: captureRatio(myStarterTotal, benchmarks),
    skippedEspnStatIds: scorer.skippedEspnStatIds,
    currentOverall,
    myNextPicks,
  }
}
