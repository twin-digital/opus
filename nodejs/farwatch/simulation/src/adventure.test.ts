import { describe, it, expect } from 'vitest'

import { createRng, type Rng } from '@thrashplay/fw-core'

import { resolveAdventure, TARGET } from './adventure.js'

/** A stub Rng whose `next()` always returns `value`; only `next` is exercised here. */
const fixedRng = (value: number): Rng => ({ next: () => value }) as unknown as Rng

describe('resolveAdventure', () => {
  it('succeeds when the roll is below the target', () => {
    expect(resolveAdventure(fixedRng(TARGET - 0.01)).success).toBe(true)
  })

  it('fails when the roll is at or above the target', () => {
    expect(resolveAdventure(fixedRng(TARGET)).success).toBe(false)
    expect(resolveAdventure(fixedRng(TARGET + 0.01)).success).toBe(false)
  })

  it('is deterministic for a given seed', () => {
    expect(resolveAdventure(createRng(42))).toEqual(resolveAdventure(createRng(42)))
  })

  it('lands near 50% success over many runs', () => {
    const rng = createRng(1)
    const n = 20_000
    let wins = 0
    for (let i = 0; i < n; i++) {
      if (resolveAdventure(rng).success) {
        wins++
      }
    }
    const rate = wins / n
    expect(Math.abs(rate - 0.5), `expected ~0.5, got ${rate}`).toBeLessThan(0.02)
  })
})
