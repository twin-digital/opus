import { describe, expect, it } from 'vitest'

import type { CrosswalkRow } from '../fetchers/crosswalk.js'
import type { PlayerId } from '../ids.js'
import { PlayerResolver, type SourceIdentity } from './resolver.js'

const crosswalkRow = (overrides: Partial<CrosswalkRow>): CrosswalkRow => ({
  gsisId: null,
  sleeperId: null,
  espnId: null,
  fantasyprosId: null,
  name: null,
  mergeName: null,
  position: null,
  team: null,
  age: null,
  birthdate: null,
  draftYear: null,
  ...overrides,
})

const VETERAN = crosswalkRow({
  gsisId: '00-0038120',
  sleeperId: '9221',
  espnId: '4429795',
  fantasyprosId: '19788',
  name: 'Jahmyr Gibbs',
  mergeName: 'jahmyr gibbs',
  position: 'RB',
  team: 'DET',
  age: 24.4,
})

const gibbs: SourceIdentity = { name: 'Jahmyr Gibbs', team: 'DET', position: 'RB' }

describe('PlayerResolver resolution order', () => {
  it('resolves by crosswalk id and seeds mappings for every id the row carries', () => {
    const resolver = new PlayerResolver([VETERAN])
    const ref = resolver.resolve('espn', '4429795', gibbs)
    expect(ref?.matchedBy).toBe('crosswalk')
    const sources = resolver.newMappings.map((m) => `${m.source}:${m.externalId}`).sort()
    expect(sources).toEqual(['espn:4429795', 'fantasypros:19788', 'nflverse:00-0038120', 'sleeper:9221'])
    expect(new Set(resolver.newMappings.map((m) => m.playerId)).size).toBe(1)
  })

  it('prefers an exact existing mapping over everything else', () => {
    const resolver = new PlayerResolver([VETERAN])
    resolver.seedExisting([
      { playerId: 'p-01ARZ3NDEKTSV4RRFFQ69G5FAV', source: 'espn', externalId: '4429795', matchedBy: 'manual' },
    ])
    const ref = resolver.resolve('espn', '4429795', gibbs)
    expect(ref?.playerId).toBe('p-01ARZ3NDEKTSV4RRFFQ69G5FAV')
    expect(ref?.matchedBy).toBe('manual')
  })

  it('reuses a previously minted id when the crosswalk row carries a known external id', () => {
    const resolver = new PlayerResolver([VETERAN])
    resolver.seedExisting([
      { playerId: 'p-01ARZ3NDEKTSV4RRFFQ69G5FAV', source: 'sleeper', externalId: '9221', matchedBy: 'crosswalk' },
    ])
    const ref = resolver.resolve('espn', '4429795', gibbs)
    expect(ref?.playerId).toBe('p-01ARZ3NDEKTSV4RRFFQ69G5FAV')
  })

  it('falls back to name+team+position against the crosswalk, recorded as name-team-pos', () => {
    const resolver = new PlayerResolver([VETERAN])
    // FantasyPros id differs from the crosswalk's — only the name matches.
    const ref = resolver.resolve('fantasypros', '99999', gibbs)
    expect(ref?.matchedBy).toBe('name-team-pos')
    const fpMappings = resolver.newMappings.filter((m) => m.source === 'fantasypros')
    expect(fpMappings.map((m) => m.externalId).sort()).toEqual(['19788', '99999'])
  })

  it('falls back to name+team+position against players minted this ingest (rookie path)', () => {
    const resolver = new PlayerResolver([])
    const rookie: SourceIdentity = { name: 'Fernando Mendoza', team: 'LV', position: 'QB' }
    const minted = resolver.resolve('sleeper', '13269', rookie, { mint: true })
    expect(minted?.matchedBy).toBe('minted')
    const ref = resolver.resolve('espn', '4837248', rookie)
    expect(ref?.playerId).toBe(minted?.playerId)
    expect(ref?.matchedBy).toBe('name-team-pos')
  })

  it('normalizes punctuation and suffixes for the name match', () => {
    const resolver = new PlayerResolver([])
    const identity: SourceIdentity = { name: 'Marvin Harrison Jr.', team: 'ARI', position: 'WR' }
    const minted = resolver.resolve('sleeper', '11631', identity, { mint: true })
    const ref = resolver.resolve('espn', '4432708', { name: 'Marvin Harrison Jr', team: 'ARI', position: 'WR' })
    expect(ref?.playerId).toBe(minted?.playerId)
  })

  it('queues unresolved rather than joining on name alone (team mismatch)', () => {
    const resolver = new PlayerResolver([VETERAN])
    const ref = resolver.resolve('fantasypros', '99999', { ...gibbs, team: 'KC' })
    expect(ref).toBeNull()
    expect(resolver.unresolved).toHaveLength(1)
    expect(resolver.unresolved[0]).toMatchObject({ source: 'fantasypros', externalId: '99999', reason: 'no match' })
  })

  it('refuses ambiguous name matches', () => {
    const twin = crosswalkRow({ ...VETERAN, espnId: '111', sleeperId: '222', fantasyprosId: null, gsisId: null })
    const resolver = new PlayerResolver([VETERAN, twin])
    const ref = resolver.resolve('fantasypros', '99999', gibbs)
    expect(ref).toBeNull()
    expect(resolver.unresolved[0]?.reason).toBe('ambiguous name match')
  })

  it('never mints for a source not allowed to mint', () => {
    const resolver = new PlayerResolver([])
    const ref = resolver.resolve('fantasypros', '424242', { name: 'Total Unknown', team: 'KC', position: 'WR' })
    expect(ref).toBeNull()
    expect(resolver.newMappings).toHaveLength(0)
  })
})

describe('DST resolution', () => {
  it('joins DSTs across sources by team', () => {
    const resolver = new PlayerResolver([])
    const minted = resolver.resolve(
      'sleeper',
      'SF',
      { name: 'San Francisco 49ers', team: 'SF', position: 'DST' },
      { mint: true },
    )
    expect(minted?.matchedBy).toBe('minted')
    const espn = resolver.resolve('espn', '-16025', { name: '49ers D/ST', team: 'SF', position: 'DST' })
    expect(espn?.playerId).toBe(minted?.playerId)
    expect(espn?.matchedBy).toBe('name-team-pos')
  })

  it('queues a DST row with no canonical team defense', () => {
    const resolver = new PlayerResolver([])
    const ref = resolver.resolve('espn', '-16001', { name: 'Falcons D/ST', team: 'ATL', position: 'DST' })
    expect(ref).toBeNull()
    expect(resolver.unresolved[0]?.reason).toBe('no canonical DST for team')
  })
})

describe('resolveExact', () => {
  it('resolves ids without identity via map or crosswalk only', () => {
    const resolver = new PlayerResolver([VETERAN])
    const ref = resolver.resolveExact('espn', '4429795')
    expect(ref?.matchedBy).toBe('crosswalk')
    expect(resolver.resolveExact('espn', '55555')).toBeNull()
  })
})
