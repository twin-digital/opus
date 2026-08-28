import { fetchJson } from './http.js'

/** One projection row from `GET /projections/nfl/{season}`: flat float stats, snake_case, absent = 0. */
export interface SleeperProjectionRow {
  player_id: string
  season: string
  season_type: string
  stats: Record<string, number>
  player?: {
    injury_status?: string | null
    fantasy_positions?: string[] | null
    team?: string | null
    first_name?: string
    last_name?: string
  } | null
  updated_at?: number | null
}

/** One entry in the players DB (`GET /v1/players/nfl`), keyed by Sleeper player id. */
export interface SleeperPlayer {
  player_id?: string
  first_name?: string
  last_name?: string
  full_name?: string
  team?: string | null
  position?: string | null
  fantasy_positions?: string[] | null
  years_exp?: number | null
  injury_status?: string | null
  injury_body_part?: string | null
  injury_notes?: string | null
  active?: boolean
}

export const SLEEPER_PROJECTION_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'] as const

export const fetchSleeperProjections = async (
  season: number,
  position: (typeof SLEEPER_PROJECTION_POSITIONS)[number],
): Promise<SleeperProjectionRow[]> =>
  await fetchJson<SleeperProjectionRow[]>(
    `https://api.sleeper.app/projections/nfl/${season}?season_type=regular&position[]=${position}`,
  )

export const fetchSleeperPlayersDb = async (): Promise<Record<string, SleeperPlayer>> =>
  await fetchJson<Record<string, SleeperPlayer>>('https://api.sleeper.app/v1/players/nfl')
