import { existsSync } from 'node:fs'

import {
  board,
  evaluateCandidates,
  loadOverridesFile,
  upcomingPicksForSlot,
  type Benchmarks,
  type BoardResult,
  type BoardRow,
  type CandidateEvaluation,
  type PlayerOverride,
} from '@twin-digital/football-compute'
import {
  openDatabase,
  Store,
  runIngest,
  type IngestOptions,
  type IngestSummary,
  type LeagueSettings,
  type MarketData,
  type Player,
  type PlayerId,
  type SeasonProjection,
} from '@twin-digital/football-data'
import type { Database } from '@twin-digital/football-data/db/connection'
import type { EspnDraftDetailResponse, EspnLeagueCredentials } from '@twin-digital/football-data/fetchers/espn'

import { mapEspnPicks, mergePicks, slotForTeam, teamOnClock, type EffectivePick } from './picks.js'
import { buildRoster, type RosterPlayer, type RosterSummary } from './roster.js'
import { tierScarcity, type TierScarcity } from './scarcity.js'

export interface AppOptions {
  dbFile: string
  season: number
  myTeamId: number
  espnCreds: EspnLeagueCredentials | null
  fpApiKey?: string | null
  fpProjectionsMode?: IngestOptions['fpProjectionsMode']
  /** Optional overrides.json path; missing file = no overrides, bad file = error surfaced in state. */
  overridesFile?: string | null
  /** Injectable for tests; defaults to the shared connection on `dbFile`. */
  database?: Database
  runIngestFn?: (options: IngestOptions) => Promise<IngestSummary>
  log?: (message: string) => void
  now?: () => Date
}

export interface IngestStatus {
  running: boolean
  startedAt: string | null
  finishedAt: string | null
  lastError: string | null
  lastSummary: { asOf: string; players: number; marketData: number; draftPicks: number } | null
}

export interface DraftedRow {
  playerId: PlayerId
  name: string
  position: Player['position']
  team: Player['team']
  byeWeek: number | null
  points: number | null
  vor: number | null
  tier: number | null
  ecrRank: number | null
  adp: number | null
  injuryStatus: Player['injuryStatus']
  overall: number | null
  teamId: number | null
  source: 'espn' | 'manual'
}

export interface BoardPayload {
  version: number
  computedAt: string
  currentOverall: number
  myNextPicks: number[]
  replacement: BoardResult['replacement']
  benchmarks: Benchmarks
  captureRatio: number
  /** Players carrying a points boost from the overrides file. */
  boostedIds: PlayerId[]
  scarcity: TierScarcity[]
  rows: BoardRow[]
  drafted: DraftedRow[]
}

export interface OverridesStatus {
  file: string | null
  count: number
  boosted: number
  banned: number
  error: string | null
}

export interface EvaluateRow extends CandidateEvaluation {
  tier: number | null
  /** Make-it-back odds joined from the board: my next pick / the pick after. */
  pNextPick: number | null
  pPickAfter: number | null
  boosted: boolean
}

export interface EvaluatePayload {
  version: number
  computedAt: string
  currentOverall: number
  onClockTeamId: number | null
  /** True when the pick on the clock is mine. */
  myTurn: boolean
  myNextPicks: number[]
  candidates: EvaluateRow[]
}

export interface StatePayload {
  version: number
  league: {
    leagueId: string
    name: string
    size: number
    myTeamId: number
    mySlot: number
    totalRounds: number
    totalPicks: number
    draftDate: string | null
  }
  draft: {
    pickCount: number
    polledCount: number
    manualCount: number
    currentOverall: number
    complete: boolean
    onClockTeamId: number | null
    myNextPicks: number[]
    picksUntilMyTurn: number | null
  }
  picks: (EffectivePick & { name: string; position: string; team: string | null })[]
  myRoster: RosterSummary
  /** Live draft grade: (my starters − replacement) / (ceiling − replacement). */
  capture: { ratio: number; teamTotal: number; benchmarks: Benchmarks }
  overrides: OverridesStatus
  ingest: IngestStatus
  asOf: ReturnType<Store['getAsOfStamps']>
}

interface Snapshot {
  settings: LeagueSettings
  players: Player[]
  projections: SeasonProjection[]
  market: MarketData[]
}

/**
 * The server's in-memory hub: DB access, the effective drafted set (polled ∪ manual), cached
 * board computation, and the on-demand ingest refresh. All methods are synchronous except
 * `refresh`; recomputes happen lazily on a version bump.
 */
export class App {
  readonly store: Store
  readonly ingest: IngestStatus = {
    running: false,
    startedAt: null,
    finishedAt: null,
    lastError: null,
    lastSummary: null,
  }

  private readonly options: AppOptions
  private readonly log: (message: string) => void
  private readonly now: () => Date
  private snapshot!: Snapshot
  private playerById = new Map<PlayerId, Player>()
  private espnIdToPlayer = new Map<string, PlayerId>()
  private version = 0
  private snapshotGeneration = 0
  private overrides: PlayerOverride[] = []
  private overridesStatus: OverridesStatus = { file: null, count: 0, boosted: 0, banned: 0, error: null }
  private boardCache: { version: number; payload: BoardPayload } | null = null
  private evaluateCache: { version: number; payload: EvaluatePayload } | null = null
  private fullRowsCache: { generation: number; rowsById: Map<PlayerId, BoardRow> } | null = null
  private warnedUnresolvedEspnIds = new Set<number>()

  constructor(options: AppOptions) {
    this.options = options
    this.log = options.log ?? (() => undefined)
    this.now = options.now ?? (() => new Date())
    this.store = new Store(options.database ?? openDatabase(options.dbFile))
    this.reloadSnapshot()
  }

  reloadSnapshot(): void {
    const settings = this.store.getLeagueSettings()
    if (settings === null) {
      throw new Error(`no league_settings in ${this.options.dbFile} — run \`pnpm ingest\` in the data package first`)
    }
    this.snapshot = {
      settings,
      players: this.store.getPlayers(),
      projections: this.store.getProjections(this.options.season).filter((row) => row.source !== 'consensus'),
      market: this.store.getMarketData(),
    }
    this.playerById = new Map(this.snapshot.players.map((player) => [player.id, player]))
    this.espnIdToPlayer = new Map(
      this.store
        .getMappings()
        .filter((mapping) => mapping.source === 'espn')
        .map((mapping) => [mapping.externalId, mapping.playerId]),
    )
    this.snapshotGeneration += 1
    this.reloadOverrides()
    this.bumpVersion()
  }

  /** A broken overrides file must not take the board down on draft day: record and serve without. */
  private reloadOverrides(): void {
    const file = this.options.overridesFile ?? null
    this.overrides = []
    this.overridesStatus = { file, count: 0, boosted: 0, banned: 0, error: null }
    if (file === null || !existsSync(file)) {
      return
    }
    try {
      this.overrides = loadOverridesFile(file, this.snapshot.players)
      this.overridesStatus.count = this.overrides.length
      this.overridesStatus.boosted = this.overrides.filter((override) => override.action === 'boost').length
      this.overridesStatus.banned = this.overrides.filter((override) => override.action === 'ban').length
    } catch (error) {
      this.overrides = []
      this.overridesStatus.error = error instanceof Error ? error.message : String(error)
      this.log(`overrides: FAILED to load ${file}: ${this.overridesStatus.error}`)
    }
  }

  get settings(): LeagueSettings {
    return this.snapshot.settings
  }

  get overridesInfo(): OverridesStatus {
    return this.overridesStatus
  }

  get mySlot(): number {
    const slot = slotForTeam(this.settings.draft.pickOrder, this.options.myTeamId)
    if (slot === null) {
      throw new Error(`team ${String(this.options.myTeamId)} is not in the league's pick order`)
    }
    return slot
  }

  get totalRounds(): number {
    const slots = this.settings.lineupSlots
    return Object.entries(slots).reduce((sum, [slot, count]) => (slot === 'IR' ? sum : sum + count), 0)
  }

  hasPlayer(playerId: string): boolean {
    return this.playerById.has(playerId as PlayerId)
  }

  effectivePicks(): EffectivePick[] {
    return mergePicks(this.store.getDraftPicks(), this.store.getManualPicks())
  }

  /** Poll-loop sink: persist mapped picks when they changed, bumping the board version. */
  applyDraftDetail(detail: EspnDraftDetailResponse): { total: number; changed: boolean } {
    const mapped = mapEspnPicks(detail, (espnId) => this.espnIdToPlayer.get(espnId))
    for (const espnId of mapped.unresolvedEspnIds) {
      if (!this.warnedUnresolvedEspnIds.has(espnId)) {
        this.warnedUnresolvedEspnIds.add(espnId)
        this.log(`poll: pick references unresolved ESPN player ${String(espnId)} — mark it manually`)
      }
    }
    const stored = this.store.getDraftPicks()
    const key = (picks: { overall: number; playerId: PlayerId }[]): string =>
      picks.map((pick) => `${String(pick.overall)}:${pick.playerId}`).join(',')
    const changed = key(stored) !== key(mapped.picks)
    if (changed) {
      this.store.replaceDraftPicks(mapped.picks, this.now().toISOString())
      this.log(`poll: ${String(mapped.picks.length)} picks (was ${String(stored.length)})`)
      this.bumpVersion()
    }
    return { total: mapped.picks.length, changed }
  }

  markPick(playerId: PlayerId, teamId: number | null): void {
    if (!this.playerById.has(playerId)) {
      throw new UnknownPlayerError(playerId)
    }
    this.store.addManualPick({ playerId, teamId, markedAt: this.now().toISOString() })
    this.bumpVersion()
  }

  unmarkPick(playerId: PlayerId): boolean {
    const removed = this.store.removeManualPick(playerId)
    if (removed) {
      this.bumpVersion()
    }
    return removed
  }

  /** Re-run the full ingest (draft-morning refresh), then reload the snapshot. */
  async refresh(): Promise<void> {
    if (this.ingest.running) {
      return
    }
    this.ingest.running = true
    this.ingest.startedAt = this.now().toISOString()
    this.ingest.lastError = null
    const run = this.options.runIngestFn ?? runIngest
    try {
      const summary = await run({
        dbFile: this.options.dbFile,
        season: this.options.season,
        espnCreds: this.options.espnCreds,
        fpApiKey: this.options.fpApiKey ?? null,
        fpProjectionsMode: this.options.fpProjectionsMode,
        log: this.log,
      })
      this.ingest.lastSummary = {
        asOf: summary.asOf,
        players: summary.players,
        marketData: summary.marketData,
        draftPicks: summary.draftPicks,
      }
    } catch (error) {
      this.ingest.lastError = error instanceof Error ? error.message : String(error)
      this.log(`refresh: ingest failed: ${this.ingest.lastError}`)
    } finally {
      this.ingest.running = false
      this.ingest.finishedAt = this.now().toISOString()
      try {
        this.reloadSnapshot()
      } catch (error) {
        this.log(`refresh: snapshot reload failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  boardPayload(): BoardPayload {
    if (this.boardCache?.version === this.version) {
      return this.boardCache.payload
    }
    const picks = this.effectivePicks()
    const live = board(this.boardState(picks), { overrides: this.overrides, log: this.log })
    const fullRows = this.fullRows()
    const drafted: DraftedRow[] = picks.map((pick) => {
      const row = fullRows.get(pick.playerId)
      const player = this.playerById.get(pick.playerId)
      return {
        playerId: pick.playerId,
        name: row?.name ?? player?.name ?? pick.playerId,
        position: row?.position ?? player?.position ?? 'RB',
        team: row?.team ?? player?.team ?? null,
        byeWeek: row?.byeWeek ?? player?.byeWeek ?? null,
        points: row?.points ?? null,
        vor: row?.vor ?? null,
        tier: row?.tier ?? null,
        ecrRank: row?.ecrRank ?? null,
        adp: row?.adp ?? null,
        injuryStatus: row?.injuryStatus ?? player?.injuryStatus ?? 'UNKNOWN',
        overall: pick.overall,
        teamId: pick.teamId,
        source: pick.source,
      }
    })
    const payload: BoardPayload = {
      version: this.version,
      computedAt: this.now().toISOString(),
      currentOverall: live.currentOverall,
      myNextPicks: live.myNextPicks.filter((pick) => pick <= this.totalPicks),
      replacement: live.replacement,
      benchmarks: live.benchmarks,
      captureRatio: live.captureRatio,
      boostedIds: [...new Set(this.overrides.filter((override) => override.action === 'boost').map((o) => o.playerId))],
      scarcity: tierScarcity(live.rows),
      rows: live.rows,
      drafted,
    }
    this.boardCache = { version: this.version, payload }
    return payload
  }

  /** Candidate rollouts for the pick on the clock, cached on the same version as the board. */
  evaluatePayload(): EvaluatePayload {
    if (this.evaluateCache?.version === this.version) {
      return this.evaluateCache.payload
    }
    const picks = this.effectivePicks()
    const complete = picks.length >= this.totalPicks
    const onClockTeamId =
      complete ? null : teamOnClock(this.settings.draft.pickOrder, picks.length + 1, this.totalRounds)
    const boardRows = new Map(this.boardPayload().rows.map((row) => [row.playerId, row]))
    const boosted = new Set(this.boardPayload().boostedIds)
    const candidates =
      complete ?
        []
      : evaluateCandidates(this.boardState(picks), { overrides: this.overrides }).map((candidate) => {
          const row = boardRows.get(candidate.playerId)
          return {
            ...candidate,
            tier: row?.tier ?? null,
            pNextPick: row?.pNextPick ?? null,
            pPickAfter: row?.pPickAfter ?? null,
            boosted: boosted.has(candidate.playerId),
          }
        })
    const payload: EvaluatePayload = {
      version: this.version,
      computedAt: this.now().toISOString(),
      currentOverall: Math.min(picks.length + 1, this.totalPicks),
      onClockTeamId,
      myTurn: onClockTeamId === this.options.myTeamId,
      myNextPicks: this.boardPayload().myNextPicks,
      candidates,
    }
    this.evaluateCache = { version: this.version, payload }
    return payload
  }

  private boardState(picks: EffectivePick[]) {
    return {
      settings: this.settings,
      players: this.snapshot.players,
      projections: this.snapshot.projections,
      market: this.snapshot.market,
      draftedPlayerIds: picks.map((pick) => pick.playerId),
      myDraftedPlayerIds: picks.filter((pick) => pick.teamId === this.options.myTeamId).map((pick) => pick.playerId),
      myDraftSlot: this.mySlot,
      season: this.options.season,
    }
  }

  statePayload(): StatePayload {
    const { settings } = this
    const picks = this.effectivePicks()
    const totalPicks = this.totalPicks
    const pickCount = picks.length
    const complete = pickCount >= totalPicks
    const currentOverall = Math.min(pickCount + 1, totalPicks)
    const myNextPicks =
      complete ?
        []
      : upcomingPicksForSlot(this.mySlot, settings.size, pickCount + 1, 2).filter((pick) => pick <= totalPicks)
    const myPlayers: RosterPlayer[] = picks
      .filter((pick) => pick.teamId === this.options.myTeamId)
      .map((pick) => {
        const player = this.playerById.get(pick.playerId)
        return player === undefined ?
            { playerId: pick.playerId, name: pick.playerId, position: 'RB' as const, team: null, byeWeek: null }
          : {
              playerId: player.id,
              name: player.name,
              position: player.position,
              team: player.team,
              byeWeek: player.byeWeek,
            }
      })
    return {
      version: this.version,
      league: {
        leagueId: settings.leagueId,
        name: settings.name,
        size: settings.size,
        myTeamId: this.options.myTeamId,
        mySlot: this.mySlot,
        totalRounds: this.totalRounds,
        totalPicks,
        draftDate: settings.draft.date,
      },
      draft: {
        pickCount,
        polledCount: picks.filter((pick) => pick.source === 'espn').length,
        manualCount: picks.filter((pick) => pick.source === 'manual').length,
        currentOverall,
        complete,
        onClockTeamId: complete ? null : teamOnClock(settings.draft.pickOrder, pickCount + 1, this.totalRounds),
        myNextPicks,
        picksUntilMyTurn: myNextPicks[0] !== undefined ? myNextPicks[0] - (pickCount + 1) : null,
      },
      picks: picks.map((pick) => {
        const player = this.playerById.get(pick.playerId)
        return {
          ...pick,
          name: player?.name ?? pick.playerId,
          position: player?.position ?? '?',
          team: player?.team ?? null,
        }
      }),
      myRoster: buildRoster(myPlayers, settings.lineupSlots),
      capture: this.capture(),
      overrides: this.overridesStatus,
      ingest: this.ingest,
      asOf: this.store.getAsOfStamps(),
    }
  }

  private capture(): StatePayload['capture'] {
    const { captureRatio, benchmarks } = this.boardPayload()
    const range = benchmarks.ceiling - benchmarks.replacement
    return { ratio: captureRatio, teamTotal: benchmarks.replacement + captureRatio * range, benchmarks }
  }

  get totalPicks(): number {
    return this.totalRounds * this.settings.size
  }

  private bumpVersion(): void {
    this.version += 1
    this.boardCache = null
    this.evaluateCache = null
  }

  /** Board rows over the full pool (nobody drafted), for displaying drafted players' values. */
  private fullRows(): Map<PlayerId, BoardRow> {
    if (this.fullRowsCache?.generation === this.snapshotGeneration) {
      return this.fullRowsCache.rowsById
    }
    const full = board(
      {
        settings: this.settings,
        players: this.snapshot.players,
        projections: this.snapshot.projections,
        market: this.snapshot.market,
        draftedPlayerIds: [],
        myDraftSlot: this.mySlot,
        season: this.options.season,
      },
      { overrides: this.overrides, log: () => undefined },
    )
    const rowsById = new Map(full.rows.map((row) => [row.playerId, row]))
    this.fullRowsCache = { generation: this.snapshotGeneration, rowsById }
    return rowsById
  }
}

export class UnknownPlayerError extends Error {
  constructor(playerId: string) {
    super(`unknown player id: ${playerId}`)
    this.name = 'UnknownPlayerError'
  }
}
