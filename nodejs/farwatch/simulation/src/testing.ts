import type { Adventure, Outcome, Trial } from './adventure.js'
import type { Goal } from './goals.js'

/**
 * Test factories for building {@link Adventure}s and {@link Trial}s with sane defaults. Consumers
 * (and our own tests) build fixtures by overriding only the fields a test cares about — so adding a
 * new required field to the model fills in here once, not across every hand-built literal.
 *
 * Import from the `@thrashplay/fw-simulation/testing` subpath; nothing here is part of the runtime
 * surface.
 */

const DEFAULT_GOAL: Goal = { reward: { kind: 'item' }, viable: true }

/** Build a {@link Trial}; defaults a passing `combat` check. Override any field. */
export const makeTrial = (partial: Partial<Trial> = {}): Trial => {
  const outcome: Outcome = partial.outcome ?? partial.check?.outcome ?? 'success'
  const check = partial.check ?? { roll: outcome === 'success' ? 0.2 : 0.8, target: 0.5, outcome }
  const base: Trial = { approach: partial.approach ?? 'combat', check, outcome }
  return partial.stake ? { ...base, stake: partial.stake } : base
}

/** Build an {@link Adventure}, filling goal / outcome / ledger defaults. Override any field. */
export const makeAdventure = (partial: Partial<Adventure> = {}): Adventure => {
  const trials = partial.trials ?? [makeTrial()]
  return {
    goal: partial.goal ?? DEFAULT_GOAL,
    optionalGoals: partial.optionalGoals ?? [],
    trials,
    outcome: partial.outcome ?? trials.at(-1)?.outcome ?? 'failure',
    ledger: partial.ledger ?? [],
  }
}
