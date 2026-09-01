import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { openDatabase } from '../db/connection.js'
import { Store } from '../db/store.js'
import type { PlayerId } from '../ids.js'
import { resolveFpProjectionsPath, runIngest } from './pipeline.js'

vi.mock('../fetchers/crosswalk.js', () => ({
  fetchCrosswalk: vi.fn(() => Promise.resolve([])),
}))

vi.mock('../fetchers/sleeper.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../fetchers/sleeper.js')>()),
  fetchSleeperPlayersDb: vi.fn(() =>
    Promise.resolve({
      'slp-rb': {
        first_name: 'Test',
        last_name: 'Back',
        full_name: 'Test Back',
        fantasy_positions: ['RB'],
        team: 'KC',
        years_exp: 3,
      },
    }),
  ),
  fetchSleeperProjections: vi.fn((_season: number, position: string) =>
    Promise.resolve(
      position === 'RB' ?
        [{ player_id: 'slp-rb', stats: { adp_half_ppr: 5, gp: 17, rush_yd: 1000, pts_ppr: 100 } }]
      : [],
    ),
  ),
}))

vi.mock('../fetchers/espn.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../fetchers/espn.js')>()),
  fetchEspnProjections: vi.fn(() =>
    Promise.resolve([
      // Three pro-team spot-check players so validateEspnProTeams passes.
      { id: 3139477, player: { id: 3139477, fullName: 'Patrick Mahomes', defaultPositionId: 1, proTeamId: 12 } },
      { id: 3918298, player: { id: 3918298, fullName: 'Josh Allen', defaultPositionId: 1, proTeamId: 2 } },
      { id: 4262921, player: { id: 4262921, fullName: 'Justin Jefferson', defaultPositionId: 3, proTeamId: 16 } },
      {
        id: 999,
        player: {
          id: 999,
          fullName: 'Test Back',
          defaultPositionId: 2,
          proTeamId: 12,
          ownership: { averageDraftPosition: 5 },
          // Season-total row: 1000 rushYd (statId 24) × 0.1 = appliedTotal 100 — checkable.
          stats: [
            {
              statSourceId: 1,
              seasonId: 2026,
              statSplitTypeId: 0,
              scoringPeriodId: 0,
              stats: { '24': 1000 },
              appliedTotal: 100,
            },
          ],
        },
      },
    ]),
  ),
  fetchEspnLeagueSettings: vi.fn(() =>
    Promise.resolve({
      id: 1,
      settings: {
        name: 'Pipeline League',
        size: 2,
        scoringSettings: { scoringItems: [] },
        rosterSettings: { lineupSlotCounts: {} },
        draftSettings: { type: 'SNAKE', pickOrder: [1, 2] },
      },
    }),
  ),
  fetchEspnDraftDetail: vi.fn(() =>
    Promise.resolve({
      draftDetail: {
        drafted: false,
        inProgress: true,
        picks: [{ overallPickNumber: 1, roundId: 1, roundPickNumber: 1, teamId: 1, playerId: 999, keeper: false }],
      },
    }),
  ),
}))

vi.mock('../fetchers/fantasypros.js', () => ({
  fetchFantasyProsEcr: vi.fn(() => Promise.resolve({ players: [], last_updated: null })),
}))

const CREDS = { leagueId: '1', espnS2: 's2', swid: 'swid' }

/** A db pre-seeded as a previous ingest left it: players, mappings, and stored draft picks. */
const seededDbFile = (): { dbFile: string; playerId: PlayerId } => {
  const dbFile = path.join(mkdtempSync(path.join(tmpdir(), 'pipeline-')), 'football.db')
  const db = openDatabase(dbFile)
  const store = new Store(db)
  const playerId = 'p-back' as PlayerId
  store.replacePlayers(
    [
      {
        id: playerId,
        name: 'Test Back',
        position: 'RB',
        team: 'KC',
        byeWeek: null,
        age: null,
        yearsExp: 3,
        injuryStatus: 'ACTIVE',
      },
    ],
    't0',
  )
  store.upsertMapping({ playerId, source: 'sleeper', externalId: 'slp-rb', matchedBy: 'crosswalk' })
  store.upsertMapping({ playerId, source: 'espn', externalId: '999', matchedBy: 'crosswalk' })
  store.replaceDraftPicks([{ overall: 1, round: 1, roundPick: 1, teamId: 1, playerId, isKeeper: false }], 't0')
  db.close()
  return { dbFile, playerId }
}

describe('runIngest draft-pick ordering', () => {
  it('rewrites draft picks AFTER the player snapshot refresh — never ends with draft_pick empty', async () => {
    const { dbFile, playerId } = seededDbFile()
    const summary = await runIngest({
      dbFile,
      season: 2026,
      espnCreds: CREDS,
      fpApiKey: null,
      fpProjectionsMode: 'skip',
    })
    expect(summary.draftPicks).toBe(1)
    const store = new Store(openDatabase(dbFile))
    const picks = store.getDraftPicks()
    expect(picks).toHaveLength(1)
    expect(picks[0]).toMatchObject({ overall: 1, teamId: 1, playerId })
    // The pick's player exists in the refreshed player table (FK-consistent).
    expect(store.getPlayers().some((row) => row.id === picks[0]?.playerId)).toBe(true)
  })

  it('carries stored draft picks across a creds-less refresh', async () => {
    const { dbFile, playerId } = seededDbFile()
    await runIngest({ dbFile, season: 2026, espnCreds: null, fpApiKey: null, fpProjectionsMode: 'skip' })
    const store = new Store(openDatabase(dbFile))
    expect(store.getDraftPicks()).toHaveLength(1)
    expect(store.getDraftPicks()[0]?.playerId).toBe(playerId)
  })
})

describe('resolveFpProjectionsPath', () => {
  it('auto uses the API when a key is set, else the scrape', () => {
    expect(resolveFpProjectionsPath('auto', true)).toBe('api')
    expect(resolveFpProjectionsPath('auto', false)).toBe('scrape')
  })

  it('scrape forces the page scrape even with a key (spares API quota)', () => {
    expect(resolveFpProjectionsPath('scrape', true)).toBe('scrape')
    expect(resolveFpProjectionsPath('scrape', false)).toBe('scrape')
  })

  it('skip keeps stored rows regardless of the key', () => {
    expect(resolveFpProjectionsPath('skip', true)).toBe('skip')
    expect(resolveFpProjectionsPath('skip', false)).toBe('skip')
  })
})
