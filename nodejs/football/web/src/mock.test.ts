import { describe, expect, it } from 'vitest'

import type { PlayerId, Position } from '@twin-digital/football-data'

import { gaussian, mulberry32, pickForOpponent, type OpponentCandidate } from './mock.js'

const candidate = (
  id: string,
  position: Position,
  roomAdp: number | null,
  adp: number | null = roomAdp,
): OpponentCandidate => ({ playerId: id as PlayerId, position, roomAdp, adp })

const pick = (
  available: OpponentCandidate[],
  overrides: { counts?: Partial<Record<Position, number>>; round?: number; seed?: number } = {},
): string | null =>
  pickForOpponent({
    available,
    counts: overrides.counts ?? {},
    round: overrides.round ?? 3,
    totalRounds: 14,
    rng: mulberry32(overrides.seed ?? 1),
  })

describe('mulberry32', () => {
  it('yields the same sequence for the same seed, in [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 100; i += 1) {
      const value = a()
      expect(value).toBe(b())
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
    expect(mulberry32(42)()).not.toBe(mulberry32(43)())
  })

  it('gaussian is deterministic under the seed and roughly centered', () => {
    const rng = mulberry32(7)
    const values = Array.from({ length: 500 }, () => gaussian(rng))
    const rng2 = mulberry32(7)
    expect(values[0]).toBe(gaussian(rng2))
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length
    expect(Math.abs(mean)).toBeLessThan(0.2)
  })
})

describe('pickForOpponent', () => {
  const rb = (i: number, adp: number): OpponentCandidate => candidate(`p-RB${String(i)}`, 'RB', adp)

  it('is deterministic for a given seed and picks near the room price', () => {
    const available = Array.from({ length: 100 }, (_, i) => rb(i + 1, i + 1))
    const first = pick(available, { seed: 5 })
    expect(pick(available, { seed: 5 })).toBe(first)
    // jitter never reaches past the cheapest slice of the pool
    const chosen = available.find((c) => c.playerId === first)
    expect(chosen).toBeDefined()
    expect(chosen?.roomAdp).toBeLessThanOrEqual(25)
  })

  it('never takes K/DST before the last two rounds, even at an absurd price', () => {
    const available = [candidate('p-K1', 'K', 1), candidate('p-DST1', 'DST', 2), rb(1, 90)]
    for (let seed = 1; seed <= 20; seed += 1) {
      expect(pick(available, { round: 12, seed })).toBe('p-RB1')
    }
  })

  it('fills a missing K/DST first in the last two rounds, by price', () => {
    const available = [candidate('p-DST1', 'DST', 150), candidate('p-K1', 'K', 140), rb(1, 60)]
    expect(pick(available, { round: 13 })).toBe('p-K1')
    expect(pick(available, { round: 14, counts: { K: 1 } })).toBe('p-DST1')
    // both filled: back to best available, not a second K
    expect(pick(available, { round: 14, counts: { K: 1, DST: 1 } })).toBe('p-RB1')
  })

  it('respects the QB/TE caps', () => {
    const available = [candidate('p-QB1', 'QB', 1), candidate('p-TE1', 'TE', 2), rb(1, 50)]
    for (let seed = 1; seed <= 20; seed += 1) {
      expect(pick(available, { counts: { QB: 2, TE: 2 }, seed })).toBe('p-RB1')
    }
  })

  it('ignores players without a roomAdp until nothing else remains', () => {
    const noAdp = { ...rb(1, 5), roomAdp: null, adp: 5 }
    expect(pick([noAdp, rb(2, 80)])).toBe('p-RB2')
    expect(pick([noAdp])).toBe('p-RB1')
    expect(pick([])).toBeNull()
  })
})
