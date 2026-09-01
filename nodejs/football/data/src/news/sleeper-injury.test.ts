import { describe, expect, it } from 'vitest'

import type { SleeperPlayer } from '../fetchers/sleeper.js'
import { mintPlayerId } from '../ids.js'
import { synthesizeSleeperInjuryItem } from './sleeper-injury.js'

const entry = (overrides: Partial<SleeperPlayer> = {}): SleeperPlayer => ({
  player_id: '9221',
  full_name: 'Fixture Player',
  injury_status: 'Questionable',
  injury_body_part: 'Hamstring',
  injury_notes: 'Limited in practice all week.',
  news_updated: 1756300000000,
  ...overrides,
})

describe('synthesizeSleeperInjuryItem', () => {
  it('builds an item from the injury fields', () => {
    const playerId = mintPlayerId()
    const item = synthesizeSleeperInjuryItem(playerId, entry())
    expect(item).not.toBeNull()
    expect(item?.playerId).toBe(playerId)
    expect(item?.source).toBe('sleeper-injury')
    expect(item?.headline).toBe('Sleeper injury report: Questionable (Hamstring)')
    expect(item?.body).toBe('Limited in practice all week.')
    expect(item?.published).toBe(new Date(1756300000000).toISOString())
  })

  it('hashes playerId+news_updated: stable per update, new id per update', () => {
    const playerId = mintPlayerId()
    const first = synthesizeSleeperInjuryItem(playerId, entry())
    const again = synthesizeSleeperInjuryItem(playerId, entry())
    const later = synthesizeSleeperInjuryItem(playerId, entry({ news_updated: 1756400000000 }))
    const otherPlayer = synthesizeSleeperInjuryItem(mintPlayerId(), entry())
    expect(first?.externalId).toBe(again?.externalId)
    expect(first?.externalId).not.toBe(later?.externalId)
    expect(first?.externalId).not.toBe(otherPlayer?.externalId)
  })

  it('returns null when the entry carries no injury signal', () => {
    const playerId = mintPlayerId()
    expect(
      synthesizeSleeperInjuryItem(playerId, entry({ injury_status: null, injury_body_part: null, injury_notes: null })),
    ).toBeNull()
    expect(
      synthesizeSleeperInjuryItem(playerId, entry({ injury_status: '', injury_body_part: '', injury_notes: '' })),
    ).toBeNull()
  })

  it('keeps notes-only entries and tolerates a missing news_updated', () => {
    const item = synthesizeSleeperInjuryItem(
      mintPlayerId(),
      entry({ injury_status: null, injury_body_part: null, news_updated: null }),
    )
    expect(item?.headline).toBe('Sleeper injury report: no status')
    expect(item?.published).toBeNull()
  })
})
