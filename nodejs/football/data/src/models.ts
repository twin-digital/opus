import type { NewsId, PlayerId } from './ids.js'
import type { DataSource } from './reference/data-source.js'
import type { InjuryStatus } from './reference/injury-status.js'
import type { LineupSlot } from './reference/lineup-slot.js'
import type { NewsDirection, NewsImpact, NewsSource } from './reference/news.js'
import type { NflTeam } from './reference/nfl-team.js'
import type { Position } from './reference/position.js'
import type { ScoringFormat } from './reference/scoring-format.js'
import type { StatKey } from './reference/stat-key.js'

/**
 * How an external id was joined to its canonical player. `minted` marks the source row that
 * first created the player (exact by construction); `name-team-pos` rows are flagged for review.
 */
export type MatchedBy = 'crosswalk' | 'name-team-pos' | 'manual' | 'minted'

export interface PlayerIdMapping {
  playerId: PlayerId
  source: DataSource
  externalId: string // normalized to string regardless of source's native type
  matchedBy: MatchedBy
}

export interface Player {
  id: PlayerId
  name: string
  position: Position
  team: NflTeam | null // null = free agent
  byeWeek: number | null
  age: number | null
  yearsExp: number | null
  injuryStatus: InjuryStatus
}

export interface ScoringRule {
  /** Canonical when mapped; raw id for exotic rules (yardage bonuses). */
  stat: StatKey | { espnStatId: number }
  points: number
}

export interface LeagueSettings {
  leagueId: string
  name: string
  size: number
  scoringRules: ScoringRule[]
  lineupSlots: Record<LineupSlot, number>
  draft: {
    type: 'snake'
    date: string | null
    pickOrder: number[] // team ids in round-1 order
  }
}

export interface SeasonProjection {
  playerId: PlayerId
  source: DataSource | 'consensus'
  season: number
  gamesPlayed: number | null
  stats: Partial<Record<StatKey, number>>
  /** Source's own scored totals, kept only to cross-check the rescorer. */
  prescored: Partial<Record<ScoringFormat, number>>
}

export interface MarketData {
  playerId: PlayerId
  adp: Partial<Record<DataSource, Partial<Record<ScoringFormat, number>>>>
  ecr: {
    rank: number
    posRank: string // 'WR1'
    tier: number
    best: number
    worst: number
    stdDev: number // expert disagreement
  } | null
  percentRostered: number | null
  asOf: string // ADP moves daily in draft season
}

export interface DraftPick {
  overall: number
  round: number
  roundPick: number
  teamId: number // ESPN team id
  playerId: PlayerId // resolved from ESPN player id via PlayerIdMapping
  isKeeper: boolean
}

/** A draft-day fallback mark: the player is off the board even if the ESPN poll missed it. */
export interface ManualPick {
  playerId: PlayerId
  teamId: number | null // ESPN team id; null = unknown
  markedAt: string
}

/**
 * One stored news item. Append-mostly: refetches upsert by (source, externalId), so the corpus
 * accumulates across runs and survives player-snapshot refreshes (no FK to player).
 */
export interface PlayerNewsItem {
  id: NewsId
  playerId: PlayerId
  source: NewsSource
  /** Source item id: ESPN `nowId` (falling back to numeric id); sleeper-injury a playerId+news_updated hash. */
  externalId: string
  published: string | null
  headline: string
  /** Raw text/html as served; null when the source item carries no body. */
  body: string | null
  fetchedAt: string
}

/** A fetched-but-unstored item: the store mints the id and stamps fetchedAt on upsert. */
export type PlayerNewsDraft = Omit<PlayerNewsItem, 'id' | 'fetchedAt'>

/** A human/agent judgment on one news item's fantasy relevance. One per item, upserted by newsId. */
export interface NewsAssessment {
  newsId: NewsId
  direction: NewsDirection
  impact: NewsImpact
  /** 1–2 sentences a football novice can act on. */
  summary: string
  assessedAt: string
  assessedBy: string
}

/** Per-player rollup for board dots: worst direction, highest impact within that direction. */
export interface PlayerNewsSignal {
  playerId: PlayerId
  /** null until at least one of the player's items is assessed. */
  direction: NewsDirection | null
  impact: NewsImpact | null
  itemCount: number
  assessedCount: number
}
