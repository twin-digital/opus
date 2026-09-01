import { describe, expect, it } from 'vitest'

import type { PlayerId } from '@twin-digital/football-data'

import { expectedBestAvailable, type WaitingCandidate } from './waiting.js'

const pool: WaitingCandidate[] = [
  { playerId: 'p-a', name: 'Alpha', points: 300 },
  { playerId: 'p-b', name: 'Bravo', points: 250 },
  { playerId: 'p-c', name: 'Charlie', points: 200 },
]

const survival =
  (byId: Record<string, number>) =>
  (playerId: PlayerId): number =>
    byId[playerId] ?? 1

describe('expectedBestAvailable', () => {
  it('is the best player when everyone certainly survives', () => {
    const result = expectedBestAvailable(pool, survival({}))
    expect(result.expected).toBe(300)
    expect(result.likely).toMatchObject({ name: 'Alpha', probFirst: 1 })
  })

  it('is the next player when the best is certainly gone', () => {
    const result = expectedBestAvailable(pool, survival({ 'p-a': 0 }))
    expect(result.expected).toBe(250)
    expect(result.likely).toMatchObject({ name: 'Bravo', probFirst: 1 })
  })

  it('mixes by first-available probability: Σ pts·P·Π(1−P) over the sorted list', () => {
    // Alpha survives 50%: half the mass on 300, the other half falls through to Bravo.
    const result = expectedBestAvailable(pool, survival({ 'p-a': 0.5 }))
    expect(result.expected).toBeCloseTo(0.5 * 300 + 0.5 * 250, 10)
    expect(result.likely?.name).toBe('Alpha') // 0.5 vs Bravo's 0.5 — first wins ties by >
    const deeper = expectedBestAvailable(pool, survival({ 'p-a': 0.2, 'p-b': 0.5 }))
    expect(deeper.expected).toBeCloseTo(0.2 * 300 + 0.8 * 0.5 * 250 + 0.8 * 0.5 * 200, 10)
    expect(deeper.likely?.name).toBe('Bravo') // 0.4 beats Alpha's 0.2 and Charlie's 0.4-tied-later
  })

  it('contributes nothing for the mass where every candidate is gone', () => {
    const result = expectedBestAvailable(pool, survival({ 'p-a': 0, 'p-b': 0, 'p-c': 0.25 }))
    expect(result.expected).toBeCloseTo(50, 10)
    expect(result.likely).toMatchObject({ name: 'Charlie', probFirst: 0.25 })
  })

  it('handles an empty candidate list', () => {
    expect(expectedBestAvailable([], survival({}))).toEqual({ expected: 0, likely: null })
  })
})
