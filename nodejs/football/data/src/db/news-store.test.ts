import { describe, expect, it } from 'vitest'

import { mintPlayerId, type PlayerId } from '../ids.js'
import type { PlayerNewsDraft } from '../models.js'
import { openDatabase } from './connection.js'
import { Store } from './store.js'

const draft = (playerId: PlayerId, overrides: Partial<PlayerNewsDraft> = {}): PlayerNewsDraft => ({
  playerId,
  source: 'espn-news',
  externalId: '23-63352828',
  published: '2026-08-14T13:49:41Z',
  headline: 'Held out of the preseason opener.',
  body: '<p>Coach called it precautionary.</p>',
  ...overrides,
})

describe('Store news', () => {
  it('applies the player_news migration and upserts instead of duplicating on refetch', () => {
    const store = new Store(openDatabase(':memory:'))
    const playerId = mintPlayerId()
    const first = store.upsertNewsItems([draft(playerId)], 't1')
    expect(first).toEqual({ inserted: 1, updated: 0 })
    const again = store.upsertNewsItems([draft(playerId, { headline: 'Updated headline.' })], 't2')
    expect(again).toEqual({ inserted: 0, updated: 1 })
    const items = store.getNewsItems()
    expect(items).toHaveLength(1)
    expect(items[0]?.headline).toBe('Updated headline.')
    expect(items[0]?.fetchedAt).toBe('t2')
    expect(store.countNewsBySource()).toEqual({ 'espn-news': 1 })
  })

  it('keeps distinct items per (source, externalId) and first-seen player attribution', () => {
    const store = new Store(openDatabase(':memory:'))
    const a = mintPlayerId()
    const b = mintPlayerId()
    store.upsertNewsItems([draft(a)], 't1')
    // The same shared content arrives via another player's feed.
    store.upsertNewsItems([draft(b), draft(b, { externalId: '1-999', source: 'sleeper-injury' })], 't2')
    const items = store.getNewsItems()
    expect(items).toHaveLength(2)
    expect(items.find((item) => item.externalId === '23-63352828')?.playerId).toBe(a)
  })

  it('returns a player news feed with assessments, newest first', () => {
    const store = new Store(openDatabase(':memory:'))
    const playerId = mintPlayerId()
    store.upsertNewsItems(
      [
        draft(playerId, { externalId: 'old', published: '2026-08-01T00:00:00Z' }),
        draft(playerId, { externalId: 'new', published: '2026-08-20T00:00:00Z' }),
        draft(playerId, { externalId: 'undated', published: null }),
      ],
      't1',
    )
    const newest = store.getNewsForPlayer(playerId)[0]
    expect(newest?.item.externalId).toBe('new')
    expect(newest?.assessment).toBeNull()
    store.upsertAssessment({
      newsId: newest?.item.id ?? 'nw-x',
      direction: 'harms',
      impact: 'med',
      summary: 'Sat out again; risk of missing week 1.',
      assessedAt: 't2',
      assessedBy: 'agent',
    })
    const feed = store.getNewsForPlayer(playerId)
    expect(feed).toHaveLength(3)
    expect(feed[0]?.assessment?.direction).toBe('harms')
    expect(feed.at(-1)?.item.externalId).toBe('undated')
    expect(store.getNewsForPlayer(mintPlayerId())).toEqual([])
  })

  it('upserts assessments by newsId', () => {
    const store = new Store(openDatabase(':memory:'))
    const playerId = mintPlayerId()
    store.upsertNewsItems([draft(playerId)], 't1')
    const [item] = store.getNewsItems()
    const base = { newsId: item?.id ?? 'nw-x', summary: 'First read.', assessedAt: 't1', assessedBy: 'agent' }
    store.upsertAssessment({ ...base, direction: 'unclear', impact: 'low' })
    store.upsertAssessment({ ...base, direction: 'harms', impact: 'high', summary: 'Now confirmed out.' })
    expect(store.countAssessments()).toBe(1)
    expect(store.getNewsForPlayer(playerId)[0]?.assessment).toMatchObject({
      direction: 'harms',
      impact: 'high',
      summary: 'Now confirmed out.',
    })
  })

  it('rejects an assessment for an unknown news id', () => {
    const store = new Store(openDatabase(':memory:'))
    expect(() => {
      store.upsertAssessment({
        newsId: 'nw-00000000000000000000000000',
        direction: 'harms',
        impact: 'low',
        summary: 'Orphan.',
        assessedAt: 't1',
        assessedBy: 'agent',
      })
    }).toThrow(/FOREIGN KEY/)
  })

  it('rolls signals up worst-direction first, then highest impact within that direction', () => {
    const store = new Store(openDatabase(':memory:'))
    const mixed = mintPlayerId()
    const good = mintPlayerId()
    const unassessed = mintPlayerId()
    store.upsertNewsItems(
      [
        draft(mixed, { externalId: 'm1' }),
        draft(mixed, { externalId: 'm2' }),
        draft(mixed, { externalId: 'm3' }),
        draft(good, { externalId: 'g1' }),
        draft(unassessed, { externalId: 'u1' }),
      ],
      't1',
    )
    const idFor = (externalId: string): never =>
      store.getNewsItems().find((item) => item.externalId === externalId)?.id as never
    const stamp = { summary: 'x', assessedAt: 't1', assessedBy: 'agent' }
    store.upsertAssessment({ newsId: idFor('m1'), direction: 'improves', impact: 'high', ...stamp })
    store.upsertAssessment({ newsId: idFor('m2'), direction: 'harms', impact: 'med', ...stamp })
    store.upsertAssessment({ newsId: idFor('m3'), direction: 'unclear', impact: 'high', ...stamp })
    store.upsertAssessment({ newsId: idFor('g1'), direction: 'improves', impact: 'med', ...stamp })

    const signals = new Map(store.getNewsSignals().map((signal) => [signal.playerId, signal]))
    expect(signals.get(mixed)).toMatchObject({ direction: 'harms', impact: 'med', itemCount: 3, assessedCount: 3 })
    expect(signals.get(good)).toMatchObject({ direction: 'improves', impact: 'med', itemCount: 1, assessedCount: 1 })
    expect(signals.get(unassessed)).toMatchObject({ direction: null, impact: null, itemCount: 1, assessedCount: 0 })
  })
})
