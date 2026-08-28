import type { CrosswalkRow } from '../fetchers/crosswalk.js'
import { mintPlayerId, type PlayerId } from '../ids.js'
import type { MatchedBy, PlayerIdMapping } from '../models.js'
import type { DataSource } from '../reference/data-source.js'
import { isNflTeam, type NflTeam } from '../reference/nfl-team.js'
import type { Position } from '../reference/position.js'
import { normalizeName } from './normalize.js'

export interface SourceIdentity {
  name: string
  team: NflTeam | null
  position: Position
}

export interface ResolvedRef {
  playerId: PlayerId
  matchedBy: MatchedBy
}

export interface UnresolvedRef {
  source: DataSource
  externalId: string
  name: string
  team: NflTeam | null
  position: Position
  reason: string
}

/** db_playerids uses MFL-style codes; normalize for the name index only (junk rows → null). */
const CROSSWALK_TEAM_CODES: Record<string, NflTeam> = {
  JAC: 'JAX',
  GBP: 'GB',
  KCC: 'KC',
  NEP: 'NE',
  NOS: 'NO',
  SFO: 'SF',
  TBB: 'TB',
  RAM: 'LA',
  LAR: 'LA',
  SDC: 'LAC',
  SD: 'LAC',
  LVR: 'LV',
  OAK: 'LV',
  STL: 'LA',
}

const crosswalkTeam = (team: string | null): NflTeam | null => {
  if (team === null || team === 'FA' || team === 'FA*') {
    return null
  }
  const remapped: NflTeam | undefined = CROSSWALK_TEAM_CODES[team]
  if (remapped !== undefined) {
    return remapped
  }
  return isNflTeam(team) ? team : null
}

const CROSSWALK_POSITIONS: Record<string, Position> = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', PK: 'K' }

const nameKey = (name: string, team: NflTeam | null, position: Position): string =>
  `${normalizeName(name)}|${team ?? '-'}|${position}`

const mapKey = (source: DataSource, externalId: string): string => `${source}:${externalId}`

const CROSSWALK_ID_COLUMNS: [DataSource, keyof CrosswalkRow][] = [
  ['sleeper', 'sleeperId'],
  ['espn', 'espnId'],
  ['fantasypros', 'fantasyprosId'],
  ['nflverse', 'gsisId'],
]

/**
 * Resolves (source, external id) pairs to canonical PlayerIds, in the design doc's order:
 * exact match in the map → db_playerids re-check → normalized name+team+position match
 * (flagged) → unresolved queue. Never silently joined on name alone. Minting is restricted to
 * the sources that carry full identity for players the crosswalk lags (rookies).
 */
export class PlayerResolver {
  private readonly map = new Map<string, ResolvedRef>()
  private readonly crosswalkIndex = new Map<DataSource, Map<string, CrosswalkRow>>()
  private readonly crosswalkNameIndex = new Map<string, CrosswalkRow | 'ambiguous'>()
  private readonly rowIds = new Map<CrosswalkRow, PlayerId>()
  private readonly crosswalkRowByPlayer = new Map<PlayerId, CrosswalkRow>()
  private readonly canonicalNameIndex = new Map<string, PlayerId | 'ambiguous'>()
  private readonly dstByTeam = new Map<NflTeam, PlayerId>()

  /** Mappings created or re-derived this ingest, to be upserted into the store. */
  readonly newMappings: PlayerIdMapping[] = []
  readonly unresolved: UnresolvedRef[] = []

  constructor(crosswalk: CrosswalkRow[]) {
    for (const [source] of CROSSWALK_ID_COLUMNS) {
      this.crosswalkIndex.set(source, new Map())
    }
    for (const row of crosswalk) {
      if (row.name === null) {
        continue
      }
      for (const [source, column] of CROSSWALK_ID_COLUMNS) {
        const id = row[column]
        if (typeof id === 'string') {
          this.crosswalkIndex.get(source)?.set(id, row)
        }
      }
      const position = row.position !== null ? CROSSWALK_POSITIONS[row.position] : undefined
      if (position !== undefined) {
        const key = nameKey(row.mergeName ?? row.name, crosswalkTeam(row.team), position)
        this.crosswalkNameIndex.set(key, this.crosswalkNameIndex.has(key) ? 'ambiguous' : row)
      }
    }
  }

  /** Load the store's existing mappings so re-ingests keep every previously minted id. */
  seedExisting(mappings: PlayerIdMapping[]): void {
    for (const mapping of mappings) {
      this.map.set(mapKey(mapping.source, mapping.externalId), {
        playerId: mapping.playerId,
        matchedBy: mapping.matchedBy,
      })
    }
  }

  /** Make an already-canonical player findable by name+team+position (and by team for DSTs). */
  registerCanonical(playerId: PlayerId, identity: SourceIdentity): void {
    if (identity.position === 'DST') {
      if (identity.team !== null && !this.dstByTeam.has(identity.team)) {
        this.dstByTeam.set(identity.team, playerId)
      }
      return
    }
    const key = nameKey(identity.name, identity.team, identity.position)
    const existing = this.canonicalNameIndex.get(key)
    if (existing === undefined) {
      this.canonicalNameIndex.set(key, playerId)
    } else if (existing !== playerId) {
      this.canonicalNameIndex.set(key, 'ambiguous')
    }
  }

  crosswalkRowFor(playerId: PlayerId): CrosswalkRow | undefined {
    return this.crosswalkRowByPlayer.get(playerId)
  }

  /** Id-only resolution (exact map → crosswalk); for rows that carry no identity fields (draft picks). */
  resolveExact(source: DataSource, externalId: string): ResolvedRef | null {
    const exact = this.map.get(mapKey(source, externalId))
    if (exact) {
      return exact
    }
    const row = this.crosswalkIndex.get(source)?.get(externalId)
    if (row) {
      return { playerId: this.adoptCrosswalkRow(row), matchedBy: 'crosswalk' }
    }
    return null
  }

  resolve(
    source: DataSource,
    externalId: string,
    identity: SourceIdentity,
    { mint = false }: { mint?: boolean } = {},
  ): ResolvedRef | null {
    // 1. exact match in the id map
    const exact = this.map.get(mapKey(source, externalId))
    if (exact) {
      this.registerCanonical(exact.playerId, identity)
      return exact
    }

    if (identity.position === 'DST') {
      return this.resolveDst(source, externalId, identity, mint)
    }

    // 2. db_playerids re-check
    const row = this.crosswalkIndex.get(source)?.get(externalId)
    if (row) {
      const playerId = this.adoptCrosswalkRow(row)
      this.registerCanonical(playerId, identity)
      return { playerId, matchedBy: 'crosswalk' }
    }

    // 3. normalized name+team+position match, recorded as such and flagged for review
    const key = nameKey(identity.name, identity.team, identity.position)
    const canonical = this.canonicalNameIndex.get(key)
    if (canonical !== undefined && canonical !== 'ambiguous') {
      return this.record(source, externalId, canonical, 'name-team-pos')
    }
    const crosswalkHit = this.crosswalkNameIndex.get(key)
    if (crosswalkHit !== undefined && crosswalkHit !== 'ambiguous') {
      const playerId = this.adoptCrosswalkRow(crosswalkHit)
      this.registerCanonical(playerId, identity)
      return this.record(source, externalId, playerId, 'name-team-pos')
    }

    // 4. mint (identity-carrying source, crosswalk lags the player — the rookie path)
    if (mint) {
      const playerId = mintPlayerId()
      this.registerCanonical(playerId, identity)
      return this.record(source, externalId, playerId, 'minted')
    }

    // 5. unresolved queue
    const reason = canonical === 'ambiguous' || crosswalkHit === 'ambiguous' ? 'ambiguous name match' : 'no match'
    this.unresolved.push({ source, externalId, ...identity, reason })
    return null
  }

  /** DSTs join by team, not name: every source carries the pro team on its DST rows. */
  private resolveDst(
    source: DataSource,
    externalId: string,
    identity: SourceIdentity,
    mint: boolean,
  ): ResolvedRef | null {
    if (identity.team === null) {
      this.unresolved.push({ source, externalId, ...identity, reason: 'DST row without a team' })
      return null
    }
    const existing = this.dstByTeam.get(identity.team)
    if (existing !== undefined) {
      return this.record(source, externalId, existing, 'name-team-pos')
    }
    if (mint) {
      const playerId = mintPlayerId()
      this.dstByTeam.set(identity.team, playerId)
      return this.record(source, externalId, playerId, 'minted')
    }
    this.unresolved.push({ source, externalId, ...identity, reason: 'no canonical DST for team' })
    return null
  }

  /** Mint (or reuse) the canonical player for a crosswalk row and map every id it carries. */
  private adoptCrosswalkRow(row: CrosswalkRow): PlayerId {
    let playerId = this.rowIds.get(row)
    if (playerId === undefined) {
      // Reuse an id any of the row's external ids already map to (from a prior ingest).
      for (const [source, column] of CROSSWALK_ID_COLUMNS) {
        const id = row[column]
        if (typeof id !== 'string') {
          continue
        }
        const existing = this.map.get(mapKey(source, id))
        if (existing) {
          playerId = existing.playerId
          break
        }
      }
      playerId ??= mintPlayerId()
      this.rowIds.set(row, playerId)
      this.crosswalkRowByPlayer.set(playerId, row)
      for (const [source, column] of CROSSWALK_ID_COLUMNS) {
        const id = row[column]
        if (typeof id === 'string' && !this.map.has(mapKey(source, id))) {
          this.record(source, id, playerId, 'crosswalk')
        }
      }
    }
    return playerId
  }

  private record(source: DataSource, externalId: string, playerId: PlayerId, matchedBy: MatchedBy): ResolvedRef {
    const ref: ResolvedRef = { playerId, matchedBy }
    this.map.set(mapKey(source, externalId), ref)
    this.newMappings.push({ playerId, source, externalId, matchedBy })
    return ref
  }
}
