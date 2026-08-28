import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  openDatabase,
  Store,
  type IngestSummary,
  type LeagueSettings,
  type MarketData,
  type Player,
  type PlayerId,
  type Position,
  type SeasonProjection,
  type StatKey,
} from '@twin-digital/football-data'

import { App } from './app.js'
import type { PollStatus } from './poller.js'
import { handleRoute, type PollerLike, type RouteContext } from './routes.js'

// -- fixture ----------------------------------------------------------------

const PICK_ORDER = [8, 1, 9, 11, 7, 4, 10, 12, 3, 5, 13, 14]

const SETTINGS: LeagueSettings = {
  leagueId: '1838733150',
  name: 'Fixture League',
  size: 12,
  scoringRules: [
    { stat: 'passYd', points: 0.04 },
    { stat: 'passTd', points: 4 },
    { stat: 'rushYd', points: 0.1 },
    { stat: 'rushTd', points: 6 },
    { stat: 'rec', points: 0.5 },
    { stat: 'recYd', points: 0.1 },
    { stat: 'recTd', points: 6 },
  ],
  lineupSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BENCH: 5, IR: 1 },
  draft: { type: 'snake', date: '2026-08-28T20:00:00.000Z', pickOrder: PICK_ORDER },
}

interface FixturePlayer {
  id: PlayerId
  name: string
  position: Position
  byeWeek: number
  stats: Partial<Record<StatKey, number>>
  adp: number
  espnId: string
}

type AddPlayers = (position: Position, count: number, stats: (i: number) => Partial<Record<StatKey, number>>) => void

const makePool = (build: (add: AddPlayers) => void): FixturePlayer[] => {
  const pool: FixturePlayer[] = []
  let n = 0
  build((position, count, stats) => {
    for (let i = 0; i < count; i += 1) {
      n += 1
      pool.push({
        id: `p-${position}${String(i + 1)}` as PlayerId,
        name: `${position} Player ${String(i + 1)}`,
        position,
        byeWeek: (i % 3) + 7,
        stats: stats(i),
        adp: n,
        espnId: String(100 + n),
      })
    }
  })
  return pool
}

const FIXTURE_PLAYERS: FixturePlayer[] = makePool((add) => {
  add('RB', 8, (i) => ({ rushYd: 1600 - 150 * i, rushTd: 12 - i, rec: 60 - 5 * i, recYd: 400 - 20 * i }))
  add('WR', 8, (i) => ({ rec: 110 - 7 * i, recYd: 1500 - 100 * i, recTd: 10 - i }))
  add('QB', 4, (i) => ({ passYd: 4800 - 200 * i, passTd: 38 - 3 * i, rushYd: 300 - 50 * i }))
  add('TE', 4, (i) => ({ rec: 90 - 10 * i, recYd: 1000 - 100 * i, recTd: 8 - i }))
  add('K', 2, () => ({}))
  add('DST', 2, () => ({}))
})

/** 188 players — enough for a full 168-pick mocked draft, values declining but positive. */
const DEEP_PLAYERS: FixturePlayer[] = makePool((add) => {
  add('RB', 60, (i) => ({ rushYd: 1600 - 20 * i, rushTd: 12 - 0.15 * i, rec: 60 - 0.8 * i, recYd: 400 - 5 * i }))
  add('WR', 60, (i) => ({ rec: 110 - 1.5 * i, recYd: 1500 - 20 * i, recTd: 10 - 0.15 * i }))
  add('QB', 20, (i) => ({ passYd: 4800 - 150 * i, passTd: 38 - 1.5 * i, rushYd: 300 - 15 * i }))
  add('TE', 20, (i) => ({ rec: 90 - 4 * i, recYd: 1000 - 45 * i, recTd: 8 - 0.35 * i }))
  add('K', 14, () => ({}))
  add('DST', 14, () => ({}))
})

const seed = (store: Store, pool: FixturePlayer[] = FIXTURE_PLAYERS): void => {
  const players: Player[] = pool.map((fixture) => ({
    id: fixture.id,
    name: fixture.name,
    position: fixture.position,
    team: 'DET',
    byeWeek: fixture.byeWeek,
    age: 25,
    yearsExp: 3,
    injuryStatus: 'ACTIVE',
  }))
  store.replacePlayers(players, '2026-08-27T00:00:00Z')
  const projections: SeasonProjection[] = pool
    .filter((f) => f.position !== 'K' && f.position !== 'DST')
    .map((fixture) => ({
      playerId: fixture.id,
      source: 'sleeper' as const,
      season: 2026,
      gamesPlayed: 17,
      stats: fixture.stats,
      prescored: {},
    }))
  store.replaceProjections('sleeper', 2026, projections, '2026-08-27T00:00:00Z')
  const market: MarketData[] = pool.map((fixture) => ({
    playerId: fixture.id,
    adp: { sleeper: { half: fixture.adp } },
    ecr: { rank: fixture.adp, posRank: `${fixture.position}1`, tier: 1, best: 1, worst: 40, stdDev: 3 },
    percentRostered: 90,
    asOf: '2026-08-27T00:00:00Z',
  }))
  store.replaceMarketData(market)
  store.replaceLeagueSettings(SETTINGS, '2026-08-27T00:00:00Z')
  for (const fixture of pool) {
    store.upsertMapping({ playerId: fixture.id, source: 'espn', externalId: fixture.espnId, matchedBy: 'crosswalk' })
  }
}

const makePoller = (): PollerLike => {
  const status: PollStatus = {
    enabled: false,
    inFlight: false,
    intervalMs: 5000,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    consecutiveFailures: 0,
    nextDelayMs: 5000,
  }
  return {
    status,
    setEnabled: (enabled: boolean) => {
      status.enabled = enabled
    },
  }
}

interface TestContext {
  app: App
  poller: PollerLike
  context: RouteContext
  timers: FakeTimers
}

/** Injectable stand-in for setTimeout: tests fire pending callbacks by hand — no real sleeps. */
interface FakeTimers {
  scheduleTimer: (fn: () => void, ms: number) => () => void
  /** Run the next pending callback; false when none are queued. */
  fire: () => boolean
  pending: () => number
  lastMs: () => number | null
}

const makeFakeTimers = (): FakeTimers => {
  const queue: { fn: () => void }[] = []
  let last: number | null = null
  return {
    scheduleTimer: (fn, ms) => {
      const entry = { fn }
      queue.push(entry)
      last = ms
      return () => {
        const index = queue.indexOf(entry)
        if (index >= 0) {
          queue.splice(index, 1)
        }
      }
    },
    fire: () => {
      const entry = queue.shift()
      if (entry === undefined) {
        return false
      }
      entry.fn()
      return true
    },
    pending: () => queue.length,
    lastMs: () => last,
  }
}

const makeApp = (
  options: {
    runIngestFn?: (o: unknown) => Promise<IngestSummary>
    overridesFile?: string
    roomRulesFile?: string
    pool?: FixturePlayer[]
  } = {},
): TestContext => {
  const database = openDatabase(':memory:')
  seed(new Store(database), options.pool)
  const timers = makeFakeTimers()
  const app = new App({
    dbFile: ':memory:',
    season: 2026,
    myTeamId: 13,
    espnCreds: null,
    database,
    runIngestFn: options.runIngestFn,
    overridesFile: options.overridesFile,
    roomRulesFile: options.roomRulesFile,
    scheduleTimer: timers.scheduleTimer,
  })
  const poller = makePoller()
  return { app, poller, context: { app, poller }, timers }
}

const writeOverrides = (specs: unknown[]): string => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'football-overrides-')), 'overrides.json')
  writeFileSync(file, JSON.stringify(specs))
  return file
}

const writeRoomRules = (spec: unknown): string => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'football-rules-')), 'room-rules.json')
  writeFileSync(file, JSON.stringify(spec))
  return file
}

/** Seed one player's news: an assessed item and, optionally, an unassessed one. */
const seedNews = (
  store: Store,
  playerId: PlayerId,
  assessed: { direction: 'improves' | 'harms' | 'unclear'; impact: 'low' | 'med' | 'high'; summary: string },
  options: { body?: string; unassessed?: boolean } = {},
): void => {
  store.upsertNewsItems(
    [
      {
        playerId,
        source: 'espn-news',
        externalId: `assessed-${playerId}`,
        published: '2026-08-27T12:00:00Z',
        headline: `Assessed headline for ${playerId}`,
        body: options.body ?? null,
      },
      ...(options.unassessed === true ?
        [
          {
            playerId,
            source: 'espn-news' as const,
            externalId: `raw-${playerId}`,
            published: '2026-08-26T12:00:00Z',
            headline: `Unassessed headline for ${playerId}`,
            body: null,
          },
        ]
      : []),
    ],
    '2026-08-27T13:00:00Z',
  )
  const item = store.getNewsItems().find((row) => row.externalId === `assessed-${playerId}`)
  if (item === undefined) {
    throw new Error('seedNews: item not stored')
  }
  store.upsertAssessment({
    newsId: item.id,
    direction: assessed.direction,
    impact: assessed.impact,
    summary: assessed.summary,
    assessedAt: '2026-08-27T14:00:00Z',
    assessedBy: 'test',
  })
}

const call = (context: RouteContext, method: string, path: string, body?: unknown): { status: number; json: never } => {
  const result = handleRoute(context, method, path, body)
  return { status: result.status, json: JSON.parse(result.body) as never }
}

// -- tests ------------------------------------------------------------------

describe('routes', () => {
  it('serves the board page', () => {
    const { context } = makeApp()
    const result = handleRoute(context, 'GET', '/', undefined)
    expect(result.status).toBe(200)
    expect(result.contentType).toContain('text/html')
    expect(result.body).toContain('<title>Draft Board</title>')
  })

  it('reports pre-draft state: pick 1, slot 11 next at 11 and 14', () => {
    const { context } = makeApp()
    const { status, json } = call(context, 'GET', '/api/state')
    const state = json as {
      league: { mySlot: number; totalRounds: number; totalPicks: number }
      draft: Record<string, unknown>
      asOf: { player: string }
      poll: { enabled: boolean }
    }
    expect(status).toBe(200)
    expect(state.league.mySlot).toBe(11)
    expect(state.league.totalRounds).toBe(14)
    expect(state.league.totalPicks).toBe(168)
    expect(state.draft).toMatchObject({
      pickCount: 0,
      currentOverall: 1,
      onClockTeamId: 8,
      myNextPicks: [11, 14],
      picksUntilMyTurn: 10,
      complete: false,
    })
    expect(state.asOf.player).toBe('2026-08-27T00:00:00Z')
    expect(state.poll.enabled).toBe(false)
  })

  it('serves the board sorted by VOR with scarcity summaries', () => {
    const { context } = makeApp()
    const { status, json } = call(context, 'GET', '/api/board')
    const board = json as {
      rows: { vor: number | null; playerId: string; tier: number | null }[]
      scarcity: { position: string; tier: number; remaining: number }[]
      myNextPicks: number[]
    }
    expect(status).toBe(200)
    expect(board.myNextPicks).toEqual([11, 14])
    expect(board.rows.length).toBeGreaterThan(20)
    const vors = board.rows.filter((row) => row.vor !== null).map((row) => row.vor as number)
    expect(vors).toEqual([...vors].sort((a, b) => b - a))
    expect(board.scarcity.map((entry) => entry.position)).toEqual(['QB', 'RB', 'WR', 'TE'])
  })

  it('validates manual-mark input', () => {
    const { context } = makeApp()
    expect(call(context, 'POST', '/api/mark', { nope: true }).status).toBe(400)
    expect(call(context, 'POST', '/api/mark', { playerId: 'p-RB1', teamId: 'someone' }).status).toBe(400)
    expect(call(context, 'POST', '/api/mark', { playerId: 'p-nobody' }).status).toBe(404)
    expect(call(context, 'POST', '/api/poll', {}).status).toBe(400)
    expect(call(context, 'GET', '/api/nope').status).toBe(404)
  })

  it('marks picks: board drops them, roster and odds update, unmark restores', () => {
    const { context } = makeApp()
    const before = call(context, 'GET', '/api/board').json as {
      rows: { playerId: string; pNextPick: number | null }[]
    }
    const probe = before.rows.find((row) => row.playerId === 'p-WR3')
    expect(probe?.pNextPick).not.toBeNull()

    expect(call(context, 'POST', '/api/mark', { playerId: 'p-RB1', teamId: 'unknown' }).status).toBe(200)
    const marked = call(context, 'POST', '/api/mark', { playerId: 'p-WR1', teamId: 13 }).json as {
      draft: { pickCount: number; currentOverall: number; manualCount: number }
      myRoster: { slots: { slot: string; players: { name: string }[] }[] }
      picks: { playerId: string; source: string }[]
    }
    expect(marked.draft).toMatchObject({ pickCount: 2, currentOverall: 3, manualCount: 2 })
    expect(marked.picks.map((pick) => pick.playerId)).toEqual(['p-RB1', 'p-WR1'])
    const wrSlot = marked.myRoster.slots.find((slot) => slot.slot === 'WR')
    expect(wrSlot?.players.map((player) => player.name)).toEqual(['WR Player 1'])

    const after = call(context, 'GET', '/api/board').json as {
      currentOverall: number
      rows: { playerId: string; pNextPick: number | null }[]
      drafted: { playerId: string; source: string; teamId: number | null }[]
    }
    expect(after.currentOverall).toBe(3)
    expect(after.rows.some((row) => row.playerId === 'p-RB1' || row.playerId === 'p-WR1')).toBe(false)
    expect(after.drafted.map((row) => row.playerId)).toEqual(['p-RB1', 'p-WR1'])
    expect(after.drafted[1]).toMatchObject({ source: 'manual', teamId: 13 })
    // make-it-back odds are conditioned on the pick now on the clock, so they shift
    const probeAfter = after.rows.find((row) => row.playerId === 'p-WR3')
    expect(probeAfter?.pNextPick).not.toBeNull()
    expect(probeAfter?.pNextPick).not.toBe(probe?.pNextPick)

    const unmarked = call(context, 'POST', '/api/unmark', { playerId: 'p-RB1' }).json as { removed: boolean }
    expect(unmarked.removed).toBe(true)
    const restored = call(context, 'GET', '/api/board').json as { rows: { playerId: string }[] }
    expect(restored.rows.some((row) => row.playerId === 'p-RB1')).toBe(true)
  })

  it('merges polled picks over manual marks by player', () => {
    const { app, context } = makeApp()
    call(context, 'POST', '/api/mark', { playerId: 'p-RB1', teamId: 'unknown' })
    app.applyDraftDetail({
      draftDetail: {
        inProgress: true,
        picks: [
          { overallPickNumber: 1, roundId: 1, roundPickNumber: 1, teamId: 8, playerId: 101 }, // p-RB1
          { overallPickNumber: 2, roundId: 1, roundPickNumber: 2, teamId: 1, playerId: 999999 }, // unresolved
          { overallPickNumber: 3, roundId: 1, roundPickNumber: 3, teamId: 9, playerId: -1 }, // placeholder
        ],
      },
    })
    const state = call(context, 'GET', '/api/state').json as {
      draft: { pickCount: number; polledCount: number; manualCount: number }
      picks: { playerId: string; source: string; overall: number | null }[]
    }
    expect(state.draft).toMatchObject({ pickCount: 1, polledCount: 1, manualCount: 0 })
    expect(state.picks[0]).toMatchObject({ playerId: 'p-RB1', source: 'espn', overall: 1 })
  })

  it('toggles polling', () => {
    const { poller, context } = makeApp()
    const { status, json } = call(context, 'POST', '/api/poll', { enabled: true })
    expect(status).toBe(200)
    expect(poller.status.enabled).toBe(true)
    expect((json as { poll: { enabled: boolean } }).poll.enabled).toBe(true)
  })

  it('evaluates candidates when it is not my turn: ranked, deltas anchored at best', () => {
    const { context } = makeApp()
    const { status, json } = call(context, 'GET', '/api/evaluate')
    const payload = json as {
      myTurn: boolean
      onClockTeamId: number | null
      currentOverall: number
      candidates: { estTeamScore: number; deltaVsBest: number; landsOn: string; pNextPick: number | null }[]
    }
    expect(status).toBe(200)
    expect(payload.myTurn).toBe(false)
    expect(payload.onClockTeamId).toBe(8)
    expect(payload.currentOverall).toBe(1)
    expect(payload.candidates.length).toBeGreaterThan(5)
    const scores = payload.candidates.map((candidate) => candidate.estTeamScore)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    expect(payload.candidates[0]?.deltaVsBest).toBe(0)
    expect(payload.candidates.every((candidate) => candidate.deltaVsBest <= 0)).toBe(true)
    // make-it-back odds are joined from the board rows
    expect(payload.candidates[0]?.pNextPick).not.toBeNull()
  })

  it('flags my turn once ten picks are in, excluding drafted players from the slate', () => {
    const { context } = makeApp()
    const gone = ['p-RB1', 'p-RB2', 'p-RB3', 'p-RB4', 'p-WR1', 'p-WR2', 'p-WR3', 'p-QB1', 'p-QB2', 'p-TE1']
    for (const playerId of gone) {
      expect(call(context, 'POST', '/api/mark', { playerId, teamId: 'unknown' }).status).toBe(200)
    }
    const payload = call(context, 'GET', '/api/evaluate').json as {
      myTurn: boolean
      onClockTeamId: number | null
      currentOverall: number
      myNextPicks: number[]
      candidates: { playerId: string; estTeamScore: number; landsOn: string }[]
    }
    expect(payload.myTurn).toBe(true)
    expect(payload.onClockTeamId).toBe(13)
    expect(payload.currentOverall).toBe(11)
    expect(payload.myNextPicks[0]).toBe(11)
    expect(payload.candidates.length).toBeGreaterThan(0)
    expect(payload.candidates.some((candidate) => gone.includes(candidate.playerId))).toBe(false)
    expect(payload.candidates[0]?.estTeamScore).toBeGreaterThan(0)
  })

  it('reports capture: zero pre-draft, rising with my picks', () => {
    const { context } = makeApp()
    const before = call(context, 'GET', '/api/state').json as {
      capture: { ratio: number; teamTotal: number; benchmarks: { ceiling: number; replacement: number } }
    }
    expect(before.capture.benchmarks.ceiling).toBeGreaterThan(before.capture.benchmarks.replacement)
    expect(before.capture.ratio).toBe(0)
    call(context, 'POST', '/api/mark', { playerId: 'p-RB1', teamId: 13 })
    const after = call(context, 'GET', '/api/state').json as { capture: { ratio: number; teamTotal: number } }
    expect(after.capture.ratio).toBeGreaterThan(0)
    expect(after.capture.teamTotal).toBeGreaterThan(before.capture.teamTotal)
  })

  it('applies overrides: bans leave the board as data, boosts shift points and are flagged', () => {
    const file = writeOverrides([
      { player: 'RB Player 1', action: 'ban' },
      { player: 'WR Player 1', action: 'boost', points: 50 },
    ])
    const plain = makeApp()
    const { context } = makeApp({ overridesFile: file })

    const board = call(context, 'GET', '/api/board').json as {
      boostedIds: string[]
      rows: { playerId: string; points: number | null; banned: boolean }[]
    }
    const plainBoard = call(plain.context, 'GET', '/api/board').json as {
      rows: { playerId: string; points: number | null }[]
    }
    expect(board.boostedIds).toEqual(['p-WR1'])
    expect(board.rows.find((row) => row.playerId === 'p-RB1')?.banned).toBe(true)
    const boosted = board.rows.find((row) => row.playerId === 'p-WR1')?.points
    const unboosted = plainBoard.rows.find((row) => row.playerId === 'p-WR1')?.points
    expect(boosted).toBeCloseTo((unboosted ?? 0) + 50, 5)

    const evaluate = call(context, 'GET', '/api/evaluate').json as {
      candidates: { playerId: string; boosted: boolean }[]
    }
    expect(evaluate.candidates.some((candidate) => candidate.playerId === 'p-RB1')).toBe(false)
    expect(evaluate.candidates.find((candidate) => candidate.playerId === 'p-WR1')?.boosted).toBe(true)

    const state = call(context, 'GET', '/api/state').json as {
      overrides: { count: number; boosted: number; banned: number; error: string | null }
    }
    expect(state.overrides).toMatchObject({ count: 2, boosted: 1, banned: 1, error: null })
  })

  it('serves without overrides when the file is broken, surfacing the error', () => {
    const file = writeOverrides([{ player: 'Nobody Real', action: 'ban' }])
    const { context } = makeApp({ overridesFile: file })
    const state = call(context, 'GET', '/api/state').json as { overrides: { count: number; error: string | null } }
    expect(state.overrides.count).toBe(0)
    expect(state.overrides.error).toContain('Nobody Real')
    expect(call(context, 'GET', '/api/board').status).toBe(200)
    expect(call(context, 'GET', '/api/evaluate').status).toBe(200)
  })

  it('runs the ingest refresh once at a time', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const summary: IngestSummary = {
      asOf: '2026-08-28T12:00:00Z',
      season: 2026,
      players: 28,
      mappingsBySource: {},
      projectionsBySource: {},
      marketData: 28,
      leagueSettings: 1,
      draftPicks: 0,
      unresolved: [],
      validation: {
        sleeperChecked: 0,
        sleeperMaxDelta: 0,
        espnChecked: 0,
        espnMaxDelta: 0,
        proTeamSpotChecks: 0,
        fantasyProsChecked: 0,
        fantasyProsMaxDelta: 0,
        fantasyProsFormat: null,
      },
      fantasyProsLastUpdated: null,
      fantasyProsProjections: { path: 'skip', apiCalls: 0, rowsByPosition: {}, keptAsOf: null },
      leagueMessage: null,
    }
    const { app, context } = makeApp({ runIngestFn: () => gate.then(() => summary) })
    expect(call(context, 'POST', '/api/refresh').status).toBe(202)
    expect(app.ingest.running).toBe(true)
    expect(call(context, 'POST', '/api/refresh').status).toBe(409)
    release()
    await vi.waitFor(() => {
      expect(app.ingest.running).toBe(false)
    })
    expect(app.ingest.lastError).toBeNull()
    expect(app.ingest.lastSummary).toMatchObject({ players: 28 })
  })

  it('captures an ingest failure instead of throwing', async () => {
    const { app, context } = makeApp({ runIngestFn: () => Promise.reject(new Error('fantasypros 503')) })
    expect(call(context, 'POST', '/api/refresh').status).toBe(202)
    await vi.waitFor(() => {
      expect(app.ingest.running).toBe(false)
    })
    expect(app.ingest.lastError).toBe('fantasypros 503')
  })
})

// -- mock draft ---------------------------------------------------------------

interface MockStateJson {
  draft: { pickCount: number; complete: boolean; onClockTeamId: number | null }
  picks: { playerId: string; teamId: number | null; overall: number | null; round: number | null; source: string }[]
  capture: { ratio: number }
  mock: {
    active: boolean
    seed: number | null
    pace: number | null
    pickCount: number
    myTurn: boolean
    countdownStartedAt: string | null
    recap: { bestValues: { playerId: string; overall: number; roomAdp: number; delta: number }[] } | null
  }
}

describe('mock draft', () => {
  const mock = (context: RouteContext, body: Record<string, unknown>): { status: number; json: never } =>
    call(context, 'POST', '/api/mock', body)
  const asState = (json: never): MockStateJson => json
  const topCandidate = (context: RouteContext): string => {
    const evaluate = call(context, 'GET', '/api/evaluate').json as { candidates: { playerId: string }[] }
    const playerId = evaluate.candidates[0]?.playerId
    expect(playerId).toBeDefined()
    return playerId ?? ''
  }

  it('starts only on a clean pre-draft board with the poll off', () => {
    const manual = makeApp()
    call(manual.context, 'POST', '/api/mark', { playerId: 'p-RB1', teamId: 'unknown' })
    expect(mock(manual.context, { action: 'start' }).status).toBe(409)

    const polled = makeApp()
    polled.app.applyDraftDetail({
      draftDetail: {
        inProgress: true,
        picks: [{ overallPickNumber: 1, roundId: 1, roundPickNumber: 1, teamId: 8, playerId: 101 }],
      },
    })
    expect(mock(polled.context, { action: 'start' }).status).toBe(409)

    const polling = makeApp()
    call(polling.context, 'POST', '/api/poll', { enabled: true })
    expect(mock(polling.context, { action: 'start' }).status).toBe(409)

    const clean = makeApp()
    const started = mock(clean.context, { action: 'start', pace: 0, seed: 1 })
    expect(started.status).toBe(200)
    expect(asState(started.json).mock).toMatchObject({ active: true, seed: 1, pace: 0, pickCount: 0, myTurn: false })
    expect(mock(clean.context, { action: 'start' }).status).toBe(409) // already active
  })

  it('validates mock input and refuses actions without an active mock', () => {
    const { context } = makeApp()
    expect(mock(context, {}).status).toBe(400)
    expect(mock(context, { action: 'nope' }).status).toBe(400)
    expect(mock(context, { action: 'start', pace: -1 }).status).toBe(400)
    expect(mock(context, { action: 'start', seed: 'x' }).status).toBe(400)
    expect(mock(context, { action: 'pick' }).status).toBe(400)
    expect(mock(context, { action: 'advance' }).status).toBe(409)
    expect(mock(context, { action: 'pick', playerId: 'p-RB1' }).status).toBe(409)
    expect(mock(context, { action: 'stop' }).status).toBe(200) // stop is idempotent
  })

  it('blocks poll, marks, unmark, and refresh while a mock is active', () => {
    const { context, poller } = makeApp()
    expect(mock(context, { action: 'start', pace: 0, seed: 1 }).status).toBe(200)
    expect(call(context, 'POST', '/api/poll', { enabled: true }).status).toBe(409)
    expect(poller.status.enabled).toBe(false)
    expect(call(context, 'POST', '/api/mark', { playerId: 'p-RB1', teamId: 'unknown' }).status).toBe(409)
    expect(call(context, 'POST', '/api/mark', { playerId: 'p-RB1', teamId: 5 }).status).toBe(409)
    expect(call(context, 'POST', '/api/unmark', { playerId: 'p-RB1' }).status).toBe(409)
    expect(call(context, 'POST', '/api/refresh').status).toBe(409)
    expect(call(context, 'POST', '/api/poll', { enabled: false }).status).toBe(200)
  })

  it('advances the room to my turn, takes my pick via /api/mock or /api/mark, and stop discards it all', () => {
    const { app, context } = makeApp()
    mock(context, { action: 'start', pace: 0, seed: 2 })
    const advanced = asState(mock(context, { action: 'advance' }).json)
    expect(advanced.mock).toMatchObject({ pickCount: 10, myTurn: true })
    expect(advanced.draft.onClockTeamId).toBe(13)
    expect(advanced.mock.countdownStartedAt).not.toBeNull()

    // a player the room already took is refused
    expect(mock(context, { action: 'pick', playerId: advanced.picks[0]?.playerId ?? '' }).status).toBe(409)

    const choice = topCandidate(context)
    const picked = asState(mock(context, { action: 'pick', playerId: choice }).json)
    expect(picked.mock).toMatchObject({ pickCount: 11, myTurn: false })
    expect(picked.picks[10]).toMatchObject({ playerId: choice, teamId: 13, overall: 11, source: 'mock' })

    // the ME button path: /api/mark with my team routes into the mock — refused off-turn
    expect(call(context, 'POST', '/api/mark', { playerId: 'p-K1', teamId: 13 }).status).toBe(409)
    const advanced2 = asState(mock(context, { action: 'advance' }).json)
    expect(advanced2.mock).toMatchObject({ pickCount: 13, myTurn: true })
    const viaMark = call(context, 'POST', '/api/mark', { playerId: 'p-K1', teamId: 13 })
    expect(viaMark.status).toBe(200)
    expect(asState(viaMark.json).mock.pickCount).toBe(14)

    // nothing reached the real tables
    expect(app.store.getDraftPicks()).toEqual([])
    expect(app.store.getManualPicks()).toEqual([])

    // stop discards everything instantly
    const stopped = asState(mock(context, { action: 'stop' }).json)
    expect(stopped.mock.active).toBe(false)
    expect(stopped.draft.pickCount).toBe(0)
    const board = call(context, 'GET', '/api/board').json as { drafted: unknown[] }
    expect(board.drafted).toEqual([])
  })

  it('replays identically under a seed and differs under another', () => {
    const run = (seedValue: number): string[] => {
      const { context } = makeApp()
      mock(context, { action: 'start', pace: 0, seed: seedValue })
      mock(context, { action: 'advance' })
      mock(context, { action: 'pick', playerId: topCandidate(context) })
      const state = asState(mock(context, { action: 'advance' }).json)
      return state.picks.map((pick) => pick.playerId)
    }
    expect(run(1234)).toEqual(run(1234))
    expect(run(1234)).not.toEqual(run(99))
  })

  it('paces opponents on the injected timer, pausing on my turn and resuming after my pick', () => {
    const { app, context, timers } = makeApp()
    mock(context, { action: 'start', pace: 4, seed: 3 })
    expect(timers.pending()).toBe(1)
    expect(timers.lastMs()).toBe(4000)
    for (let i = 1; i <= 10; i += 1) {
      expect(timers.fire()).toBe(true)
    }
    let state = asState(call(context, 'GET', '/api/state').json)
    expect(state.mock).toMatchObject({ pickCount: 10, myTurn: true })
    expect(state.mock.countdownStartedAt).not.toBeNull()
    expect(timers.pending()).toBe(0) // paused for me — nothing auto-picks

    state = asState(mock(context, { action: 'pick', playerId: topCandidate(context) }).json)
    expect(state.mock.countdownStartedAt).toBeNull()
    expect(timers.pending()).toBe(1) // the room resumes
    timers.fire() // pick 12
    timers.fire() // pick 13 → my turn at 14, timer pauses again
    expect(timers.pending()).toBe(0)
    state = asState(call(context, 'GET', '/api/state').json)
    expect(state.mock).toMatchObject({ pickCount: 13, myTurn: true })

    mock(context, { action: 'stop' })
    expect(timers.pending()).toBe(0)
    expect(app.mockActive).toBe(false)
  })

  it('plays a full 168-pick draft: caps and K/DST timing hold, recap appears, tables stay empty', () => {
    const { app, context } = makeApp({ pool: DEEP_PLAYERS })
    mock(context, { action: 'start', pace: 0, seed: 7 })
    let state = asState(call(context, 'GET', '/api/state').json)
    for (let guard = 0; guard < 400 && !state.draft.complete; guard += 1) {
      if (state.mock.myTurn) {
        const board = call(context, 'GET', '/api/board').json as { rows: { playerId: string }[] }
        state = asState(mock(context, { action: 'pick', playerId: board.rows[0]?.playerId ?? '' }).json)
      } else {
        state = asState(mock(context, { action: 'advance' }).json)
      }
    }
    expect(state.draft).toMatchObject({ pickCount: 168, complete: true })
    expect(state.mock.pickCount).toBe(168)
    expect(mock(context, { action: 'pick', playerId: 'p-K14' }).status).toBe(409)

    // positional sanity per opponent: QB/TE ≤ 2, one K and one DST, both landing in the last two rounds
    const position = (playerId: string): string => /^p-([A-Z]+)/.exec(playerId)?.[1] ?? '?'
    const byTeam = new Map<number, { playerId: string; round: number | null }[]>()
    for (const pick of state.picks) {
      if (pick.teamId === null) {
        continue
      }
      const picks = byTeam.get(pick.teamId) ?? []
      picks.push({ playerId: pick.playerId, round: pick.round })
      byTeam.set(pick.teamId, picks)
    }
    expect(byTeam.size).toBe(12)
    for (const [teamId, picks] of byTeam) {
      expect(picks).toHaveLength(14)
      if (teamId === 13) {
        continue
      }
      const kdst = picks.filter((pick) => position(pick.playerId) === 'K' || position(pick.playerId) === 'DST')
      expect(kdst).toHaveLength(2)
      expect(new Set(kdst.map((pick) => position(pick.playerId))).size).toBe(2)
      expect(kdst.every((pick) => (pick.round ?? 0) >= 13)).toBe(true)
      expect(picks.filter((pick) => position(pick.playerId) === 'QB').length).toBeLessThanOrEqual(2)
      expect(picks.filter((pick) => position(pick.playerId) === 'TE').length).toBeLessThanOrEqual(2)
    }

    // recap: my five best values vs room ADP, sorted by delta
    const best = state.mock.recap?.bestValues ?? []
    expect(best).toHaveLength(5)
    for (const value of best) {
      expect(value.delta).toBeCloseTo(value.roomAdp - value.overall, 5)
    }
    const deltas = best.map((value) => value.delta)
    expect(deltas).toEqual([...deltas].sort((a, b) => b - a))
    expect(state.capture.ratio).toBeGreaterThan(0)

    // the regression that matters: a full mocked draft leaves the real tables untouched
    expect(app.store.getDraftPicks()).toEqual([])
    expect(app.store.getManualPicks()).toEqual([])
  })
})

// -- news, threats, overrides, manual reset -----------------------------------

describe('news on the board', () => {
  it('joins per-player signals onto board and evaluate rows', () => {
    const { app, context } = makeApp()
    seedNews(
      app.store,
      'p-RB1',
      { direction: 'harms', impact: 'high', summary: 'Out for the season.' },
      {
        unassessed: true,
      },
    )
    const board = call(context, 'GET', '/api/board').json as {
      rows: {
        playerId: string
        news: { direction: string; impact: string; itemCount: number; assessedCount: number } | null
      }[]
    }
    const hit = board.rows.find((row) => row.playerId === 'p-RB1')
    expect(hit?.news).toMatchObject({ direction: 'harms', impact: 'high', itemCount: 2, assessedCount: 1 })
    expect(board.rows.find((row) => row.playerId === 'p-WR1')?.news).toBeNull()

    const evaluate = call(context, 'GET', '/api/evaluate').json as {
      candidates: { playerId: string; news: { direction: string } | null }[]
    }
    expect(evaluate.candidates.find((candidate) => candidate.playerId === 'p-RB1')?.news).toMatchObject({
      direction: 'harms',
    })
  })

  it('serves the drawer payload: items newest-first with sanitized bodies; unknown player 404', () => {
    const { app, context } = makeApp()
    seedNews(
      app.store,
      'p-RB1',
      { direction: 'harms', impact: 'high', summary: 'Tore his ACL; out for the season.' },
      { body: '<p>He is <b>out</b> &amp; done.</p><script>alert("x")</script>', unassessed: true },
    )
    const { status, json } = call(context, 'GET', '/api/news/p-RB1')
    expect(status).toBe(200)
    const payload = json as {
      player: { name: string; position: string; injuryStatus: string }
      injuryNote: string | null
      items: { headline: string; paragraphs: string[]; assessment: { summary: string } | null }[]
    }
    expect(payload.player).toMatchObject({ name: 'RB Player 1', position: 'RB', injuryStatus: 'ACTIVE' })
    expect(payload.items).toHaveLength(2)
    expect(payload.items[0]?.assessment?.summary).toBe('Tore his ACL; out for the season.')
    expect(payload.items[0]?.paragraphs).toEqual(['He is out & done.'])
    expect(payload.items[1]?.assessment).toBeNull()
    expect(call(context, 'GET', '/api/news/p-nobody').status).toBe(404)
  })
})

describe('threats on the board', () => {
  const RULES = {
    teams: {
      '8': {
        teamId: 8,
        owner: 'Loyal Larry',
        sigma: null,
        rules: [{ kind: 'loyalty', playerName: 'RB Player 2', strength: 10 }],
        evidence: { '0': 'took him both years' },
      },
    },
  }

  it('marks threatened rows with level and attribution under a profiled room', () => {
    const { context } = makeApp({ roomRulesFile: writeRoomRules(RULES) })
    const board = call(context, 'GET', '/api/board').json as {
      threatPick: number | null
      rows: {
        playerId: string
        threat: {
          threatLevel: number
          pTakenBeforeMyPick: number
          attribution: { teamId: number; ownerName: string | null; atPick: number; evidence: string[] } | null
        } | null
      }[]
    }
    expect(board.threatPick).toBe(11)
    const threat = board.rows.find((row) => row.playerId === 'p-RB2')?.threat
    expect(threat).not.toBeNull()
    expect(threat).not.toBeUndefined()
    expect(threat?.threatLevel).toBeGreaterThanOrEqual(1)
    expect(threat?.pTakenBeforeMyPick).toBeGreaterThan(0.25)
    expect(threat?.attribution).toMatchObject({ teamId: 8, ownerName: 'Loyal Larry', atPick: 1 })
    expect(threat?.attribution?.evidence).toContain('took him both years')

    const evaluate = call(context, 'GET', '/api/evaluate').json as {
      candidates: { playerId: string; threat: { threatLevel: number } | null }[]
    }
    const candidateThreat = evaluate.candidates.find((candidate) => candidate.playerId === 'p-RB2')?.threat
    expect(candidateThreat?.threatLevel).toBeGreaterThanOrEqual(1)
  })

  it('serves the base model (no threat fields) without a rules file, and survives a broken one', () => {
    const plain = call(makeApp().context, 'GET', '/api/board').json as {
      threatPick: number | null
      rows: { threat: unknown }[]
    }
    expect(plain.rows.every((row) => row.threat === null)).toBe(true)

    const brokenFile = writeRoomRules({ teams: { '8': { teamId: 8, sigma: 'bad' } } })
    const broken = makeApp({ roomRulesFile: brokenFile })
    expect(call(broken.context, 'GET', '/api/board').status).toBe(200)
    expect(call(broken.context, 'GET', '/api/evaluate').status).toBe(200)
  })
})

describe('override endpoint', () => {
  it('validates input', () => {
    const { context } = makeApp({ overridesFile: writeOverrides([]) })
    expect(call(context, 'POST', '/api/override', { action: 'ban' }).status).toBe(400)
    expect(call(context, 'POST', '/api/override', { playerId: 'p-RB1', action: 'zap' }).status).toBe(400)
    expect(call(context, 'POST', '/api/override', { playerId: 'p-RB1', action: 'boost' }).status).toBe(400)
    expect(call(context, 'POST', '/api/override', { playerId: 'p-RB1', action: 'boost', points: 0 }).status).toBe(400)
    expect(call(context, 'POST', '/api/override', { playerId: 'p-RB1', action: 'boost', points: 'x' }).status).toBe(400)
    expect(call(context, 'POST', '/api/override', { playerId: 'p-nobody', action: 'ban' }).status).toBe(404)
  })

  it('refuses without a configured file and on a broken file', () => {
    const none = makeApp()
    expect(call(none.context, 'POST', '/api/override', { playerId: 'p-RB1', action: 'ban' }).status).toBe(409)

    const file = path.join(mkdtempSync(path.join(tmpdir(), 'football-overrides-')), 'overrides.json')
    writeFileSync(file, 'not json {')
    const broken = makeApp({ overridesFile: file })
    expect(call(broken.context, 'POST', '/api/override', { playerId: 'p-RB1', action: 'ban' }).status).toBe(409)
    expect(readFileSync(file, 'utf8')).toBe('not json {') // never clobbered
  })

  it('round-trips ban/boost/clear: file rewritten, entries preserved, overrides hot-reloaded', () => {
    const file = writeOverrides([{ player: 'RB Player 2', action: 'ban', note: 'pre-existing' }])
    const { app, context } = makeApp({ overridesFile: file })
    seedNews(app.store, 'p-RB1', { direction: 'harms', impact: 'high', summary: 'MCL sprain; out a month.' })

    // ban: appended with the latest harms summary as the default note
    expect(call(context, 'POST', '/api/override', { playerId: 'p-RB1', action: 'ban' }).status).toBe(200)
    let specs = JSON.parse(readFileSync(file, 'utf8')) as {
      player: string
      action: string
      note?: string
      points?: number
    }[]
    expect(specs).toEqual([
      { player: 'RB Player 2', action: 'ban', note: 'pre-existing' },
      { player: 'p-RB1', action: 'ban', note: 'MCL sprain; out a month.' },
    ])
    let board = call(context, 'GET', '/api/board').json as {
      rows: { playerId: string; banned: boolean }[]
      boostedIds: string[]
    }
    expect(board.rows.find((row) => row.playerId === 'p-RB1')?.banned).toBe(true)
    expect(board.rows.find((row) => row.playerId === 'p-RB2')?.banned).toBe(true)

    // boost another player, with an explicit note
    expect(
      call(context, 'POST', '/api/override', { playerId: 'p-WR1', action: 'boost', points: -15, note: 'fade' }).status,
    ).toBe(200)
    specs = JSON.parse(readFileSync(file, 'utf8')) as never
    expect(specs).toHaveLength(3)
    expect(specs[2]).toEqual({ player: 'p-WR1', action: 'boost', points: -15, note: 'fade' })
    board = call(context, 'GET', '/api/board').json
    expect(board.boostedIds).toEqual(['p-WR1'])

    // clear the ban; the other entries survive, and re-clearing is a no-op rewrite
    expect(call(context, 'POST', '/api/override', { playerId: 'p-RB1', action: 'clear' }).status).toBe(200)
    specs = JSON.parse(readFileSync(file, 'utf8')) as never
    expect(specs.map((spec) => spec.player)).toEqual(['RB Player 2', 'p-WR1'])
    board = call(context, 'GET', '/api/board').json
    expect(board.rows.find((row) => row.playerId === 'p-RB1')?.banned).toBe(false)
    const state = call(context, 'GET', '/api/state').json as {
      overrides: { count: number; banned: number; boosted: number }
    }
    expect(state.overrides).toMatchObject({ count: 2, banned: 1, boosted: 1 })
  })

  it('replaces a name-keyed entry for the same player instead of duplicating it', () => {
    const file = writeOverrides([{ player: 'RB Player 1', action: 'ban', note: 'by name' }])
    const { context } = makeApp({ overridesFile: file })
    expect(call(context, 'POST', '/api/override', { playerId: 'p-RB1', action: 'boost', points: 20 }).status).toBe(200)
    const specs = JSON.parse(readFileSync(file, 'utf8')) as { player: string; action: string }[]
    expect(specs).toEqual([{ player: 'p-RB1', action: 'boost', points: 20 }])
  })

  it('still applies during a mock — overrides are config, not draft state', () => {
    const file = writeOverrides([])
    const { context } = makeApp({ overridesFile: file })
    expect(call(context, 'POST', '/api/mock', { action: 'start', pace: 0, seed: 1 }).status).toBe(200)
    expect(call(context, 'POST', '/api/override', { playerId: 'p-RB1', action: 'ban' }).status).toBe(200)
    const board = call(context, 'GET', '/api/board').json as { rows: { playerId: string; banned: boolean }[] }
    expect(board.rows.find((row) => row.playerId === 'p-RB1')?.banned).toBe(true)
  })
})

describe('manual reset', () => {
  it('deletes all manual marks, leaves polled picks, and recomputes the board', () => {
    const { app, context } = makeApp()
    app.applyDraftDetail({
      draftDetail: {
        inProgress: true,
        picks: [{ overallPickNumber: 1, roundId: 1, roundPickNumber: 1, teamId: 8, playerId: 101 }], // p-RB1
      },
    })
    call(context, 'POST', '/api/mark', { playerId: 'p-WR1', teamId: 13 })
    call(context, 'POST', '/api/mark', { playerId: 'p-WR2', teamId: 'unknown' })
    const { status, json } = call(context, 'POST', '/api/manual/reset')
    expect(status).toBe(200)
    const payload = json as {
      removed: number
      state: { draft: { pickCount: number; manualCount: number; polledCount: number } }
    }
    expect(payload.removed).toBe(2)
    expect(payload.state.draft).toMatchObject({ pickCount: 1, manualCount: 0, polledCount: 1 })
    const board = call(context, 'GET', '/api/board').json as { rows: { playerId: string }[] }
    expect(board.rows.some((row) => row.playerId === 'p-WR1')).toBe(true)
    expect(board.rows.some((row) => row.playerId === 'p-RB1')).toBe(false)
    // idempotent on an empty table
    expect((call(context, 'POST', '/api/manual/reset').json as { removed: number }).removed).toBe(0)
  })

  it('refuses while live poll is enabled or a mock is active', () => {
    const polling = makeApp()
    call(polling.context, 'POST', '/api/mark', { playerId: 'p-WR1', teamId: 13 })
    call(polling.context, 'POST', '/api/poll', { enabled: true })
    expect(call(polling.context, 'POST', '/api/manual/reset').status).toBe(409)
    call(polling.context, 'POST', '/api/poll', { enabled: false })
    expect(call(polling.context, 'POST', '/api/manual/reset').status).toBe(200)

    const mocked = makeApp()
    expect(call(mocked.context, 'POST', '/api/mock', { action: 'start', pace: 0, seed: 1 }).status).toBe(200)
    expect(call(mocked.context, 'POST', '/api/manual/reset').status).toBe(409)
  })
})

describe('cost of waiting', () => {
  it('serves per-position first-available expectations for my next two picks', () => {
    const { context } = makeApp()
    const board = call(context, 'GET', '/api/board').json as {
      costOfWaiting: {
        position: string
        now: { name: string; points: number } | null
        atPicks: { pick: number; expectedBest: number; likely: { name: string; probFirst: number } | null }[]
      }[]
    }
    expect(board.costOfWaiting.map((row) => row.position)).toEqual(['QB', 'RB', 'WR', 'TE'])
    const rb = board.costOfWaiting.find((row) => row.position === 'RB')
    expect(rb?.now?.name).toBe('RB Player 1')
    expect(rb?.atPicks.map((entry) => entry.pick)).toEqual([11, 14])
    const [atNext, atAfter] = rb?.atPicks ?? []
    // ten picks intervene before 11: the expected best RB then is worse than the best now
    expect(atNext?.expectedBest).toBeLessThan(rb?.now?.points ?? 0)
    expect(atAfter?.expectedBest).toBeLessThanOrEqual((atNext?.expectedBest ?? 0) + 1e-9)
    expect(atNext?.likely).not.toBeNull()
    expect(atNext?.likely?.probFirst).toBeGreaterThan(0)
  })

  it('excludes banned players from the best-available pool', () => {
    const file = writeOverrides([{ player: 'RB Player 1', action: 'ban' }])
    const { context } = makeApp({ overridesFile: file })
    const board = call(context, 'GET', '/api/board').json as {
      costOfWaiting: { position: string; now: { name: string } | null }[]
    }
    expect(board.costOfWaiting.find((row) => row.position === 'RB')?.now?.name).toBe('RB Player 2')
  })

  it('collapses to best-now when no picks intervene (my turn, next pick is now)', () => {
    const { context } = makeApp()
    const gone = ['p-RB1', 'p-RB2', 'p-RB3', 'p-RB4', 'p-WR1', 'p-WR2', 'p-WR3', 'p-QB1', 'p-QB2', 'p-TE1']
    for (const playerId of gone) {
      call(context, 'POST', '/api/mark', { playerId, teamId: 'unknown' })
    }
    const board = call(context, 'GET', '/api/board').json as {
      currentOverall: number
      myNextPicks: number[]
      costOfWaiting: {
        position: string
        now: { points: number } | null
        atPicks: { pick: number; expectedBest: number }[]
      }[]
    }
    expect(board.currentOverall).toBe(11)
    expect(board.myNextPicks[0]).toBe(11)
    const wr = board.costOfWaiting.find((row) => row.position === 'WR')
    // zero intervening picks to 11: certain survival, so the expectation IS the best now
    expect(wr?.atPicks[0]?.pick).toBe(11)
    expect(wr?.atPicks[0]?.expectedBest).toBeCloseTo(wr?.now?.points ?? -1, 6)
  })
})
