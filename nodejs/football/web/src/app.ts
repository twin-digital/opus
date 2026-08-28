import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import {
  board,
  evaluateCandidates,
  loadOverridesFile,
  loadRoomRulesFile,
  pickThreats,
  takeDistribution,
  teamAtPick,
  upcomingPicksForSlot,
  type Benchmarks,
  type BoardResult,
  type BoardRow,
  type CandidateEvaluation,
  type OverrideSpec,
  type PlayerOverride,
  type PlayerThreat,
  type RoomProfiles,
  type ThreatAttribution,
} from '@twin-digital/football-compute'
import {
  openDatabase,
  Store,
  runIngest,
  type IngestOptions,
  type IngestSummary,
  type LeagueSettings,
  type MarketData,
  type NewsSource,
  type Player,
  type PlayerId,
  type PlayerNewsSignal,
  type Position,
  type SeasonProjection,
} from '@twin-digital/football-data'
import type { Database } from '@twin-digital/football-data/db/connection'
import type { EspnDraftDetailResponse, EspnLeagueCredentials } from '@twin-digital/football-data/fetchers/espn'

import { mulberry32, pickForOpponent } from './mock.js'
import { newsBodyParagraphs } from './news.js'
import { expectedBestAvailable } from './waiting.js'
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
  /** Optional room-rules.json path; missing or broken file = base room model, error logged. */
  roomRulesFile?: string | null
  /** Injectable for tests; defaults to the shared connection on `dbFile`. */
  database?: Database
  runIngestFn?: (options: IngestOptions) => Promise<IngestSummary>
  log?: (message: string) => void
  now?: () => Date
  /** Injectable mock-pacing timer (tests fake it); defaults to an unref'd setTimeout. Returns a cancel. */
  scheduleTimer?: (fn: () => void, ms: number) => () => void
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
  source: 'espn' | 'manual' | 'mock'
}

/** Room-model threat joined onto a board row; present only when threatLevel ≥ 1. */
export interface RowThreat {
  survivalToMyPick: number
  pTakenBeforeMyPick: number
  threatLevel: 1 | 2 | 3
  attribution: ThreatAttribution | null
}

export interface WebBoardRow extends BoardRow {
  /** Per-player news rollup; null when the player has no stored news. */
  news: PlayerNewsSignal | null
  threat: RowThreat | null
}

export interface WaitingPickOutlook {
  pick: number
  /** First-available expectation of best points at the pick (see expectedBestAvailable). */
  expectedBest: number
  /** The candidate likeliest to be the best one still available then. */
  likely: { playerId: PlayerId; name: string; points: number; probFirst: number } | null
}

/** Per-position cost of waiting: best now vs the expectation at my next two picks. */
export interface CostOfWaitingRow {
  position: Position
  now: { playerId: PlayerId; name: string; points: number } | null
  atPicks: WaitingPickOutlook[]
}

export interface BoardPayload {
  version: number
  computedAt: string
  currentOverall: number
  myNextPicks: number[]
  /** The pick threat survival runs to (my next turn — or the one after when I am on the clock). */
  threatPick: number | null
  replacement: BoardResult['replacement']
  benchmarks: Benchmarks
  captureRatio: number
  /** Players carrying a points boost from the overrides file. */
  boostedIds: PlayerId[]
  scarcity: TierScarcity[]
  costOfWaiting: CostOfWaitingRow[]
  rows: WebBoardRow[]
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
  news: PlayerNewsSignal | null
  threat: RowThreat | null
}

export interface NewsItemPayload {
  id: string
  source: NewsSource
  published: string | null
  headline: string
  /** Sanitized plain-text paragraphs of the raw story body. */
  paragraphs: string[]
  assessment: { direction: string; impact: string; summary: string; assessedAt: string } | null
}

export interface PlayerNewsPayload {
  player: {
    playerId: PlayerId
    name: string
    position: Position
    team: Player['team']
    byeWeek: number | null
    injuryStatus: Player['injuryStatus']
  }
  /** Latest Sleeper injury-report headline (carries the body part); null without one. */
  injuryNote: string | null
  items: NewsItemPayload[]
}

export interface OverrideInput {
  playerId: PlayerId
  action: 'ban' | 'boost' | 'clear'
  points?: number
  note?: string
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

export interface MockRecapPick {
  playerId: PlayerId
  name: string
  position: string
  overall: number
  roomAdp: number
  points: number | null
  /** roomAdp − overall: how far past the room's price the pick waited. */
  delta: number
}

export interface MockPublicState {
  active: boolean
  seed: number | null
  /** Seconds between opponent picks; 0 = advance manually. */
  pace: number | null
  pickCount: number
  myTurn: boolean
  /** Set when the mock reaches my turn; the client renders a display-only countdown from it. */
  countdownStartedAt: string | null
  /** Present only once all picks are made: my top value picks vs room ADP. */
  recap: { bestValues: MockRecapPick[] } | null
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
  mock: MockPublicState
  asOf: ReturnType<Store['getAsOfStamps']>
}

interface Snapshot {
  settings: LeagueSettings
  players: Player[]
  projections: SeasonProjection[]
  market: MarketData[]
}

/** A running mock session. Memory only, by design: nothing here ever reaches the database. */
interface MockSession {
  seed: number
  pace: number
  picks: EffectivePick[]
  rng: () => number
  countdownStartedAt: string | null
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
  private profiles: RoomProfiles | null = null
  private boardCache: { version: number; payload: BoardPayload } | null = null
  private evaluateCache: { version: number; payload: EvaluatePayload } | null = null
  private fullRowsCache: { generation: number; rowsById: Map<PlayerId, BoardRow> } | null = null
  private warnedUnresolvedEspnIds = new Set<number>()
  private mock: MockSession | null = null
  private cancelMockTimer: (() => void) | null = null
  private readonly scheduleTimer: (fn: () => void, ms: number) => () => void

  constructor(options: AppOptions) {
    this.options = options
    this.log = options.log ?? (() => undefined)
    this.now = options.now ?? (() => new Date())
    this.scheduleTimer =
      options.scheduleTimer ??
      ((fn, ms) => {
        const timer = setTimeout(fn, ms)
        timer.unref()
        return () => {
          clearTimeout(timer)
        }
      })
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
    this.reloadRoomRules()
    this.bumpVersion()
  }

  /** A broken room-rules file must not take the board down: fall back to the base room model. */
  private reloadRoomRules(): void {
    const file = this.options.roomRulesFile ?? null
    this.profiles = null
    if (file === null || !existsSync(file)) {
      return
    }
    try {
      this.profiles = loadRoomRulesFile(file, this.snapshot.players, (message) => {
        this.log(`room-rules: ${message}`)
      })
    } catch (error) {
      this.log(`room-rules: FAILED to load ${file}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  get roomProfiles(): RoomProfiles | null {
    return this.profiles
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

  /** While a mock is active the mock picks ARE the drafted set; real picks stay stored, unread. */
  effectivePicks(): EffectivePick[] {
    if (this.mock !== null) {
      return [...this.mock.picks]
    }
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

  /** Delete every manual mark (the "Reset manual" button); returns how many were removed. */
  resetManualPicks(): number {
    const picks = this.store.getManualPicks()
    for (const pick of picks) {
      this.store.removeManualPick(pick.playerId)
    }
    if (picks.length > 0) {
      this.bumpVersion()
    }
    return picks.length
  }

  // -- news -------------------------------------------------------------------

  /** One player's news for the drawer: header data plus items (newest first) with sanitized bodies. */
  newsForPlayer(playerId: PlayerId): PlayerNewsPayload {
    const player = this.playerById.get(playerId)
    if (player === undefined) {
      throw new UnknownPlayerError(playerId)
    }
    const entries = this.store.getNewsForPlayer(playerId)
    return {
      player: {
        playerId,
        name: player.name,
        position: player.position,
        team: player.team,
        byeWeek: player.byeWeek,
        injuryStatus: player.injuryStatus,
      },
      injuryNote: entries.find((entry) => entry.item.source === 'sleeper-injury')?.item.headline ?? null,
      items: entries.map(({ item, assessment }) => ({
        id: item.id,
        source: item.source,
        published: item.published,
        headline: item.headline,
        paragraphs: newsBodyParagraphs(item.body),
        assessment:
          assessment === null ? null : (
            {
              direction: assessment.direction,
              impact: assessment.impact,
              summary: assessment.summary,
              assessedAt: assessment.assessedAt,
            }
          ),
      })),
    }
  }

  // -- overrides --------------------------------------------------------------

  /**
   * Rewrite overrides.json for one player and hot-reload. Existing entries for other players are
   * preserved byte-for-value (including unresolvable ones); the player's own entries are replaced
   * by the new action, or just removed on `clear`. Allowed during a mock — overrides are config,
   * not draft state.
   */
  applyOverride(input: OverrideInput): void {
    const file = this.options.overridesFile ?? null
    if (file === null) {
      throw new OverrideFileError('no overrides file configured')
    }
    if (!this.playerById.has(input.playerId)) {
      throw new UnknownPlayerError(input.playerId)
    }
    let specs: OverrideSpec[] = []
    if (existsSync(file)) {
      let parsed: unknown
      try {
        parsed = JSON.parse(readFileSync(file, 'utf8'))
      } catch (error) {
        throw new OverrideFileError(
          `overrides file is not valid JSON — fix it by hand: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      if (!Array.isArray(parsed)) {
        throw new OverrideFileError('overrides file must be a JSON array')
      }
      specs = parsed as OverrideSpec[]
    }
    const kept = specs.filter((spec) => this.specPlayerId(spec) !== input.playerId)
    if (input.action === 'ban') {
      const note = input.note ?? this.latestHarmsSummary(input.playerId)
      kept.push({ player: input.playerId, action: 'ban', ...(note === undefined ? {} : { note }) })
    } else if (input.action === 'boost') {
      if (typeof input.points !== 'number' || !Number.isFinite(input.points) || input.points === 0) {
        throw new OverrideFileError('boost needs a finite non-zero points number')
      }
      kept.push({
        player: input.playerId,
        action: 'boost',
        points: input.points,
        ...(input.note === undefined ? {} : { note: input.note }),
      })
    }
    writeFileSync(file, `${JSON.stringify(kept, null, 2)}\n`)
    this.reloadOverrides()
    this.bumpVersion()
  }

  /** Resolve a stored spec's player to an id the way the loader does; null when it cannot. */
  private specPlayerId(spec: OverrideSpec): PlayerId | null {
    if (typeof spec.player !== 'string') {
      return null
    }
    if (spec.player.startsWith('p-')) {
      return spec.player as PlayerId
    }
    const matches = this.snapshot.players.filter((player) => player.name.toLowerCase() === spec.player.toLowerCase())
    return matches.length === 1 ? (matches[0] as Player).id : null
  }

  /** Default ban note: the newest assessed harms summary, when one exists. */
  private latestHarmsSummary(playerId: PlayerId): string | undefined {
    for (const { assessment } of this.store.getNewsForPlayer(playerId)) {
      if (assessment?.direction === 'harms') {
        return assessment.summary
      }
    }
    return undefined
  }

  // -- mock draft -----------------------------------------------------------

  get myTeamId(): number {
    return this.options.myTeamId
  }

  get mockActive(): boolean {
    return this.mock !== null
  }

  /**
   * Start a rehearsal against a simulated room. Mock picks live only in this session's memory;
   * refused whenever real picks exist so the two states can never mix.
   */
  startMock(options: { pace?: number; seed?: number } = {}): void {
    if (this.mock !== null) {
      throw new MockStateError('a mock draft is already active')
    }
    if (this.store.getDraftPicks().length > 0 || this.store.getManualPicks().length > 0) {
      throw new MockStateError('real draft picks exist — a mock only runs on a clean pre-draft board')
    }
    const seed = Math.floor(options.seed ?? Math.random() * 2 ** 31)
    const pace = options.pace ?? 4
    this.mock = { seed, pace, picks: [], rng: mulberry32(seed), countdownStartedAt: null }
    this.log(`mock: started (seed ${String(seed)}, pace ${String(pace)}s) — nothing is saved`)
    this.bumpVersion()
    this.continueMock()
  }

  /** Discard the whole rehearsal instantly; the real (stored) state was never touched. */
  stopMock(): void {
    if (this.mock === null) {
      return
    }
    this.clearMockTimer()
    this.mock = null
    this.log('mock: stopped — all mock picks discarded')
    this.bumpVersion()
  }

  /** Run opponent picks until my turn or the end of the draft (the pace-0 "Advance" button). */
  advanceMock(): void {
    const mock = this.requireMock()
    this.clearMockTimer()
    let made = 0
    while (mock.picks.length < this.totalPicks && this.mockOnClockTeam() !== this.options.myTeamId) {
      if (!this.mockOpponentPick()) {
        break
      }
      made += 1
    }
    if (made > 0) {
      this.bumpVersion()
    }
    this.continueMock()
  }

  /** My pick, routed here (not markPick) while the mock is active. */
  mockUserPick(playerId: PlayerId): void {
    const mock = this.requireMock()
    if (!this.playerById.has(playerId)) {
      throw new UnknownPlayerError(playerId)
    }
    if (mock.picks.length >= this.totalPicks) {
      throw new MockStateError('the mock draft is complete — stop it to reset')
    }
    if (this.mockOnClockTeam() !== this.options.myTeamId) {
      throw new MockStateError('not your pick — advance the mock (or wait for the room)')
    }
    if (mock.picks.some((pick) => pick.playerId === playerId)) {
      throw new MockStateError(`already drafted in this mock: ${playerId}`)
    }
    this.pushMockPick(playerId, this.options.myTeamId)
    mock.countdownStartedAt = null
    this.bumpVersion()
    this.continueMock()
  }

  mockState(): MockPublicState {
    const mock = this.mock
    if (mock === null) {
      return {
        active: false,
        seed: null,
        pace: null,
        pickCount: 0,
        myTurn: false,
        countdownStartedAt: null,
        recap: null,
      }
    }
    const complete = mock.picks.length >= this.totalPicks
    return {
      active: true,
      seed: mock.seed,
      pace: mock.pace,
      pickCount: mock.picks.length,
      myTurn: !complete && this.mockOnClockTeam() === this.options.myTeamId,
      countdownStartedAt: mock.countdownStartedAt,
      recap: complete ? this.mockRecap(mock.picks) : null,
    }
  }

  /** After any mock pick: pause on my turn (countdown), else keep the room moving on the pace timer. */
  private continueMock(): void {
    const mock = this.mock
    if (mock === null || mock.picks.length >= this.totalPicks) {
      return
    }
    if (this.mockOnClockTeam() === this.options.myTeamId) {
      mock.countdownStartedAt ??= this.now().toISOString()
      return
    }
    if (mock.pace > 0) {
      this.clearMockTimer()
      this.cancelMockTimer = this.scheduleTimer(() => {
        this.mockTick()
      }, mock.pace * 1000)
    }
  }

  /** One pace-timer beat: one opponent pick, then decide what happens next. */
  private mockTick(): void {
    this.cancelMockTimer = null
    const mock = this.mock
    if (mock === null || mock.picks.length >= this.totalPicks) {
      return
    }
    if (this.mockOnClockTeam() === this.options.myTeamId) {
      mock.countdownStartedAt ??= this.now().toISOString()
      return
    }
    if (this.mockOpponentPick()) {
      this.bumpVersion()
    }
    this.continueMock()
  }

  private mockOpponentPick(): boolean {
    const mock = this.requireMock()
    const teamId = this.mockOnClockTeam()
    if (teamId === null) {
      return false
    }
    const drafted = new Set(mock.picks.map((pick) => pick.playerId))
    const counts: Partial<Record<Position, number>> = {}
    for (const pick of mock.picks) {
      if (pick.teamId !== teamId) {
        continue
      }
      const position = this.playerById.get(pick.playerId)?.position
      if (position !== undefined) {
        counts[position] = (counts[position] ?? 0) + 1
      }
    }
    const available = [...this.fullRows().values()]
      .filter((row) => !drafted.has(row.playerId))
      .map((row) => ({ playerId: row.playerId, position: row.position, roomAdp: row.roomAdp, adp: row.adp }))
    const overall = mock.picks.length + 1
    const choice = pickForOpponent({
      available,
      counts,
      round: Math.ceil(overall / this.settings.size),
      totalRounds: this.totalRounds,
      rng: mock.rng,
    })
    if (choice === null) {
      return false
    }
    this.pushMockPick(choice, teamId)
    return true
  }

  private pushMockPick(playerId: PlayerId, teamId: number): void {
    const mock = this.requireMock()
    const overall = mock.picks.length + 1
    mock.picks.push({ playerId, teamId, overall, round: Math.ceil(overall / this.settings.size), source: 'mock' })
  }

  private mockOnClockTeam(): number | null {
    const mock = this.requireMock()
    return teamOnClock(this.settings.draft.pickOrder, mock.picks.length + 1, this.totalRounds)
  }

  private mockRecap(picks: EffectivePick[]): { bestValues: MockRecapPick[] } {
    const rows = this.fullRows()
    const bestValues: MockRecapPick[] = []
    for (const pick of picks) {
      if (pick.teamId !== this.options.myTeamId || pick.overall === null) {
        continue
      }
      const row = rows.get(pick.playerId)
      const roomAdp = row?.roomAdp ?? null
      if (roomAdp === null) {
        continue
      }
      bestValues.push({
        playerId: pick.playerId,
        name: row?.name ?? pick.playerId,
        position: row?.position ?? '?',
        overall: pick.overall,
        roomAdp,
        points: row?.points ?? null,
        delta: roomAdp - pick.overall,
      })
    }
    bestValues.sort((a, b) => b.delta - a.delta)
    return { bestValues: bestValues.slice(0, 5) }
  }

  private requireMock(): MockSession {
    if (this.mock === null) {
      throw new MockStateError('no mock draft is active')
    }
    return this.mock
  }

  private clearMockTimer(): void {
    if (this.cancelMockTimer !== null) {
      this.cancelMockTimer()
      this.cancelMockTimer = null
    }
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
    const myNextPicks = live.myNextPicks.filter((pick) => pick <= this.totalPicks)
    // Threat survival runs to my next turn; on my own turn, to the turn after (the pass question).
    const threatPick = myNextPicks.find((pick) => pick > live.currentOverall) ?? null
    let threats: Map<PlayerId, PlayerThreat> | null = null
    if (this.profiles !== null && threatPick !== null) {
      threats = pickThreats(this.profiles, this.settings.draft.pickOrder, live.currentOverall, threatPick, live.rows, {
        myTeamId: this.options.myTeamId,
      })
    }
    const signals = new Map(this.store.getNewsSignals().map((signal) => [signal.playerId, signal]))
    const rows: WebBoardRow[] = live.rows.map((row) => {
      const threat = threats?.get(row.playerId)
      return {
        ...row,
        news: signals.get(row.playerId) ?? null,
        threat:
          threat === undefined || threat.threatLevel === 0 ?
            null
          : {
              survivalToMyPick: threat.survivalToMyPick,
              pTakenBeforeMyPick: threat.pTakenBeforeMyPick,
              threatLevel: threat.threatLevel,
              attribution: threat.attribution,
            },
      }
    })
    const payload: BoardPayload = {
      version: this.version,
      computedAt: this.now().toISOString(),
      currentOverall: live.currentOverall,
      myNextPicks,
      threatPick,
      replacement: live.replacement,
      benchmarks: live.benchmarks,
      captureRatio: live.captureRatio,
      boostedIds: [...new Set(this.overrides.filter((override) => override.action === 'boost').map((o) => o.playerId))],
      scarcity: tierScarcity(live.rows),
      costOfWaiting: this.costOfWaiting(live.currentOverall, myNextPicks, live.rows),
      rows,
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
      : evaluateCandidates(this.boardState(picks), {
          overrides: this.overrides,
          profiles: this.profiles ?? undefined,
        }).map((candidate) => {
          const row = boardRows.get(candidate.playerId)
          return {
            ...candidate,
            tier: row?.tier ?? null,
            pNextPick: row?.pNextPick ?? null,
            pPickAfter: row?.pPickAfter ?? null,
            boosted: boosted.has(candidate.playerId),
            news: row?.news ?? null,
            threat: row?.threat ?? null,
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

  /**
   * Per-position cost of waiting. Survival to each of my next picks uses the same profiled
   * take-distribution walk as the threat display (skipping my own turns), so the two agree;
   * the expectation over a position is first-available over its top availables by points.
   */
  private costOfWaiting(currentOverall: number, myNextPicks: number[], rows: BoardRow[]): CostOfWaitingRow[] {
    const targets = myNextPicks.slice(0, 2)
    const { pickOrder } = this.settings.draft
    const survival = new Map<PlayerId, number>(rows.map((row) => [row.playerId, 1]))
    const survivalAt = new Map<number, Map<PlayerId, number>>()
    const maxTarget = targets.length > 0 ? Math.max(...targets) : currentOverall
    for (let pick = currentOverall; pick <= maxTarget; pick += 1) {
      if (targets.includes(pick)) {
        survivalAt.set(pick, new Map(survival))
      }
      if (pick === maxTarget) {
        break
      }
      if (teamAtPick(pickOrder, pick) === this.options.myTeamId) {
        continue
      }
      const distribution = takeDistribution(this.profiles, pickOrder, pick, rows)
      for (const row of rows) {
        const taken = distribution.get(row.playerId) ?? 0
        survival.set(row.playerId, (survival.get(row.playerId) ?? 1) * (1 - taken))
      }
    }
    return (['QB', 'RB', 'WR', 'TE'] as const).map((position) => {
      const candidates = rows
        .filter((row) => row.position === position && !row.banned && row.points !== null)
        .map((row) => ({ playerId: row.playerId, name: row.name, points: row.points ?? 0 }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 30)
      const atPicks = targets.map((pick) => {
        const snapshot = survivalAt.get(pick)
        const { expected, likely } = expectedBestAvailable(candidates, (id) => snapshot?.get(id) ?? 1)
        return { pick, expectedBest: expected, likely }
      })
      return { position, now: candidates[0] ?? null, atPicks }
    })
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
      mock: this.mockState(),
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

/** A mock request that conflicts with the current draft/mock state; routes answer it with 409. */
export class MockStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MockStateError'
  }
}

/** An override write that cannot proceed (no file configured, or the file is broken); routes answer 409. */
export class OverrideFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OverrideFileError'
  }
}
