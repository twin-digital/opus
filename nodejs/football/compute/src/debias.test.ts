import type { PlayerId } from '@twin-digital/football-data'
import { describe, expect, it } from 'vitest'

import { bandIndex, debiasSourcePoints, type SourcePoints } from './debias.js'
import { TUNING } from './tuning.js'

const rb = (playerId: string, source: string, points: number): SourcePoints => ({
  playerId: playerId as PlayerId,
  source,
  position: 'RB',
  points,
})

/** 18 RBs covered by both sources; ESPN runs 20% hot in the top band, agrees in band 2. */
const hotTopFixture = (): SourcePoints[] => {
  const rows: SourcePoints[] = []
  for (let i = 0; i < 18; i += 1) {
    const sleeper = 300 - 10 * i
    rows.push(rb(`rb-${String(i)}`, 'sleeper', sleeper))
    rows.push(rb(`rb-${String(i)}`, 'espn', i < 12 ? sleeper * 1.2 : sleeper))
  }
  return rows
}

describe('bandIndex', () => {
  it('maps positional rank to 1–12 / 13–24 / 25–36 / 37+', () => {
    expect(bandIndex(1)).toBe(0)
    expect(bandIndex(12)).toBe(0)
    expect(bandIndex(13)).toBe(1)
    expect(bandIndex(36)).toBe(2)
    expect(bandIndex(37)).toBe(3)
    expect(bandIndex(500)).toBe(3)
  })
})

describe('debiasSourcePoints', () => {
  it('corrects a top-band hot source toward the panel and leaves the mid band untouched', () => {
    const { factors, byPlayer } = debiasSourcePoints(hotTopFixture())
    // panel median (two sources) is the mean 1.1·s: espn 1.1/1.2, sleeper 1.1/1.0
    expect(factors.get('espn')?.get('RB')?.[0]).toBeCloseTo(1.1 / 1.2, 5)
    expect(factors.get('sleeper')?.get('RB')?.[0]).toBeCloseTo(1.1, 5)
    expect(factors.get('espn')?.get('RB')?.[1]).toBe(1)
    expect(factors.get('sleeper')?.get('RB')?.[1]).toBe(1)
    // both sources converge on the panel median for the top player…
    expect(byPlayer.get('rb-0' as PlayerId)?.get('sleeper')).toBeCloseTo(330, 5)
    expect(byPlayer.get('rb-0' as PlayerId)?.get('espn')).toBeCloseTo(330, 5)
    // …and a band-2 player passes through unchanged
    expect(byPlayer.get('rb-15' as PlayerId)?.get('sleeper')).toBe(150)
    expect(byPlayer.get('rb-15' as PlayerId)?.get('espn')).toBe(150)
  })

  it('keeps factor 1 for degenerate bands (fewer multi-source players than the minimum)', () => {
    const rows: SourcePoints[] = []
    for (let i = 0; i < TUNING.MIN_BAND_PLAYERS - 1; i += 1) {
      const sleeper = 200 - 10 * i
      rows.push(rb(`x-${String(i)}`, 'sleeper', sleeper))
      rows.push(rb(`x-${String(i)}`, 'espn', sleeper * 1.5))
    }
    const { factors, byPlayer } = debiasSourcePoints(rows)
    expect(factors.get('espn')?.get('RB')?.[0]).toBe(1)
    expect(byPlayer.get('x-0' as PlayerId)?.get('espn')).toBe(300)
  })

  it('ignores near-zero points and leaves single-source players unchanged', () => {
    const rows: SourcePoints[] = [
      ...hotTopFixture(),
      rb('deep-1', 'sleeper', 5), // deep name, one source, negligible points
    ]
    const { byPlayer } = debiasSourcePoints(rows)
    expect(byPlayer.get('deep-1' as PlayerId)?.get('sleeper')).toBe(5) // band 3+ factor 1
  })

  it('clamps extreme band factors', () => {
    const rows: SourcePoints[] = []
    for (let i = 0; i < 12; i += 1) {
      const sleeper = 300 - 10 * i
      rows.push(rb(`q-${String(i)}`, 'sleeper', sleeper))
      rows.push(rb(`q-${String(i)}`, 'espn', sleeper * 2)) // absurdly hot
    }
    const { factors } = debiasSourcePoints(rows)
    expect(factors.get('espn')?.get('RB')?.[0]).toBe(TUNING.FACTOR_MIN)
    expect(factors.get('sleeper')?.get('RB')?.[0]).toBe(TUNING.FACTOR_MAX)
  })
})
