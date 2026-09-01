import { fetchJson } from './http.js'

const ESPN_HOST = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl'

/** One entry of kona `player.stats[]`: weekly or season stat line. */
export interface EspnStatLine {
  id: string
  seasonId: number
  scoringPeriodId: number
  /** 0 = actual, 1 = projection. */
  statSourceId: number
  /** 0 = season, 1 = weekly (projection split). */
  statSplitTypeId: number
  /** Numeric-string statId keys per the StatKey table. */
  stats: Record<string, number>
  appliedTotal?: number
}

export interface EspnKonaPlayer {
  id: number
  player: {
    id: number
    fullName: string
    defaultPositionId: number
    proTeamId: number
    injuryStatus?: string
    ownership?: {
      averageDraftPosition?: number
      percentOwned?: number
    }
    stats?: EspnStatLine[]
  }
}

interface KonaResponse {
  players?: EspnKonaPlayer[]
}

/**
 * Page through the public projections default league (`leaguedefaults/3`, PPR defaults) sorted
 * by percent-owned, so the fantasy-relevant population comes first.
 */
export const fetchEspnProjections = async (
  season: number,
  { pageSize = 250, maxPlayers = 1000 }: { pageSize?: number; maxPlayers?: number } = {},
): Promise<EspnKonaPlayer[]> => {
  const players: EspnKonaPlayer[] = []
  for (let offset = 0; offset < maxPlayers; offset += pageSize) {
    const filter = {
      players: { limit: pageSize, offset, sortPercOwned: { sortAsc: false, sortPriority: 1 } },
    }
    const url = `${ESPN_HOST}/seasons/${season}/segments/0/leaguedefaults/3?view=kona_player_info`
    const page = await fetchJson<KonaResponse>(url, { 'x-fantasy-filter': JSON.stringify(filter) })
    const batch = page.players ?? []
    players.push(...batch)
    if (batch.length < pageSize) {
      break
    }
  }
  if (players.length === 0) {
    throw new Error('ESPN kona_player_info returned zero players')
  }
  return players
}

/** Sum a kona player's weekly projection rows to a season stat dict keyed by numeric statId. */
export interface EspnSeasonProjectionSummary {
  /** Summed weekly projection stats, keyed by ESPN numeric statId (as strings). */
  stats: Record<string, number>
  /** Count of projection weeks contributing. */
  weeks: number
  /** Sum of weekly appliedTotal (prescored, ESPN default scoring for the fetched league). */
  appliedTotal: number
  /** The weekly rows used, for validation. */
  weeklyRows: EspnStatLine[]
}

export const summarizeEspnProjection = (
  statLines: EspnStatLine[] | undefined,
  season: number,
): EspnSeasonProjectionSummary | null => {
  const weekly = (statLines ?? []).filter(
    (line) =>
      line.statSourceId === 1 && line.seasonId === season && line.statSplitTypeId === 1 && line.scoringPeriodId >= 1,
  )
  if (weekly.length === 0) {
    // Fall back to the season-total projection row when no weekly split is served.
    const seasonRow = (statLines ?? []).find(
      (line) => line.statSourceId === 1 && line.seasonId === season && line.statSplitTypeId === 0,
    )
    if (!seasonRow) {
      return null
    }
    return {
      stats: { ...seasonRow.stats },
      weeks: 0,
      appliedTotal: seasonRow.appliedTotal ?? 0,
      weeklyRows: [seasonRow],
    }
  }

  const stats: Record<string, number> = {}
  let appliedTotal = 0
  for (const line of weekly) {
    for (const [statId, value] of Object.entries(line.stats)) {
      stats[statId] = (stats[statId] ?? 0) + value
    }
    appliedTotal += line.appliedTotal ?? 0
  }
  return { stats, weeks: weekly.length, appliedTotal, weeklyRows: weekly }
}

// -- Credentialed league endpoints ------------------------------------------

export interface EspnLeagueCredentials {
  leagueId: string
  espnS2: string
  swid: string
}

const leagueHeaders = (creds: EspnLeagueCredentials): Record<string, string> => ({
  cookie: `espn_s2=${creds.espnS2}; SWID=${creds.swid}`,
})

export interface EspnScoringItem {
  statId: number
  points: number
  pointsOverrides?: Record<string, number>
}

export interface EspnSettingsResponse {
  id: number
  settings: {
    name: string
    size: number
    scoringSettings: { scoringItems: EspnScoringItem[] }
    rosterSettings: { lineupSlotCounts: Record<string, number> }
    draftSettings?: {
      type?: string
      date?: number
      pickOrder?: number[]
    }
  }
}

export const fetchEspnLeagueSettings = async (
  season: number,
  creds: EspnLeagueCredentials,
): Promise<EspnSettingsResponse> =>
  await fetchJson<EspnSettingsResponse>(
    `${ESPN_HOST}/seasons/${season}/segments/0/leagues/${creds.leagueId}?view=mSettings`,
    leagueHeaders(creds),
  )

export interface EspnDraftDetailResponse {
  draftDetail?: {
    drafted?: boolean
    inProgress?: boolean
    picks?: {
      overallPickNumber: number
      roundId: number
      roundPickNumber: number
      teamId: number
      playerId: number
      keeper?: boolean
    }[]
  }
}

export const fetchEspnDraftDetail = async (
  season: number,
  creds: EspnLeagueCredentials,
): Promise<EspnDraftDetailResponse> =>
  await fetchJson<EspnDraftDetailResponse>(
    `${ESPN_HOST}/seasons/${season}/segments/0/leagues/${creds.leagueId}?view=mDraftDetail`,
    leagueHeaders(creds),
  )
