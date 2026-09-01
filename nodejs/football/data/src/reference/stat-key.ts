import { UnknownReferenceValueError } from './errors.js'

/**
 * The single authority for stat identity across sources. K and DST use disjoint vocabularies
 * (FG distance buckets; sacks/points-allowed tiers) — deferred until the board needs them; they
 * extend this same table when added.
 */
export const STAT_KEYS = [
  'passAtt',
  'passCmp',
  'passYd',
  'passTd',
  'passInt',
  'rushAtt',
  'rushYd',
  'rushTd',
  'rec',
  'recTgt',
  'recYd',
  'recTd',
  'fumLost',
  'twoPtPass',
  'twoPtRush',
  'twoPtRec',
] as const

export type StatKey = (typeof STAT_KEYS)[number]

export interface StatKeyMapping {
  /** Sleeper `stats.{key}` — flat float fields, snake_case, absent = zero. */
  sleeper: string | null
  /** ESPN numeric statId (numeric-string key in `player.stats[].stats`). Community-documented
   *  (cwendt94/espn-api constants); ingest cross-checks by rescoring vs `appliedTotal`. */
  espnStatId: number
  /** nflverse column(s); multiple columns sum to the canonical value. */
  nflverse: string[]
  /** FantasyPros positional table header — meaning depends on the position page. */
  fpHeader: string | null
}

export const STAT_KEY_MAPPINGS: Record<StatKey, StatKeyMapping> = {
  passAtt: { sleeper: 'pass_att', espnStatId: 0, nflverse: ['attempts'], fpHeader: 'ATT' },
  passCmp: { sleeper: 'pass_cmp', espnStatId: 1, nflverse: ['completions'], fpHeader: 'CMP' },
  passYd: { sleeper: 'pass_yd', espnStatId: 3, nflverse: ['passing_yards'], fpHeader: 'YDS' },
  passTd: { sleeper: 'pass_td', espnStatId: 4, nflverse: ['passing_tds'], fpHeader: 'TDS' },
  passInt: { sleeper: 'pass_int', espnStatId: 20, nflverse: ['interceptions'], fpHeader: 'INTS' },
  rushAtt: { sleeper: 'rush_att', espnStatId: 23, nflverse: ['carries'], fpHeader: 'ATT' },
  rushYd: { sleeper: 'rush_yd', espnStatId: 24, nflverse: ['rushing_yards'], fpHeader: 'YDS' },
  rushTd: { sleeper: 'rush_td', espnStatId: 25, nflverse: ['rushing_tds'], fpHeader: 'TDS' },
  rec: { sleeper: 'rec', espnStatId: 53, nflverse: ['receptions'], fpHeader: 'REC' },
  recTgt: { sleeper: null, espnStatId: 58, nflverse: ['targets'], fpHeader: null },
  recYd: { sleeper: 'rec_yd', espnStatId: 42, nflverse: ['receiving_yards'], fpHeader: 'YDS' },
  recTd: { sleeper: 'rec_td', espnStatId: 43, nflverse: ['receiving_tds'], fpHeader: 'TDS' },
  fumLost: {
    sleeper: 'fum_lost',
    espnStatId: 72,
    nflverse: ['sack_fumbles_lost', 'rushing_fumbles_lost', 'receiving_fumbles_lost'],
    fpHeader: 'FL',
  },
  twoPtPass: { sleeper: 'pass_2pt', espnStatId: 19, nflverse: ['passing_2pt_conversions'], fpHeader: null },
  twoPtRush: { sleeper: 'rush_2pt', espnStatId: 26, nflverse: ['rushing_2pt_conversions'], fpHeader: null },
  twoPtRec: { sleeper: 'rec_2pt', espnStatId: 44, nflverse: ['receiving_2pt_conversions'], fpHeader: null },
}

/** Sleeper stat field name → canonical key, for the keys we map. */
export const SLEEPER_STAT_FIELDS: ReadonlyMap<string, StatKey> = new Map(
  (Object.entries(STAT_KEY_MAPPINGS) as [StatKey, StatKeyMapping][])
    .filter(([, m]) => m.sleeper !== null)
    .map(([key, m]) => [m.sleeper as string, key]),
)

/** ESPN statId → canonical key. */
export const ESPN_STAT_IDS: ReadonlyMap<number, StatKey> = new Map(
  (Object.entries(STAT_KEY_MAPPINGS) as [StatKey, StatKeyMapping][]).map(([key, m]) => [m.espnStatId, key]),
)

export const statKeyFromEspn = (statId: number): StatKey => {
  const key = ESPN_STAT_IDS.get(statId)
  if (key === undefined) {
    throw new UnknownReferenceValueError('StatKey', 'espn', statId)
  }
  return key
}
