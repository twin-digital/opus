import { describe, expect, it } from 'vitest'

import { mintPlayerId } from '../ids.js'
import type { Player, SeasonProjection } from '../models.js'
import { openDatabase } from './connection.js'
import { Store } from './store.js'

const player = (overrides: Partial<Player> = {}): Player => ({
  id: mintPlayerId(),
  name: 'Fixture Player',
  position: 'RB',
  team: 'DET',
  byeWeek: 8,
  age: 24.4,
  yearsExp: 3,
  injuryStatus: 'ACTIVE',
  ...overrides,
})

const projection = (playerId: Player['id'], source: SeasonProjection['source']): SeasonProjection => ({
  playerId,
  source,
  season: 2026,
  gamesPlayed: 17,
  stats: { rushYd: 1400, rec: 50 },
  prescored: { ppr: 300 },
})

describe('Store', () => {
  it('round-trips players with overwrite semantics', () => {
    const store = new Store(openDatabase(':memory:'))
    const first = player()
    store.replacePlayers([first], '2026-08-26T00:00:00Z')
    store.replacePlayers([player({ name: 'Second' }), player({ name: 'Third', team: null })], '2026-08-27T00:00:00Z')
    const players = store.getPlayers()
    expect(players).toHaveLength(2)
    expect(players.map((p) => p.name).sort()).toEqual(['Second', 'Third'])
    expect(players.find((p) => p.name === 'Third')?.team).toBeNull()
  })

  it('upserts mappings and keeps one row per (source, external id)', () => {
    const store = new Store(openDatabase(':memory:'))
    const [a] = [player()]
    store.replacePlayers([a], 'now')
    store.upsertMapping({ playerId: a.id, source: 'sleeper', externalId: '9221', matchedBy: 'crosswalk' })
    store.upsertMapping({ playerId: a.id, source: 'sleeper', externalId: '9221', matchedBy: 'name-team-pos' })
    store.upsertMapping({ playerId: a.id, source: 'espn', externalId: '4429795', matchedBy: 'crosswalk' })
    expect(store.getMappings()).toHaveLength(2)
    expect(store.countMappings()).toEqual({ sleeper: 1, espn: 1 })
    expect(store.getMappings().find((m) => m.source === 'sleeper')?.matchedBy).toBe('name-team-pos')
  })

  it('replaces projections per source, leaving other sources untouched', () => {
    const store = new Store(openDatabase(':memory:'))
    const a = player()
    const b = player({ name: 'Other' })
    store.replacePlayers([a, b], 'now')
    store.replaceProjections('sleeper', 2026, [projection(a.id, 'sleeper'), projection(b.id, 'sleeper')], 't1')
    store.replaceProjections('espn', 2026, [projection(a.id, 'espn')], 't1')
    store.replaceProjections('sleeper', 2026, [projection(a.id, 'sleeper')], 't2')
    expect(store.countProjectionsBySource()).toEqual({ sleeper: 1, espn: 1 })
    const rows = store.getProjections(2026)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.source === 'espn')).toEqual(projection(a.id, 'espn'))
    expect(store.getProjections(2025)).toHaveLength(0)
  })

  it('reports per-source projection asOf stamps', () => {
    const store = new Store(openDatabase(':memory:'))
    const a = player()
    store.replacePlayers([a], 'now')
    store.replaceProjections('sleeper', 2026, [projection(a.id, 'sleeper')], '2026-08-27T00:00:00Z')
    store.replaceProjections('fantasypros', 2026, [projection(a.id, 'fantasypros')], '2026-08-28T04:30:00Z')
    expect(store.getProjectionsAsOf('sleeper', 2026)).toBe('2026-08-27T00:00:00Z')
    expect(store.getProjectionsAsOf('fantasypros', 2026)).toBe('2026-08-28T04:30:00Z')
    expect(store.getProjectionsAsOf('fantasypros', 2025)).toBeNull()
    expect(store.getProjectionsAsOf('espn', 2026)).toBeNull()
  })

  it('carries kept fantasypros rows across a snapshot refresh under their original asOf (skip mode)', () => {
    const store = new Store(openDatabase(':memory:'))
    const a = player()
    const priorAsOf = '2026-08-28T04:30:00Z'
    store.replacePlayers([a], priorAsOf)
    store.replaceProjections('sleeper', 2026, [projection(a.id, 'sleeper')], priorAsOf)
    store.replaceProjections('fantasypros', 2026, [projection(a.id, 'fantasypros')], priorAsOf)

    // The skip-mode ingest sequence: capture the stored rows, refresh the player snapshot
    // (which clears all projections), rewrite the fetched sources, re-insert the kept rows.
    const kept = store.getProjections(2026).filter((row) => row.source === 'fantasypros')
    const keptAsOf = store.getProjectionsAsOf('fantasypros', 2026)
    const newAsOf = '2026-08-28T18:00:00Z'
    store.replacePlayers([a], newAsOf)
    store.replaceProjections('sleeper', 2026, [projection(a.id, 'sleeper')], newAsOf)
    store.replaceProjections('fantasypros', 2026, kept, keptAsOf ?? newAsOf)

    expect(store.countProjectionsBySource()).toEqual({ sleeper: 1, fantasypros: 1 })
    expect(store.getProjections(2026).find((row) => row.source === 'fantasypros')).toEqual(
      projection(a.id, 'fantasypros'),
    )
    expect(store.getProjectionsAsOf('fantasypros', 2026)).toBe(priorAsOf)
    expect(store.getProjectionsAsOf('sleeper', 2026)).toBe(newAsOf)
  })

  it('stores market data, league settings, and draft picks', () => {
    const store = new Store(openDatabase(':memory:'))
    const a = player()
    store.replacePlayers([a], 'now')
    const market = {
      playerId: a.id,
      adp: { sleeper: { ppr: 12.5, half: 13.1 }, espn: { ppr: 11.2 } },
      ecr: { rank: 10, posRank: 'RB5', tier: 2, best: 6, worst: 15, stdDev: 2.1 },
      percentRostered: 99.5,
      asOf: 'now',
    }
    store.replaceMarketData([market])
    expect(store.countMarketData()).toBe(1)
    expect(store.getMarketData()).toEqual([market])

    const settings = {
      leagueId: '1838733150',
      name: 'Fixture League',
      size: 12,
      scoringRules: [{ stat: 'rec' as const, points: 0.5 }],
      lineupSlots: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, DST: 1, K: 1, BENCH: 5, IR: 1 },
      draft: { type: 'snake' as const, date: null, pickOrder: [8, 1, 9] },
    }
    store.replaceLeagueSettings(settings, 'now')
    expect(store.countLeagueSettings()).toBe(1)
    expect(store.getLeagueSettings()).toEqual(settings)

    const pick = { overall: 1, round: 1, roundPick: 1, teamId: 8, playerId: a.id, isKeeper: false }
    store.replaceDraftPicks([pick], 'now')
    expect(store.countDraftPicks()).toBe(1)
    expect(store.getDraftPicks()).toEqual([pick])
  })

  it('upserts and removes manual picks, surviving a player snapshot refresh', () => {
    const store = new Store(openDatabase(':memory:'))
    const a = player()
    const b = player({ name: 'Other' })
    store.replacePlayers([a, b], 'now')
    store.addManualPick({ playerId: a.id, teamId: null, markedAt: 't1' })
    store.addManualPick({ playerId: b.id, teamId: 13, markedAt: 't2' })
    store.addManualPick({ playerId: a.id, teamId: 8, markedAt: 't3' }) // re-mark updates in place
    expect(store.getManualPicks()).toEqual([
      { playerId: b.id, teamId: 13, markedAt: 't2' },
      { playerId: a.id, teamId: 8, markedAt: 't3' },
    ])

    store.replacePlayers([a, b], 'later') // ingest refresh must not clear manual marks
    expect(store.getManualPicks()).toHaveLength(2)

    expect(store.removeManualPick(a.id)).toBe(true)
    expect(store.removeManualPick(a.id)).toBe(false)
    expect(store.getManualPicks()).toEqual([{ playerId: b.id, teamId: 13, markedAt: 't2' }])
  })

  it('reports per-table as-of stamps', () => {
    const store = new Store(openDatabase(':memory:'))
    expect(store.getAsOfStamps().player).toBeNull()
    const a = player()
    store.replacePlayers([a], '2026-08-27T00:00:00Z')
    store.replaceProjections('sleeper', 2026, [projection(a.id, 'sleeper')], '2026-08-27T01:00:00Z')
    const stamps = store.getAsOfStamps()
    expect(stamps.player).toBe('2026-08-27T00:00:00Z')
    expect(stamps.seasonProjection).toBe('2026-08-27T01:00:00Z')
    expect(stamps.draftPick).toBeNull()
  })
})
