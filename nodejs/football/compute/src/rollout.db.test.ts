import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { BoardState } from './board.js'
import { survivalAtPick } from './draft-math.js'
import { computeBenchmarks, evaluateCandidates, rolloutFrom } from './rollout.js'
import { roomAdp, roomDelta } from './room.js'

const DB_FILE = path.resolve(fileURLToPath(import.meta.url), '../../..', 'data', '.data', 'football.db')
const SEASON = Number(process.env.FOOTBALL_SEASON ?? '2026')

/**
 * Smoke tests against the real snapshot: tolerances are generous because ADP and projections
 * move daily. Skipped wholesale when the local DB has not been ingested.
 */
describe.skipIf(!existsSync(DB_FILE))('rollout against the ingested snapshot', async () => {
  const { openDatabase, Store } = await import('@twin-digital/football-data')
  const store = new Store(openDatabase(DB_FILE))
  const settings = store.getLeagueSettings()
  if (settings === null) {
    throw new Error('DB present but no league_settings — re-run ingest')
  }
  const state: BoardState = {
    settings,
    players: store.getPlayers(),
    projections: store.getProjections(SEASON).filter((row) => row.source !== 'consensus'),
    market: store.getMarketData(),
    draftedPlayerIds: [],
    myDraftSlot: 11,
    season: SEASON,
  }
  const benchmarks = computeBenchmarks(state)

  it('benchmarks land near the measured anchors (ceiling ~2017, replacement ~1206)', () => {
    expect(benchmarks.ceiling).toBeGreaterThan(1800)
    expect(benchmarks.ceiling).toBeLessThan(2250)
    expect(benchmarks.replacement).toBeGreaterThan(1050)
    expect(benchmarks.replacement).toBeLessThan(1400)
  })

  it('a pre-draft rollout beats the greedy-VOR 1526 and fields a sane roster', () => {
    const result = rolloutFrom(state, [], 1)
    expect(result.starterTotal).toBeGreaterThan(1500)
    expect(result.starterTotal).toBeLessThan(benchmarks.ceiling)
    const counts = new Map<string, number>()
    for (const player of result.finalRoster) {
      counts.set(player.position, (counts.get(player.position) ?? 0) + 1)
    }
    expect(counts.get('TE') ?? 0).toBeLessThanOrEqual(2)
    expect(counts.get('QB') ?? 0).toBeLessThanOrEqual(2)
    const wrs = result.finalRoster
      .filter((player) => player.position === 'WR')
      .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
    expect(wrs.length).toBeGreaterThanOrEqual(2)
    // The greedy failure fixed: no 153.9-pt WR2 — meaningfully above WR replacement.
    const replacementWr = 130 // conservative floor; real WR replacement is lower
    expect(wrs[1]?.points ?? 0).toBeGreaterThan(replacementWr)
  })

  it('pick-11 candidates land between greedy (1526) and ceiling, tight deltas up top', () => {
    // Mean-path pick 11: the room's first ten picks come off in roomAdp order.
    const meanPathTen = state.market
      .map((row) => ({ playerId: row.playerId, adp: roomAdp(row) }))
      .filter((row): row is { playerId: (typeof row)['playerId']; adp: number } => row.adp !== null)
      .sort((a, b) => a.adp - b.adp)
      .slice(0, 10)
      .map((row) => row.playerId)
    const evaluations = evaluateCandidates({ ...state, draftedPlayerIds: meanPathTen })
    expect(evaluations.length).toBeGreaterThanOrEqual(40)
    const top = evaluations.slice(0, 5)
    for (const evaluation of top) {
      expect(evaluation.estTeamScore).toBeGreaterThan(1500) // ≥ greedy-VOR 1526, minus daily drift
      expect(evaluation.estTeamScore).toBeLessThan(benchmarks.ceiling)
    }
    expect(Math.abs(top[4]?.deltaVsBest ?? 99)).toBeLessThan(30)
  })

  it('a known ESPN-buried player shows positive Δroom and elevated survival to 35/38', () => {
    const playerByName = new Map(state.players.map((player) => [player.name, player.id]))
    const marketById = new Map(state.market.map((row) => [row.playerId, row]))
    const buried = ['Mike Evans', 'Chris Godwin', 'Tucker Kraft']
      .map((name) => marketById.get(playerByName.get(name) ?? 'p-none'))
      .filter((row) => row !== undefined)
    expect(buried.length).toBeGreaterThan(0)
    for (const market of buried) {
      expect(roomDelta(market) ?? 0).toBeGreaterThan(0)
      for (const pick of [35, 38]) {
        const room = survivalAtPick(market, pick) ?? 0
        const wide = survivalAtPick(market, pick, { adpSource: 'market' }) ?? 1
        expect(room).toBeGreaterThan(wide)
      }
    }
  })
})
