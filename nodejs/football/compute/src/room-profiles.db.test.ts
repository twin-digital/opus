import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { BoardState } from './board.js'
import { loadRoomRulesFile, pickThreats } from './room-profiles.js'
import { computeBenchmarks, evaluateCandidates } from './rollout.js'
import { roomAdp } from './room.js'

const DB_FILE = path.resolve(fileURLToPath(import.meta.url), '../../..', 'data', '.data', 'football.db')
const RULES_FILE = path.resolve(fileURLToPath(import.meta.url), '../../..', 'design', 'room-rules.json')
const SEASON = Number(process.env.FOOTBALL_SEASON ?? '2026')

/**
 * Profile sanity gate against the real snapshot: profiled rollouts stay in the plausible band
 * and only modestly reshuffle the pure-ADP evaluation. Skipped when the DB is not ingested.
 */
describe.skipIf(!existsSync(DB_FILE) || !existsSync(RULES_FILE))(
  'room profiles against the ingested snapshot',
  async () => {
    const { openDatabase, Store } = await import('@twin-digital/football-data')
    const store = new Store(openDatabase(DB_FILE))
    const settings = store.getLeagueSettings()
    if (settings === null) {
      throw new Error('DB present but no league_settings — re-run ingest')
    }
    const players = store.getPlayers()
    const state: BoardState = {
      settings,
      players,
      projections: store.getProjections(SEASON).filter((row) => row.source !== 'consensus'),
      market: store.getMarketData(),
      draftedPlayerIds: [],
      myDraftSlot: 11,
      season: SEASON,
    }
    const profiles = loadRoomRulesFile(RULES_FILE, players)

    it('every loyalty name in the shipped rules resolves against the real player table', () => {
      expect(profiles.warnings).toEqual([])
    })

    // Two full evaluations against the real snapshot (~50 rollouts each) outrun the default 5s.
    it('profiled evaluate stays in the plausible band and near the pure-ADP ordering', { timeout: 30_000 }, () => {
      const benchmarks = computeBenchmarks(state)
      const profiled = evaluateCandidates(state, { profiles })
      const pure = evaluateCandidates(state)
      expect(profiled.length).toBeGreaterThanOrEqual(40)
      for (const evaluation of profiled.slice(0, 5)) {
        expect(evaluation.estTeamScore).toBeGreaterThan(1500)
        expect(evaluation.estTeamScore).toBeLessThan(benchmarks.ceiling)
      }
      // Position-timing rules shift QB/TE availability, not scramble the slate: the pure-ADP
      // top-5 stays inside the profiled top-10, and the best candidates land within 60 points.
      const profiledTop10 = new Set(profiled.slice(0, 10).map((evaluation) => evaluation.playerId))
      for (const evaluation of pure.slice(0, 5)) {
        expect(profiledTop10.has(evaluation.playerId)).toBe(true)
      }
      expect(Math.abs((profiled[0]?.estTeamScore ?? 0) - (pure[0]?.estTeamScore ?? 0))).toBeLessThan(60)
    })

    it('pre-draft, live-pick seeding is a no-op: empty teamPicks matches the absent field', { timeout: 30_000 }, () => {
      const profiled = evaluateCandidates(state, { profiles }).slice(0, 12)
      const seeded = evaluateCandidates({ ...state, teamPicks: [] }, { profiles }).slice(0, 12)
      expect(seeded.map((entry) => [entry.playerId, entry.estTeamScore])).toEqual(
        profiled.map((entry) => [entry.playerId, entry.estTeamScore]),
      )
    })

    it('threats: the room takes the top of the board before pick 11 with near certainty', () => {
      const marketById = new Map(state.market.map((row) => [row.playerId, row]))
      const available = state.players.flatMap((player) => {
        const market = marketById.get(player.id)
        if (market === undefined) {
          return []
        }
        return [{ playerId: player.id, position: player.position, roomAdp: roomAdp(market) }]
      })
      const threats = pickThreats(profiles, settings.draft.pickOrder, 1, 11, available, { myTeamId: 13 })
      const topOfBoard = available
        .filter((row) => row.roomAdp !== null)
        .sort((a, b) => (a.roomAdp ?? 0) - (b.roomAdp ?? 0))
        .slice(0, 3)
      for (const row of topOfBoard) {
        expect(threats.get(row.playerId)?.pTakenBeforeMyPick ?? 0).toBeGreaterThan(0.7)
        expect(threats.get(row.playerId)?.threatLevel ?? 0).toBeGreaterThanOrEqual(2)
      }
      expect(threats.get(topOfBoard[0]?.playerId ?? 'p-none')?.pTakenBeforeMyPick ?? 0).toBeGreaterThan(0.9)
    })
  },
)
