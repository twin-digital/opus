import { openDatabase } from '../db/connection.js'
import { Store } from '../db/store.js'
import { fetchCrosswalk } from '../fetchers/crosswalk.js'
import {
  fetchEspnDraftDetail,
  fetchEspnLeagueSettings,
  fetchEspnProjections,
  summarizeEspnProjection,
  type EspnLeagueCredentials,
} from '../fetchers/espn.js'
import { fetchFantasyProsEcr } from '../fetchers/fantasypros.js'
import {
  FP_PROJECTION_POSITIONS,
  fetchFpApiProjections,
  fetchFpProjections,
  type FpProjectionPosition,
  type FpProjectionRow,
} from '../fetchers/fantasypros-projections.js'
import {
  fetchSleeperPlayersDb,
  fetchSleeperProjections,
  SLEEPER_PROJECTION_POSITIONS,
  type SleeperPlayer,
  type SleeperProjectionRow,
} from '../fetchers/sleeper.js'
import type { PlayerId } from '../ids.js'
import type { DraftPick, MarketData, Player, SeasonProjection } from '../models.js'
import type { DataSource } from '../reference/data-source.js'
import { injuryStatusFromEspn, injuryStatusFromSleeper } from '../reference/injury-status.js'
import { teamFromEspn, teamFromFantasyPros, teamFromSleeper } from '../reference/nfl-team.js'
import { positionFromEspn, positionFromFantasyPros, positionFromSleeper } from '../reference/position.js'
import type { ScoringFormat } from '../reference/scoring-format.js'
import { mapLeagueSettings } from './league-settings.js'
import { PlayerResolver, type SourceIdentity, type UnresolvedRef } from './resolver.js'
import {
  mapEspnStats,
  mapSleeperStats,
  validateEspnPrescoring,
  validateEspnProTeams,
  validateFantasyProsPrescoring,
  validateSleeperPrescoring,
} from './validate.js'

/** How the ingest sources FantasyPros projections. `auto`: API when a key is set, else the page
 *  scrape. `scrape`: force the (fenced) page scrape, sparing API quota. `skip`: keep the stored
 *  rows and their asOf untouched — for re-ingests when the day's API budget is already spent. */
export type FpProjectionsMode = 'auto' | 'scrape' | 'skip'

export const FP_PROJECTIONS_MODES: readonly FpProjectionsMode[] = ['auto', 'scrape', 'skip']

export const resolveFpProjectionsPath = (mode: FpProjectionsMode, hasApiKey: boolean): 'api' | 'scrape' | 'skip' => {
  if (mode === 'auto') {
    return hasApiKey ? 'api' : 'scrape'
  }
  return mode
}

export interface IngestOptions {
  dbFile: string
  season: number
  espnCreds: EspnLeagueCredentials | null
  /** FantasyPros public API key; absent → projections fall back to the fenced page scrape. */
  fpApiKey: string | null
  /** Defaults to `auto`. */
  fpProjectionsMode?: FpProjectionsMode
  log?: (message: string) => void
}

export interface IngestSummary {
  asOf: string
  season: number
  players: number
  mappingsBySource: Record<string, number>
  projectionsBySource: Record<string, number>
  marketData: number
  leagueSettings: number
  draftPicks: number
  unresolved: UnresolvedRef[]
  validation: {
    sleeperChecked: number
    sleeperMaxDelta: number
    espnChecked: number
    espnMaxDelta: number
    proTeamSpotChecks: number
    fantasyProsChecked: number
    fantasyProsMaxDelta: number
    /** The scoring format the FPTS column was verified to carry this run; null in skip mode. */
    fantasyProsFormat: ScoringFormat | null
  }
  fantasyProsLastUpdated: string | null
  fantasyProsProjections: {
    path: 'api' | 'scrape' | 'skip'
    apiCalls: number
    rowsByPosition: Record<string, number>
    /** skip mode: the prior run's stamp carried forward on the kept rows. */
    keptAsOf: string | null
  }
  leagueMessage: string | null
}

/** Sleeper uses 999-family sentinels for "no ADP". */
const adpOrUndefined = (value: number | undefined): number | undefined =>
  value !== undefined && value > 0 && value < 900 ? value : undefined

/** How many ranked ids to request per position on the API path. Free-tier responses cap at 10
 *  players, so ids are batched 10 per call — these caps hold a full run to 32 of the key's 50
 *  calls/day (headroom for reruns) while reaching well past rosterable depth in a 12-team league. */
const FP_API_RANKED_CAPS: Record<FpProjectionPosition, number> = { QB: 40, RB: 100, WR: 120, TE: 60 }

interface PlayerDraftRow extends Player {
  adp: Partial<Record<DataSource, Partial<Record<ScoringFormat, number>>>>
  ecr: MarketData['ecr']
  percentRosteredEspn: number | null
  percentRosteredFp: number | null
}

export const runIngest = async (options: IngestOptions): Promise<IngestSummary> => {
  const log = options.log ?? (() => undefined)
  const { season } = options
  const asOf = new Date().toISOString()

  const db = openDatabase(options.dbFile)
  try {
    const store = new Store(db)

    // -- Fetch everything up front ------------------------------------------
    log('Fetching db_playerids crosswalk...')
    const crosswalk = await fetchCrosswalk()
    log(`  ${crosswalk.length} crosswalk rows`)

    log('Fetching Sleeper players DB...')
    const sleeperPlayers = await fetchSleeperPlayersDb()
    log(`  ${Object.keys(sleeperPlayers).length} players`)

    log('Fetching Sleeper projections...')
    const sleeperRows: SleeperProjectionRow[] = []
    for (const position of SLEEPER_PROJECTION_POSITIONS) {
      const rows = await fetchSleeperProjections(season, position)
      log(`  ${position}: ${rows.length} rows`)
      sleeperRows.push(...rows)
    }

    log('Fetching ESPN public projections...')
    const espnPlayers = await fetchEspnProjections(season)
    log(`  ${espnPlayers.length} kona players`)

    log('Fetching FantasyPros half-PPR rankings...')
    const ecrData = await fetchFantasyProsEcr()
    log(`  ${ecrData.players.length} ranked players (last updated ${ecrData.last_updated ?? 'unknown'})`)

    log('Fetching FantasyPros season projections...')
    const fpProjections: { row: FpProjectionRow; position: FpProjectionPosition }[] = []
    let fpPath = resolveFpProjectionsPath(options.fpProjectionsMode ?? 'auto', options.fpApiKey !== null)
    let fpApiCalls = 0
    /** skip mode: the stored rows, captured before the snapshot refresh wipes the table. */
    let fpKept: { rows: SeasonProjection[]; asOf: string | null } | null = null
    if (fpPath === 'skip') {
      fpKept = {
        rows: store.getProjections(season).filter((row) => row.source === 'fantasypros'),
        asOf: store.getProjectionsAsOf('fantasypros', season),
      }
      log(`  mode=skip — keeping ${fpKept.rows.length} stored rows (asOf ${fpKept.asOf ?? 'none'}), nothing fetched`)
    } else if (fpPath === 'api' && options.fpApiKey !== null) {
      try {
        for (const position of FP_PROJECTION_POSITIONS) {
          // Rank order so a cap trims the least draft-relevant tail.
          const rankedIds = ecrData.players
            .filter((fp) => fp.player_position_id === position)
            .sort((a, b) => a.rank_ecr - b.rank_ecr)
            .map((fp) => fp.player_id)
            .slice(0, FP_API_RANKED_CAPS[position])
          const { rows, calls } = await fetchFpApiProjections(season, position, rankedIds, options.fpApiKey)
          fpApiCalls += calls
          log(`  ${position}: ${rows.length} rows via API (${calls} calls, ${rankedIds.length} ranked ids)`)
          fpProjections.push(...rows.map((row) => ({ row, position })))
        }
      } catch (error) {
        log(`  WARNING: FantasyPros API failed (${error instanceof Error ? error.message : String(error)})`)
        log('  falling back to the page scrape (registration-fenced to ~10 rows per position)')
        fpPath = 'scrape'
        fpProjections.length = 0
      }
    } else if (options.fpApiKey === null) {
      log('  FP_API_KEY absent — using the page scrape (registration-fenced to ~10 rows per position)')
    } else {
      log('  mode=scrape — using the page scrape (registration-fenced to ~10 rows per position)')
    }
    if (fpPath === 'scrape') {
      for (const position of FP_PROJECTION_POSITIONS) {
        const rows = await fetchFpProjections(position)
        log(`  ${position}: ${rows.length} rows via page scrape`)
        fpProjections.push(...rows.map((row) => ({ row, position })))
      }
    }

    // -- Validate the community-documented maps before storing anything -----
    log('Validating stat and team mappings...')
    const sleeperCheck = validateSleeperPrescoring(
      sleeperRows
        .filter((row) => !isKickerOrDst(row, sleeperPlayers))
        .map((row) => ({ row, name: sleeperName(row, sleeperPlayers) ?? row.player_id })),
    )
    log(`  sleeper prescored: ${sleeperCheck.checked} players, max delta ${sleeperCheck.maxDelta.toFixed(3)}`)
    const espnCheck = validateEspnPrescoring(espnPlayers, season)
    log(`  espn appliedTotal: ${espnCheck.checked} players, max delta ${espnCheck.maxDelta.toFixed(3)}`)
    const proTeamSpotChecks = validateEspnProTeams(espnPlayers)
    log(`  espn proTeamId: ${proTeamSpotChecks} known players spot-checked`)
    const fpCheck = fpPath === 'skip' ? null : validateFantasyProsPrescoring(fpProjections.map((entry) => entry.row))
    if (fpCheck !== null) {
      log(
        `  fantasypros FPTS: ${fpCheck.checked} players, format ${fpCheck.format}, max delta ${fpCheck.maxDelta.toFixed(3)}`,
      )
    } else {
      log('  fantasypros FPTS: skipped (keeping stored rows)')
    }

    // -- Resolve and build canonical rows -----------------------------------
    const resolver = new PlayerResolver(crosswalk)
    resolver.seedExisting(store.getMappings())

    const drafts = new Map<PlayerId, PlayerDraftRow>()
    const draftFor = (playerId: PlayerId, identity: SourceIdentity): PlayerDraftRow => {
      let draft = drafts.get(playerId)
      if (!draft) {
        draft = {
          id: playerId,
          name: identity.name,
          position: identity.position,
          team: identity.team,
          byeWeek: null,
          age: null,
          yearsExp: null,
          injuryStatus: 'UNKNOWN',
          adp: {},
          ecr: null,
          percentRosteredEspn: null,
          percentRosteredFp: null,
        }
        drafts.set(playerId, draft)
      }
      return draft
    }

    const projections: SeasonProjection[] = []
    // A player can arrive twice from one source (Sleeper position queries overlap for
    // multi-position players; ESPN pages can shift between requests) — first row wins.
    const projectionSeen = new Set<string>()
    const pushProjection = (projection: SeasonProjection): void => {
      const key = `${projection.source}:${projection.playerId}`
      if (projectionSeen.has(key)) {
        return
      }
      projectionSeen.add(key)
      projections.push(projection)
    }

    // Sleeper is the identity backbone: full player universe, minting allowed (rookie path).
    log('Ingesting Sleeper rows...')
    for (const row of sleeperRows) {
      const dbEntry: SleeperPlayer | undefined = sleeperPlayers[row.player_id]
      const name = sleeperName(row, sleeperPlayers)
      const fantasyPositions = dbEntry?.fantasy_positions ?? row.player?.fantasy_positions
      if (name === undefined || !fantasyPositions?.length) {
        continue
      } // no identity to mint or match with
      const position = positionFromSleeper(fantasyPositions)
      if (position === null) {
        log(
          `  skipping IDP-only player ${name} (${row.player_id}): fantasy_positions ${JSON.stringify(fantasyPositions)}`,
        )
        continue
      }
      const team = teamFromSleeper(dbEntry?.team ?? row.player?.team)
      const identity: SourceIdentity = { name, team, position }

      const ref = resolver.resolve('sleeper', row.player_id, identity, { mint: true })
      if (!ref) {
        continue
      }
      const draft = draftFor(ref.playerId, identity)
      draft.name = name
      draft.team = team
      draft.yearsExp = dbEntry?.years_exp ?? null
      draft.injuryStatus = injuryStatusFromSleeper(dbEntry?.injury_status ?? row.player?.injury_status)
      const sleeperAdp = {
        ...(adpOrUndefined(row.stats.adp_ppr) !== undefined && { ppr: row.stats.adp_ppr }),
        ...(adpOrUndefined(row.stats.adp_half_ppr) !== undefined && { half: row.stats.adp_half_ppr }),
        ...(adpOrUndefined(row.stats.adp_std) !== undefined && { std: row.stats.adp_std }),
      }
      if (Object.keys(sleeperAdp).length > 0) {
        draft.adp.sleeper = sleeperAdp
      }

      // K and DST stat vocabularies are deferred: identity/ADP rows only, no stat lines.
      if (position !== 'K' && position !== 'DST') {
        const { gp, pts_ppr, pts_half_ppr, pts_std } = row.stats as Partial<Record<string, number>>
        pushProjection({
          playerId: ref.playerId,
          source: 'sleeper',
          season,
          gamesPlayed: gp ?? null,
          stats: mapSleeperStats(row.stats),
          prescored: {
            ...(pts_ppr !== undefined && { ppr: pts_ppr }),
            ...(pts_half_ppr !== undefined && { half: pts_half_ppr }),
            ...(pts_std !== undefined && { std: pts_std }),
          },
        })
      }
    }

    log('Ingesting ESPN rows...')
    const unknownEspnInjuryStatuses = new Set<string>()
    for (const wrapper of espnPlayers) {
      const player = wrapper.player
      const position = positionFromEspn(player.defaultPositionId)
      const team = teamFromEspn(player.proTeamId)
      const identity: SourceIdentity = { name: player.fullName, team, position }

      const ref = resolver.resolve('espn', String(player.id), identity)
      if (!ref) {
        continue
      }
      const draft = draftFor(ref.playerId, identity)
      if (draft.injuryStatus === 'UNKNOWN') {
        draft.injuryStatus = injuryStatusFromEspn(player.injuryStatus, (value) => unknownEspnInjuryStatuses.add(value))
      }
      const adp = player.ownership?.averageDraftPosition
      if (adp !== undefined && adp > 0) {
        draft.adp.espn = { ppr: adp }
      } // leaguedefaults/3 = ESPN PPR defaults
      draft.percentRosteredEspn = player.ownership?.percentOwned ?? null

      if (position !== 'K' && position !== 'DST') {
        const summary = summarizeEspnProjection(player.stats, season)
        if (summary) {
          pushProjection({
            playerId: ref.playerId,
            source: 'espn',
            season,
            gamesPlayed:
              summary.weeks > 0 ? summary.weeklyRows.filter((w) => Object.keys(w.stats).length > 0).length : null,
            stats: mapEspnStats(summary.stats),
            prescored: { ppr: summary.appliedTotal },
          })
        }
      }
    }
    for (const value of unknownEspnInjuryStatuses) {
      log(`  WARNING: unknown ESPN injuryStatus ${JSON.stringify(value)} → UNKNOWN`)
    }

    log('Ingesting FantasyPros rankings...')
    for (const fp of ecrData.players) {
      const position = positionFromFantasyPros(fp.player_position_id)
      const team = teamFromFantasyPros(fp.player_team_id)
      const identity: SourceIdentity = { name: fp.player_name, team, position }

      const ref = resolver.resolve('fantasypros', String(fp.player_id), identity)
      if (!ref) {
        continue
      }
      const draft = draftFor(ref.playerId, identity)
      const byeWeek = Number(fp.player_bye_week)
      if (Number.isInteger(byeWeek) && byeWeek > 0) {
        draft.byeWeek = byeWeek
      }
      draft.ecr = {
        rank: fp.rank_ecr,
        posRank: fp.pos_rank,
        tier: fp.tier,
        best: Number(fp.rank_min),
        worst: Number(fp.rank_max),
        stdDev: Number(fp.rank_std),
      }
      draft.percentRosteredFp = fp.player_owned_avg ?? null
    }

    // After the rankings loop, so projection rows sharing an fp id resolve to the same player.
    if (fpCheck !== null) {
      log('Ingesting FantasyPros projections...')
      const fpMatchCounts: Record<string, number> = {}
      for (const { row, position } of fpProjections) {
        const team = teamFromFantasyPros(row.team)
        const identity: SourceIdentity = { name: row.name, team, position }
        const ref = resolver.resolve('fantasypros', String(row.fpId), identity)
        if (!ref) {
          continue
        }
        fpMatchCounts[ref.matchedBy] = (fpMatchCounts[ref.matchedBy] ?? 0) + 1
        draftFor(ref.playerId, identity) // guarantee a player row for the projection's FK
        pushProjection({
          playerId: ref.playerId,
          source: 'fantasypros',
          season,
          gamesPlayed: null, // neither FP path projects games
          stats: row.stats,
          // API rows carry all three formats; scrape rows only the FPTS column, filed under the
          // format validation determined.
          prescored: row.prescored ?? { [fpCheck.format]: row.fpts },
        })
      }
      log(
        `  resolved: ${Object.entries(fpMatchCounts)
          .map(([by, n]) => `${by}: ${n}`)
          .join(', ')}`,
      )
    }

    // Age comes from the crosswalk (age, or birthdate when age is missing).
    for (const [playerId, draft] of drafts) {
      const row = resolver.crosswalkRowFor(playerId)
      if (!row) {
        continue
      }
      if (row.age !== null) {
        draft.age = row.age
      } else if (row.birthdate !== null) {
        const born = Date.parse(row.birthdate)
        if (!Number.isNaN(born)) {
          draft.age = Math.round(((Date.now() - born) / (365.25 * 24 * 3600 * 1000)) * 10) / 10
        }
      }
    }

    // -- League (creds-gated) ----------------------------------------------
    let leagueMessage: string | null = null
    let draftPicks: DraftPick[] = []
    let leagueStored = false
    if (options.espnCreds) {
      log('Fetching ESPN league settings + draft detail...')
      const settingsResponse = await fetchEspnLeagueSettings(season, options.espnCreds)
      const leagueSettings = mapLeagueSettings(settingsResponse)
      store.replaceLeagueSettings(leagueSettings, asOf)
      leagueStored = true
      log(
        `  league "${leagueSettings.name}" (${leagueSettings.size} teams, draft ${leagueSettings.draft.date ?? 'unscheduled'})`,
      )

      const draftDetail = await fetchEspnDraftDetail(season, options.espnCreds)
      const picks = draftDetail.draftDetail?.picks ?? []
      draftPicks = []
      for (const pick of picks) {
        if (pick.playerId <= 0) {
          continue // pre-draft placeholder slot (playerId -1 until the pick is made)
        }
        const ref = resolver.resolveExact('espn', String(pick.playerId))
        if (!ref) {
          log(`  WARNING: draft pick ${pick.overallPickNumber} references unresolved ESPN player ${pick.playerId}`)
          continue
        }
        draftPicks.push({
          overall: pick.overallPickNumber,
          round: pick.roundId,
          roundPick: pick.roundPickNumber,
          teamId: pick.teamId,
          playerId: ref.playerId,
          isKeeper: pick.keeper ?? false,
        })
      }
      store.replaceDraftPicks(draftPicks, asOf)
      log(`  ${draftPicks.length} draft picks stored`)
    } else {
      leagueMessage =
        'ESPN league credentials absent (set ESPN_LEAGUE_ID, ESPN_S2, ESPN_SWID) — ' +
        'skipping LeagueSettings and DraftPick; all public sources were still ingested.'
      log(leagueMessage)
    }

    // -- Store ---------------------------------------------------------------
    log('Writing store...')
    const players: Player[] = [...drafts.values()].map(
      ({ adp: _adp, ecr: _ecr, percentRosteredEspn: _pe, percentRosteredFp: _pf, ...player }) => player,
    )
    store.replacePlayers(players, asOf)
    for (const mapping of resolver.newMappings) {
      store.upsertMapping(mapping)
    }
    for (const source of ['sleeper', 'espn', 'fantasypros'] as const) {
      if (source === 'fantasypros' && fpKept !== null) {
        continue
      }
      store.replaceProjections(
        source,
        season,
        projections.filter((p) => p.source === source),
        asOf,
      )
    }
    let fpRowsByPosition: Record<string, number> = {}
    if (fpKept !== null) {
      // The player-snapshot refresh cleared the table, so re-insert the kept rows under their
      // original asOf, for players still present this run.
      const present = fpKept.rows.filter((row) => drafts.has(row.playerId))
      store.replaceProjections('fantasypros', season, present, fpKept.asOf ?? asOf)
      if (present.length < fpKept.rows.length) {
        log(
          `  WARNING: dropped ${fpKept.rows.length - present.length} kept FantasyPros rows — players left the snapshot`,
        )
      }
      for (const row of present) {
        const position = drafts.get(row.playerId)?.position ?? 'unknown'
        fpRowsByPosition[position] = (fpRowsByPosition[position] ?? 0) + 1
      }
    } else {
      fpRowsByPosition = fpProjections.reduce<Record<string, number>>((counts, { position }) => {
        counts[position] = (counts[position] ?? 0) + 1
        return counts
      }, {})
    }
    const marketRows: MarketData[] = [...drafts.values()]
      .filter((draft) => Object.keys(draft.adp).length > 0 || draft.ecr !== null || draft.percentRosteredEspn !== null)
      .map((draft) => ({
        playerId: draft.id,
        adp: draft.adp,
        ecr: draft.ecr,
        percentRostered: draft.percentRosteredEspn ?? draft.percentRosteredFp,
        asOf,
      }))
    store.replaceMarketData(marketRows)

    return {
      asOf,
      season,
      players: store.countPlayers(),
      mappingsBySource: store.countMappings(),
      projectionsBySource: store.countProjectionsBySource(),
      marketData: store.countMarketData(),
      leagueSettings: leagueStored ? store.countLeagueSettings() : 0,
      draftPicks: draftPicks.length,
      unresolved: resolver.unresolved,
      validation: {
        sleeperChecked: sleeperCheck.checked,
        sleeperMaxDelta: sleeperCheck.maxDelta,
        espnChecked: espnCheck.checked,
        espnMaxDelta: espnCheck.maxDelta,
        proTeamSpotChecks,
        fantasyProsChecked: fpCheck?.checked ?? 0,
        fantasyProsMaxDelta: fpCheck?.maxDelta ?? 0,
        fantasyProsFormat: fpCheck?.format ?? null,
      },
      fantasyProsLastUpdated: ecrData.last_updated ?? null,
      fantasyProsProjections: {
        path: fpPath,
        apiCalls: fpApiCalls,
        rowsByPosition: fpRowsByPosition,
        keptAsOf: fpKept?.asOf ?? null,
      },
      leagueMessage,
    }
  } finally {
    db.close()
  }
}

const sleeperName = (row: SleeperProjectionRow, playersDb: Record<string, SleeperPlayer>): string | undefined => {
  const entry: SleeperPlayer | undefined = playersDb[row.player_id]
  const first = entry?.first_name ?? row.player?.first_name
  const last = entry?.last_name ?? row.player?.last_name
  if (entry?.full_name !== undefined) {
    return entry.full_name
  }
  return first !== undefined && last !== undefined ? `${first} ${last}` : undefined
}

const isKickerOrDst = (row: SleeperProjectionRow, playersDb: Record<string, SleeperPlayer>): boolean => {
  const entry: SleeperPlayer | undefined = playersDb[row.player_id]
  const fantasyPositions = entry?.fantasy_positions ?? row.player?.fantasy_positions
  const position = fantasyPositions?.[0]
  return position === 'K' || position === 'DEF'
}
