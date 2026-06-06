import type { Rng } from '@thrashplay/fw-core'

import { goalsConfig } from './config.js'
import { isNonfungible, pickWeighted, type ResourceDelta } from './resources.js'

/** The covenant's aim for an adventure: the reward won if it succeeds. */
export interface Goal {
  /** What the covenant gains on success — a fungible tier or a non-fungible instance. */
  readonly reward: ResourceDelta
  /** Whether the goal is actually attainable; a trial may reveal it false (the relic isn't there). */
  readonly viable: boolean
}

/** Generate the primary goal: a weighted reward kind (with a tier if fungible) and a viability flag. */
export const generatePrimaryGoal = (rng: Rng): Goal => {
  const cfg = goalsConfig()
  const kind = pickWeighted(rng, cfg.rewardKindWeights)
  const reward: ResourceDelta =
    isNonfungible(kind) ? { kind } : { kind, tier: pickWeighted(rng, cfg.rewardTierWeights) }
  const viable = rng.next() >= cfg.inviableChance
  return { reward, viable }
}
