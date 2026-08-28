import type { Database } from 'better-sqlite3'

import { mintNewsId, type NewsId, type PlayerId } from '../ids.js'
import type {
  DraftPick,
  LeagueSettings,
  ManualPick,
  MarketData,
  NewsAssessment,
  Player,
  PlayerIdMapping,
  PlayerNewsDraft,
  PlayerNewsItem,
  PlayerNewsSignal,
  SeasonProjection,
} from '../models.js'
import { rollupAssessments } from '../news/rollup.js'
import type { DataSource } from '../reference/data-source.js'
import type { InjuryStatus } from '../reference/injury-status.js'
import type { NewsDirection, NewsImpact, NewsSource } from '../reference/news.js'
import type { NflTeam } from '../reference/nfl-team.js'
import type { Position } from '../reference/position.js'
import type { ScoringFormat } from '../reference/scoring-format.js'
import type { StatKey } from '../reference/stat-key.js'

/**
 * Typed access to the SQLite store. Refreshable models are overwrite-plus-asOf: each refresh
 * replaces the stored rows (per source where the model is per-source) and stamps the fetch time.
 */
export class Store {
  constructor(private readonly db: Database) {}

  // -- Player ---------------------------------------------------------------

  /** Replace the full player table (snapshot refresh). */
  replacePlayers(players: Player[], asOf: string): void {
    const insert = this.db.prepare(
      `INSERT INTO player (id, name, position, team, bye_week, age, years_exp, injury_status, as_of)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    this.db.transaction(() => {
      // Snapshot children reference player rows; a snapshot refresh rewrites them all in the
      // same ingest run, so clear them ahead of the parent to satisfy the FKs.
      this.db.prepare('DELETE FROM draft_pick').run()
      this.db.prepare('DELETE FROM market_data').run()
      this.db.prepare('DELETE FROM season_projection').run()
      this.db.prepare('DELETE FROM player').run()
      for (const p of players) {
        insert.run(p.id, p.name, p.position, p.team, p.byeWeek, p.age, p.yearsExp, p.injuryStatus, asOf)
      }
    })()
  }

  countPlayers(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM player').get() as { n: number }).n
  }

  getPlayers(): Player[] {
    interface Row {
      id: PlayerId
      name: string
      position: Position
      team: NflTeam | null
      bye_week: number | null
      age: number | null
      years_exp: number | null
      injury_status: InjuryStatus
    }
    return (this.db.prepare('SELECT * FROM player').all() as Row[]).map((row) => ({
      id: row.id,
      name: row.name,
      position: row.position,
      team: row.team,
      byeWeek: row.bye_week,
      age: row.age,
      yearsExp: row.years_exp,
      injuryStatus: row.injury_status,
    }))
  }

  // -- PlayerIdMapping ------------------------------------------------------

  upsertMapping(mapping: PlayerIdMapping): void {
    this.db
      .prepare(
        `INSERT INTO player_id_mapping (player_id, source, external_id, matched_by)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(source, external_id) DO UPDATE SET player_id = excluded.player_id, matched_by = excluded.matched_by`,
      )
      .run(mapping.playerId, mapping.source, mapping.externalId, mapping.matchedBy)
  }

  getMappings(): PlayerIdMapping[] {
    interface Row {
      player_id: PlayerId
      source: DataSource
      external_id: string
      matched_by: PlayerIdMapping['matchedBy']
    }
    return (this.db.prepare('SELECT * FROM player_id_mapping').all() as Row[]).map((row) => ({
      playerId: row.player_id,
      source: row.source,
      externalId: row.external_id,
      matchedBy: row.matched_by,
    }))
  }

  countMappings(): Record<string, number> {
    const rows = this.db.prepare('SELECT source, COUNT(*) AS n FROM player_id_mapping GROUP BY source').all() as {
      source: string
      n: number
    }[]
    return Object.fromEntries(rows.map((row) => [row.source, row.n]))
  }

  // -- SeasonProjection -----------------------------------------------------

  /** Delete-and-replace this source's rows for the season, stamping the fetch time. */
  replaceProjections(source: string, season: number, rows: SeasonProjection[], asOf: string): void {
    const insert = this.db.prepare(
      `INSERT INTO season_projection (player_id, source, season, games_played, stats, prescored, as_of)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM season_projection WHERE source = ? AND season = ?').run(source, season)
      for (const row of rows) {
        insert.run(
          row.playerId,
          row.source,
          row.season,
          row.gamesPlayed,
          JSON.stringify(row.stats),
          JSON.stringify(row.prescored),
          asOf,
        )
      }
    })()
  }

  getProjections(season: number): SeasonProjection[] {
    interface Row {
      player_id: PlayerId
      source: SeasonProjection['source']
      season: number
      games_played: number | null
      stats: string
      prescored: string
    }
    return (this.db.prepare('SELECT * FROM season_projection WHERE season = ?').all(season) as Row[]).map((row) => ({
      playerId: row.player_id,
      source: row.source,
      season: row.season,
      gamesPlayed: row.games_played,
      stats: JSON.parse(row.stats) as Partial<Record<StatKey, number>>,
      prescored: JSON.parse(row.prescored) as Partial<Record<ScoringFormat, number>>,
    }))
  }

  /** The asOf stamp on one source's stored rows for the season; null when none are stored. */
  getProjectionsAsOf(source: string, season: number): string | null {
    return (
      this.db
        .prepare('SELECT MAX(as_of) AS m FROM season_projection WHERE source = ? AND season = ?')
        .get(source, season) as { m: string | null }
    ).m
  }

  countProjectionsBySource(): Record<string, number> {
    const rows = this.db.prepare('SELECT source, COUNT(*) AS n FROM season_projection GROUP BY source').all() as {
      source: string
      n: number
    }[]
    return Object.fromEntries(rows.map((row) => [row.source, row.n]))
  }

  // -- MarketData -----------------------------------------------------------

  replaceMarketData(rows: MarketData[]): void {
    const insert = this.db.prepare(
      `INSERT INTO market_data (player_id, adp, ecr, percent_rostered, as_of)
       VALUES (?, ?, ?, ?, ?)`,
    )
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM market_data').run()
      for (const row of rows) {
        insert.run(
          row.playerId,
          JSON.stringify(row.adp),
          row.ecr === null ? null : JSON.stringify(row.ecr),
          row.percentRostered,
          row.asOf,
        )
      }
    })()
  }

  getMarketData(): MarketData[] {
    interface Row {
      player_id: PlayerId
      adp: string
      ecr: string | null
      percent_rostered: number | null
      as_of: string
    }
    return (this.db.prepare('SELECT * FROM market_data').all() as Row[]).map((row) => ({
      playerId: row.player_id,
      adp: JSON.parse(row.adp) as MarketData['adp'],
      ecr: row.ecr === null ? null : (JSON.parse(row.ecr) as MarketData['ecr']),
      percentRostered: row.percent_rostered,
      asOf: row.as_of,
    }))
  }

  countMarketData(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM market_data').get() as { n: number }).n
  }

  // -- LeagueSettings -------------------------------------------------------

  replaceLeagueSettings(settings: LeagueSettings, asOf: string): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM league_settings WHERE league_id = ?').run(settings.leagueId)
      this.db
        .prepare(
          `INSERT INTO league_settings (league_id, name, size, scoring_rules, lineup_slots, draft, as_of)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          settings.leagueId,
          settings.name,
          settings.size,
          JSON.stringify(settings.scoringRules),
          JSON.stringify(settings.lineupSlots),
          JSON.stringify(settings.draft),
          asOf,
        )
    })()
  }

  getLeagueSettings(): LeagueSettings | null {
    interface Row {
      league_id: string
      name: string
      size: number
      scoring_rules: string
      lineup_slots: string
      draft: string
    }
    const row = this.db.prepare('SELECT * FROM league_settings').get() as Row | undefined
    if (row === undefined) {
      return null
    }
    return {
      leagueId: row.league_id,
      name: row.name,
      size: row.size,
      scoringRules: JSON.parse(row.scoring_rules) as LeagueSettings['scoringRules'],
      lineupSlots: JSON.parse(row.lineup_slots) as LeagueSettings['lineupSlots'],
      draft: JSON.parse(row.draft) as LeagueSettings['draft'],
    }
  }

  countLeagueSettings(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM league_settings').get() as { n: number }).n
  }

  // -- DraftPick ------------------------------------------------------------

  replaceDraftPicks(picks: DraftPick[], asOf: string): void {
    const insert = this.db.prepare(
      `INSERT INTO draft_pick (overall, round, round_pick, team_id, player_id, is_keeper, as_of)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM draft_pick').run()
      for (const pick of picks) {
        insert.run(pick.overall, pick.round, pick.roundPick, pick.teamId, pick.playerId, pick.isKeeper ? 1 : 0, asOf)
      }
    })()
  }

  getDraftPicks(): DraftPick[] {
    interface Row {
      overall: number
      round: number
      round_pick: number
      team_id: number
      player_id: PlayerId
      is_keeper: number
    }
    return (this.db.prepare('SELECT * FROM draft_pick ORDER BY overall').all() as Row[]).map((row) => ({
      overall: row.overall,
      round: row.round,
      roundPick: row.round_pick,
      teamId: row.team_id,
      playerId: row.player_id,
      isKeeper: row.is_keeper !== 0,
    }))
  }

  countDraftPicks(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM draft_pick').get() as { n: number }).n
  }

  // -- ManualPick -----------------------------------------------------------

  addManualPick(pick: ManualPick): void {
    this.db
      .prepare(
        `INSERT INTO manual_pick (player_id, team_id, marked_at)
         VALUES (?, ?, ?)
         ON CONFLICT(player_id) DO UPDATE SET team_id = excluded.team_id, marked_at = excluded.marked_at`,
      )
      .run(pick.playerId, pick.teamId, pick.markedAt)
  }

  removeManualPick(playerId: PlayerId): boolean {
    return this.db.prepare('DELETE FROM manual_pick WHERE player_id = ?').run(playerId).changes > 0
  }

  getManualPicks(): ManualPick[] {
    interface Row {
      player_id: PlayerId
      team_id: number | null
      marked_at: string
    }
    return (this.db.prepare('SELECT * FROM manual_pick ORDER BY marked_at, player_id').all() as Row[]).map((row) => ({
      playerId: row.player_id,
      teamId: row.team_id,
      markedAt: row.marked_at,
    }))
  }

  // -- PlayerNews -----------------------------------------------------------

  /**
   * Upsert fetched items by (source, externalId): new items mint an id, refetches refresh the
   * content and fetchedAt in place. Player attribution is first-seen — ESPN serves shared
   * content (multi-player videos) under the same item id in several players' feeds.
   */
  upsertNewsItems(drafts: PlayerNewsDraft[], fetchedAt: string): { inserted: number; updated: number } {
    const find = this.db.prepare('SELECT id FROM player_news WHERE source = ? AND external_id = ?')
    const insert = this.db.prepare(
      `INSERT INTO player_news (id, player_id, source, external_id, published, headline, body, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const update = this.db.prepare(
      'UPDATE player_news SET published = ?, headline = ?, body = ?, fetched_at = ? WHERE id = ?',
    )
    let inserted = 0
    let updated = 0
    this.db.transaction(() => {
      for (const draft of drafts) {
        const existing = find.get(draft.source, draft.externalId) as { id: NewsId } | undefined
        if (existing) {
          update.run(draft.published, draft.headline, draft.body, fetchedAt, existing.id)
          updated += 1
        } else {
          insert.run(
            mintNewsId(),
            draft.playerId,
            draft.source,
            draft.externalId,
            draft.published,
            draft.headline,
            draft.body,
            fetchedAt,
          )
          inserted += 1
        }
      }
    })()
    return { inserted, updated }
  }

  getNewsItems(): PlayerNewsItem[] {
    return (this.db.prepare('SELECT * FROM player_news').all() as NewsRow[]).map(newsItemFromRow)
  }

  countNewsBySource(): Record<string, number> {
    const rows = this.db.prepare('SELECT source, COUNT(*) AS n FROM player_news GROUP BY source').all() as {
      source: string
      n: number
    }[]
    return Object.fromEntries(rows.map((row) => [row.source, row.n]))
  }

  /** One player's items with their assessments (null while unassessed), newest first. */
  getNewsForPlayer(playerId: PlayerId): { item: PlayerNewsItem; assessment: NewsAssessment | null }[] {
    const rows = this.db
      .prepare(
        `SELECT n.*,
                a.direction, a.impact, a.summary, a.assessed_at, a.assessed_by
         FROM player_news n
         LEFT JOIN news_assessment a ON a.news_id = n.id
         WHERE n.player_id = ?
         ORDER BY n.published DESC NULLS LAST, n.fetched_at DESC`,
      )
      .all(playerId) as (NewsRow & AssessmentColumns)[]
    return rows.map((row) => ({ item: newsItemFromRow(row), assessment: assessmentFromColumns(row) }))
  }

  // -- NewsAssessment -------------------------------------------------------

  upsertAssessment(assessment: NewsAssessment): void {
    this.db
      .prepare(
        `INSERT INTO news_assessment (news_id, direction, impact, summary, assessed_at, assessed_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(news_id) DO UPDATE SET
           direction = excluded.direction, impact = excluded.impact, summary = excluded.summary,
           assessed_at = excluded.assessed_at, assessed_by = excluded.assessed_by`,
      )
      .run(
        assessment.newsId,
        assessment.direction,
        assessment.impact,
        assessment.summary,
        assessment.assessedAt,
        assessment.assessedBy,
      )
  }

  countAssessments(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM news_assessment').get() as { n: number }).n
  }

  /** Worst-of rollup per player with any stored news, for board dots. */
  getNewsSignals(): PlayerNewsSignal[] {
    interface Row {
      player_id: PlayerId
      direction: NewsDirection | null
      impact: NewsImpact | null
    }
    const rows = this.db
      .prepare(
        `SELECT n.player_id, a.direction, a.impact
         FROM player_news n
         LEFT JOIN news_assessment a ON a.news_id = n.id`,
      )
      .all() as Row[]
    const byPlayer = new Map<
      PlayerId,
      { assessed: { direction: NewsDirection; impact: NewsImpact }[]; items: number }
    >()
    for (const row of rows) {
      let entry = byPlayer.get(row.player_id)
      if (!entry) {
        entry = { assessed: [], items: 0 }
        byPlayer.set(row.player_id, entry)
      }
      entry.items += 1
      if (row.direction !== null && row.impact !== null) {
        entry.assessed.push({ direction: row.direction, impact: row.impact })
      }
    }
    return [...byPlayer.entries()].map(([playerId, entry]) => {
      const rollup = rollupAssessments(entry.assessed)
      return {
        playerId,
        direction: rollup?.direction ?? null,
        impact: rollup?.impact ?? null,
        itemCount: entry.items,
        assessedCount: entry.assessed.length,
      }
    })
  }

  // -- Freshness ------------------------------------------------------------

  /** Latest as_of per refreshable table; null where the table is empty. */
  getAsOfStamps(): Record<
    'player' | 'seasonProjection' | 'marketData' | 'leagueSettings' | 'draftPick',
    string | null
  > {
    const max = (table: string): string | null =>
      (this.db.prepare(`SELECT MAX(as_of) AS m FROM ${table}`).get() as { m: string | null }).m
    return {
      player: max('player'),
      seasonProjection: max('season_projection'),
      marketData: max('market_data'),
      leagueSettings: max('league_settings'),
      draftPick: max('draft_pick'),
    }
  }
}

interface NewsRow {
  id: NewsId
  player_id: PlayerId
  source: NewsSource
  external_id: string
  published: string | null
  headline: string
  body: string | null
  fetched_at: string
}

const newsItemFromRow = (row: NewsRow): PlayerNewsItem => ({
  id: row.id,
  playerId: row.player_id,
  source: row.source,
  externalId: row.external_id,
  published: row.published,
  headline: row.headline,
  body: row.body,
  fetchedAt: row.fetched_at,
})

interface AssessmentColumns {
  id: NewsId
  direction: NewsDirection | null
  impact: NewsImpact | null
  summary: string | null
  assessed_at: string | null
  assessed_by: string | null
}

const assessmentFromColumns = (row: AssessmentColumns): NewsAssessment | null =>
  row.direction === null || row.impact === null ?
    null
  : {
      newsId: row.id,
      direction: row.direction,
      impact: row.impact,
      summary: row.summary ?? '',
      assessedAt: row.assessed_at ?? '',
      assessedBy: row.assessed_by ?? '',
    }
