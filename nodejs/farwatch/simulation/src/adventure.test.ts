import { describe, it, expect } from 'vitest'

import { createRng, type Rng } from '@thrashplay/fw-core'

import { APPROACHES } from './approaches.js'
import { resolveAdventure, TARGET } from './adventure.js'

/** A stub Rng whose `next()` always returns `value`; only `next` is exercised here. */
const fixedRng = (value: number): Rng => ({ next: () => value }) as unknown as Rng

describe('resolveAdventure', () => {
  it('succeeds when the roll is below the target', () => {
    expect(resolveAdventure(fixedRng(TARGET - 0.01)).outcome).toBe('success')
  })

  it('fails when the roll is at or above the target', () => {
    expect(resolveAdventure(fixedRng(TARGET)).outcome).toBe('failure')
    expect(resolveAdventure(fixedRng(TARGET + 0.01)).outcome).toBe('failure')
  })

  it('resolves to a chain of trials; a viable goal lets the final trial decide', () => {
    const adventure = resolveAdventure(createRng(7))
    expect(adventure.trials).toHaveLength(4)
    const last = adventure.trials[adventure.trials.length - 1].outcome
    expect(adventure.outcome).toBe(adventure.goal.viable ? last : 'failure')
    expect(adventure.trials[0].check.target).toBe(TARGET)
  })

  it('has a primary goal: a reward of some kind plus a viability flag', () => {
    const { goal } = resolveAdventure(createRng(7))
    expect(goal.reward.kind.length).toBeGreaterThan(0)
    expect(typeof goal.viable).toBe('boolean')
  })

  it('assigns every trial an approach from the pool', () => {
    for (const trial of resolveAdventure(createRng(3)).trials) {
      expect(APPROACHES).toContain(trial.approach)
    }
  })

  it('is deterministic for a given seed', () => {
    expect(resolveAdventure(createRng(42))).toEqual(resolveAdventure(createRng(42)))
  })

  it('the final trial lands near 50% over many runs (a fair check)', () => {
    const rng = createRng(1)
    const n = 20_000
    let wins = 0
    for (let i = 0; i < n; i++) {
      const trials = resolveAdventure(rng).trials
      if (trials[trials.length - 1].outcome === 'success') {
        wins++
      }
    }
    const rate = wins / n
    expect(Math.abs(rate - 0.5), `expected ~0.5, got ${rate}`).toBeLessThan(0.02)
  })
})
