import { UnknownReferenceValueError } from './errors.js'

/** Canonical: nflverse's 32 three-letter codes, adopted as-is. */
export const NFL_TEAMS = [
  'ARI',
  'ATL',
  'BAL',
  'BUF',
  'CAR',
  'CHI',
  'CIN',
  'CLE',
  'DAL',
  'DEN',
  'DET',
  'GB',
  'HOU',
  'IND',
  'JAX',
  'KC',
  'LA',
  'LAC',
  'LV',
  'MIA',
  'MIN',
  'NE',
  'NO',
  'NYG',
  'NYJ',
  'PHI',
  'PIT',
  'SEA',
  'SF',
  'TB',
  'TEN',
  'WAS',
] as const

export type NflTeam = (typeof NFL_TEAMS)[number]

export const isNflTeam = (value: string): value is NflTeam => (NFL_TEAMS as readonly string[]).includes(value)

/**
 * ESPN `proTeamId` numeric map. Spot-verified (8=DET, 4=CIN, 14=LA, 1=ATL, 26=SEA); remainder
 * community-documented — asserted at ingest by known-player spot checks. `0` = free agent.
 */
export const ESPN_PRO_TEAM_IDS: Record<number, NflTeam> = {
  1: 'ATL',
  2: 'BUF',
  3: 'CHI',
  4: 'CIN',
  5: 'CLE',
  6: 'DAL',
  7: 'DEN',
  8: 'DET',
  9: 'GB',
  10: 'TEN',
  11: 'IND',
  12: 'KC',
  13: 'LV',
  14: 'LA',
  15: 'MIA',
  16: 'MIN',
  17: 'NE',
  18: 'NO',
  19: 'NYG',
  20: 'NYJ',
  21: 'PHI',
  22: 'ARI',
  23: 'PIT',
  24: 'LAC',
  25: 'SF',
  26: 'SEA',
  27: 'TB',
  28: 'WAS',
  29: 'CAR',
  30: 'JAX',
  33: 'BAL',
  34: 'HOU',
}

export const teamFromEspn = (proTeamId: number): NflTeam | null => {
  if (proTeamId === 0) {
    return null
  } // free agent
  const team: NflTeam | undefined = ESPN_PRO_TEAM_IDS[proTeamId]
  if (team === undefined) {
    throw new UnknownReferenceValueError('NflTeam', 'espn', proTeamId)
  }
  return team
}

/** Sleeper abbreviations: `LAR` → `LA`; all 31 others match. Free agent: `null`. */
export const teamFromSleeper = (team: string | null | undefined): NflTeam | null => {
  if (team === null || team === undefined || team === '') {
    return null
  }
  if (team === 'LAR') {
    return 'LA'
  }
  if (isNflTeam(team)) {
    return team
  }
  throw new UnknownReferenceValueError('NflTeam', 'sleeper', team)
}

/** FantasyPros `player_team_id`: `LAR` → `LA`, `JAC` → `JAX` (both observed); free agent `FA` → null. */
export const teamFromFantasyPros = (teamId: string | null | undefined): NflTeam | null => {
  if (teamId === null || teamId === undefined || teamId === '' || teamId === 'FA') {
    return null
  }
  if (teamId === 'LAR') {
    return 'LA'
  }
  if (teamId === 'JAC') {
    return 'JAX'
  }
  if (isNflTeam(teamId)) {
    return teamId
  }
  throw new UnknownReferenceValueError('NflTeam', 'fantasypros', teamId)
}

/** nflverse historical era codes, remapped when aggregating across relocations. */
const ERA_CODES: Record<string, NflTeam> = { OAK: 'LV', SD: 'LAC', STL: 'LA' }

export const teamFromNflverse = (team: string): NflTeam => {
  const remapped: NflTeam | undefined = ERA_CODES[team]
  if (remapped !== undefined) {
    return remapped
  }
  if (isNflTeam(team)) {
    return team
  }
  throw new UnknownReferenceValueError('NflTeam', 'nflverse', team)
}
