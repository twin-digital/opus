import { describe, it, expect } from 'vitest'

import { createRng } from '@thrashplay/fw-core'

import { generateOptionalGoals } from './goals.js'
import { RESOURCE_KINDS } from './resources.js'

describe('generateOptionalGoals', () => {
  it('binds each optional goal to a distinct, in-range trial with a valid reward', () => {
    const trialCount = 4
    for (let seed = 0; seed < 200; seed++) {
      const optionals = generateOptionalGoals(createRng(seed), trialCount)
      expect(optionals.length).toBeLessThanOrEqual(2) // count table tops out at 2
      const trialsBound = optionals.map((opt) => opt.trial)
      expect(new Set(trialsBound).size).toBe(trialsBound.length) // distinct
      for (const opt of optionals) {
        expect(opt.trial).toBeGreaterThanOrEqual(0)
        expect(opt.trial).toBeLessThan(trialCount)
        expect(RESOURCE_KINDS).toContain(opt.reward.kind)
      }
    }
  })

  it('never binds more optionals than there are trials', () => {
    for (const trialCount of [0, 1]) {
      for (let seed = 0; seed < 50; seed++) {
        expect(generateOptionalGoals(createRng(seed), trialCount).length).toBeLessThanOrEqual(trialCount)
      }
    }
  })
})
