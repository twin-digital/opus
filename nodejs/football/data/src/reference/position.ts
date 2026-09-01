import { UnknownReferenceValueError } from './errors.js'

export const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'] as const

export type Position = (typeof POSITIONS)[number]

export const isPosition = (value: string): value is Position => (POSITIONS as readonly string[]).includes(value)

/** Sleeper IDP/special-teams tokens: known, deliberately out of the app's position set. */
const SLEEPER_IDP_POSITIONS = new Set([
  'DB',
  'CB',
  'S',
  'FS',
  'SS',
  'LB',
  'ILB',
  'OLB',
  'DL',
  'DE',
  'DT',
  'NT',
  'IDP',
  'EDGE',
  'P',
  'LS',
])

/**
 * Sleeper: map from `fantasy_positions`, not `position` — depth roles appear in `position`
 * (`position: "FB"` with `fantasy_positions: ["RB"]`, observed). `DEF` → `DST`. Two-way players
 * list a defensive token first (`["DB","WR"]`, observed for Travis Hunter): known IDP tokens are
 * skipped in favor of the first offensive one; a purely defensive list returns null (out of
 * scope); an unrecognized token still throws.
 */
export const positionFromSleeper = (fantasyPositions: readonly string[] | null | undefined): Position | null => {
  if (fantasyPositions === null || fantasyPositions === undefined || fantasyPositions.length === 0) {
    throw new UnknownReferenceValueError('Position', 'sleeper', fantasyPositions)
  }
  for (const raw of fantasyPositions) {
    if (raw === 'DEF') {
      return 'DST'
    }
    if (isPosition(raw)) {
      return raw
    }
    if (!SLEEPER_IDP_POSITIONS.has(raw)) {
      throw new UnknownReferenceValueError('Position', 'sleeper', fantasyPositions)
    }
  }
  return null // known IDP-only player: out of the app's scope
}

/** ESPN `player.defaultPositionId`. 1–5 observed; 16 community-documented. */
const ESPN_POSITION_IDS: Record<number, Position> = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  16: 'DST',
}

export const positionFromEspn = (defaultPositionId: number): Position => {
  const position: Position | undefined = ESPN_POSITION_IDS[defaultPositionId]
  if (position === undefined) {
    throw new UnknownReferenceValueError('Position', 'espn', defaultPositionId)
  }
  return position
}

/** nflverse: map from `position_group` (`FB` rows group to `RB`). */
export const positionFromNflverse = (positionGroup: string): Position => {
  if (isPosition(positionGroup)) {
    return positionGroup
  }
  throw new UnknownReferenceValueError('Position', 'nflverse', positionGroup)
}

/** FantasyPros `player_position_id`: canonical values verbatim. */
export const positionFromFantasyPros = (positionId: string): Position => {
  if (isPosition(positionId)) {
    return positionId
  }
  throw new UnknownReferenceValueError('Position', 'fantasypros', positionId)
}
