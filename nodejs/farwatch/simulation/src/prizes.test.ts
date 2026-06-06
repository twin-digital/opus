import { describe, it, expect } from 'vitest'

import { createRng, type Rng } from '@thrashplay/fw-core'

import { generateCost } from './costs.js'
import { generatePrize } from './prizes.js'
import { FUNGIBLE_KINDS, RESOURCE_KINDS } from './resources.js'

/** A stub Rng whose `next()` always returns `value`. */
const fixedRng = (value: number): Rng => ({ next: () => value }) as unknown as Rng

describe('generatePrize', () => {
  it('yields nothing when the chance roll fails', () => {
    expect(generatePrize(fixedRng(0.99))).toBeUndefined()
  })

  it('yields a known resource kind when it lands', () => {
    const prize = generatePrize(createRng(7))
    if (prize) {
      expect(RESOURCE_KINDS).toContain(prize.kind)
    }
  })

  it('lands roughly at the configured rate over many draws', () => {
    const rng = createRng(1)
    let prizes = 0
    const n = 20_000
    for (let i = 0; i < n; i++) {
      if (generatePrize(rng)) {
        prizes++
      }
    }
    expect(Math.abs(prizes / n - 0.35)).toBeLessThan(0.03)
  })
})

describe('generateCost', () => {
  it('returns a fungible cost for a pre-paying approach', () => {
    const cost = generateCost('wealth')
    expect(cost?.kind).toBe('wealth')
    if (cost && 'tier' in cost) {
      expect(FUNGIBLE_KINDS).toContain(cost.kind)
    }
  })

  it('returns nothing for an approach with no upfront cost', () => {
    expect(generateCost('combat')).toBeUndefined()
  })
})
