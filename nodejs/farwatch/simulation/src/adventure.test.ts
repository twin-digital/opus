import { describe, it, expect } from 'vitest'

import { createRng, type Rng } from '@thrashplay/fw-core'

import { APPROACHES } from './approaches.js'
import { resolveAdventure, TARGET } from './adventure.js'
import { skillFor } from './seekers.js'

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

  it('sends a party of seekers, and every trial is led by one of them', () => {
    const adventure = resolveAdventure(createRng(7))
    expect(adventure.party.length).toBeGreaterThanOrEqual(3)
    expect(adventure.party.length).toBeLessThanOrEqual(5)
    const ids = new Set(adventure.party.map((seeker) => seeker.id))
    for (const trial of adventure.trials) {
      expect(ids).toContain(trial.lead)
    }
  })

  it("picks each trial's lead by affinity for that trial's approach", () => {
    for (let seed = 0; seed < 100; seed++) {
      const adventure = resolveAdventure(createRng(seed))
      const byId = new Map(adventure.party.map((seeker) => [seeker.id, seeker]))
      for (const trial of adventure.trials) {
        const leadAffinity = skillFor(byId.get(trial.lead)!, trial.approach).affinity
        // No one in the party is keener on this approach than the chosen lead.
        for (const member of adventure.party) {
          expect(skillFor(member, trial.approach).affinity).toBeLessThanOrEqual(leadAffinity)
        }
      }
    }
  })

  it('only mints unknown goals on won trials, and each enters the ledger', () => {
    let seen = 0
    for (let seed = 0; seed < 300; seed++) {
      const adventure = resolveAdventure(createRng(seed))
      for (const unknown of adventure.unknownGoals) {
        seen++
        expect(adventure.trials[unknown.trial].outcome).toBe('success')
        expect(adventure.ledger).toContainEqual({ source: 'unknown', delta: unknown.reward })
      }
    }
    expect(seen, 'expected some adventures to discover an unknown goal').toBeGreaterThan(0)
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
