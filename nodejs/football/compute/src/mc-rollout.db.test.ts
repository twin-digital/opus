import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { BoardState } from './board.js'
import { evaluateCandidatesMC } from './mc-rollout.js'
import { loadRoomRulesFile } from './room-profiles.js'
import { roomAdp } from './room.js'

const DB_FILE = path.resolve(fileURLToPath(import.meta.url), '../../..', 'data', '.data', 'football.db')
const RULES_FILE = path.resolve(fileURLToPath(import.meta.url), '../../..', 'design', 'room-rules.json')
const SEASON = Number(process.env.FOOTBALL_SEASON ?? '2026')

/**
 * The review's reference state: pick 11 on the pre-draft snapshot, the room's top-10 by ADP
 * gone. The MC evaluation must undo the mean-path bias: both elite RBs (Cook, Henry) rank at
 * or above Josh Allen, and the top three sit within one another's reach — the deterministic
 * engine had Allen first with Henry 11 points back.
 */
const HAS_DB = existsSync(DB_FILE)

describe.skipIf(!HAS_DB)('evaluateCandidatesMC against the ingested snapshot', async () => {
  // the factory still runs during collection when skipped; don't touch the DB
  if (!HAS_DB) {
    it.todo('requires an ingested DB')
    return
  }
  const { openDatabase, Store } = await import('@twin-digital/football-data')
  const store = new Store(openDatabase(DB_FILE))
  const settings = store.getLeagueSettings()
  if (settings === null) {
    throw new Error('DB present but no league_settings — re-run ingest')
  }
  const players = store.getPlayers()
  const market = store.getMarketData()
  const profiles = loadRoomRulesFile(RULES_FILE, players, () => undefined)
  const topTen = market
    .map((row) => ({ playerId: row.playerId, adp: roomAdp(row) }))
    .filter((row): row is { playerId: (typeof row)['playerId']; adp: number } => row.adp !== null)
    .sort((a, b) => a.adp - b.adp)
    .slice(0, 10)
    .map((row) => row.playerId)
  const state: BoardState = {
    settings,
    players,
    projections: store.getProjections(SEASON).filter((row) => row.source !== 'consensus'),
    market,
    draftedPlayerIds: topTen,
    teamPicks: topTen.map((playerId, i) => ({
      teamId: settings.draft.pickOrder[i % settings.size] ?? null,
      playerId,
    })),
    myDraftedPlayerIds: [],
    myDraftSlot: 11,
    season: SEASON,
  }

  it('pick 11: Cook and Henry at or above Allen, top three within reach', () => {
    const evaluations = evaluateCandidatesMC(state, { profiles, samples: 200 })
    const names = evaluations.map((row) => row.name)
    const rank = (fragment: string): number => names.findIndex((name) => name.includes(fragment))
    const cook = rank('James Cook')
    const henry = rank('Derrick Henry')
    const allen = rank('Josh Allen')
    expect(cook).toBeGreaterThanOrEqual(0)
    expect(henry).toBeGreaterThanOrEqual(0)
    expect(allen).toBeGreaterThanOrEqual(0)
    // The review's direction: the two RBs the mean path shortchanged rank above the QB.
    expect(new Set([cook, henry, allen])).toEqual(new Set([0, 1, 2]))
    expect(allen).toBe(2)
    // Magnitude class: the top three are decision-equivalent, far inside the 15-pt band.
    const span = (evaluations[0]?.estTeamScore ?? 0) - (evaluations[2]?.estTeamScore ?? 0)
    expect(span).toBeLessThan(8)
    // MC uncertainty is reported and small against the band.
    for (const row of evaluations.slice(0, 5)) {
      expect(row.se).toBeGreaterThan(0)
      expect(row.se).toBeLessThan(3)
    }
  }, 60_000)
})
