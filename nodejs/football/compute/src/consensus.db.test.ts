import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { BoardState } from './board.js'
import { board } from './board.js'
import { buildLeagueScorer } from './rescore.js'
import { isDraftable } from './upside.js'

const DB_FILE = path.resolve(fileURLToPath(import.meta.url), '../../..', 'data', '.data', 'football.db')
const SEASON = Number(process.env.FOOTBALL_SEASON ?? '2026')

/**
 * Smoke tests against the real snapshot: tolerances are generous because projections move
 * daily. Skipped wholesale when the local DB has not been ingested.
 */
const HAS_DB = existsSync(DB_FILE)

describe.skipIf(!HAS_DB)('consensus v2 against the ingested snapshot', async () => {
  // the factory still runs during collection when skipped; don't touch the DB
  if (!HAS_DB) {
    it.skip('requires an ingested DB', () => {})
    return
  }
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
  const result = board(state)
  const rowByName = new Map(result.rows.map((row) => [row.name, row]))

  it('anchors Gibbs on FP, above the low-shop dissent', () => {
    const scorer = buildLeagueScorer(settings.scoringRules)
    const gibbsId = state.players.find((player) => player.name === 'Jahmyr Gibbs')?.id
    expect(gibbsId).toBeDefined()
    const bySource = new Map(
      state.projections.filter((row) => row.playerId === gibbsId).map((row) => [row.source, scorer.score(row.stats)]),
    )
    const sleeper = bySource.get('sleeper') as number
    const espn = bySource.get('espn') as number
    const fp = bySource.get('fantasypros') as number
    const consensus = rowByName.get('Jahmyr Gibbs')?.points as number
    // Consensus is on the debiased scale, so raw-scale comparisons need slack: assert the
    // anchor's shape (well above the low shop, at or under the panel), not knife-edge means.
    const low = Math.min(sleeper, espn)
    expect(consensus).toBeGreaterThan(low + ((sleeper + espn) / 2 - low) / 2)
    expect(consensus).toBeLessThanOrEqual(fp + 1)
  })

  it('flags contested sparingly over the draftable pool', () => {
    const draftableIds = new Set(state.market.filter((row) => isDraftable(row)).map((row) => row.playerId))
    const draftable = result.rows.filter((row) => draftableIds.has(row.playerId))
    const contested = draftable.filter((row) => row.contested)
    expect(contested.length).toBeGreaterThan(0)
    expect(contested.length / draftable.length).toBeLessThan(0.15)
  })
})
