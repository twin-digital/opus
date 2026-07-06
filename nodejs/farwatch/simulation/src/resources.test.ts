import { describe, it, expect } from 'vitest'

import { createRng, type Rng } from '@thrashplay/fw-core'

import { pickWeighted } from './resources.js'

/** A stub Rng whose `next()` always returns `value`. */
const fixedRng = (value: number): Rng => ({ next: () => value }) as unknown as Rng

describe('pickWeighted', () => {
  const table = { a: 1, b: 1, c: 2 } // total weight 4

  it('selects by cumulative weight across the [0,1) draw', () => {
    expect(pickWeighted(fixedRng(0), table)).toBe('a') // roll 0.0 → a
    expect(pickWeighted(fixedRng(0.49), table)).toBe('b') // roll 1.96 → b
    expect(pickWeighted(fixedRng(0.6), table)).toBe('c') // roll 2.4 → c
  })

  it('always returns the sole option of a one-entry table', () => {
    expect(pickWeighted(fixedRng(0.999), { x: 1 })).toBe('x')
  })

  it('roughly honors the weights over many draws', () => {
    const rng = createRng(1)
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 }
    const n = 20_000
    for (let i = 0; i < n; i++) {
      counts[pickWeighted(rng, table)]++
    }
    expect(Math.abs(counts.c / n - 0.5)).toBeLessThan(0.02) // c carries half the weight
  })
})
