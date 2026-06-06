import type { Rng } from '@thrashplay/fw-core'

import { goalsConfig } from './config.js'
import { isNonfungible, pickWeighted, type ResourceDelta, type Tier } from './resources.js'

/** The covenant's aim for an adventure: the reward won if it succeeds. */
export interface Goal {
  /** What the covenant gains on success — a fungible tier or a non-fungible instance. */
  readonly reward: ResourceDelta
  /** Whether the goal is actually attainable; a trial may reveal it false (the relic isn't there). */
  readonly viable: boolean
}

/** A secondary, known objective: a reward won by succeeding at the trial it is bound to. */
export interface OptionalGoal {
  readonly reward: ResourceDelta
  /** Index of the trial whose success earns this — that trial's prize becomes this reward. */
  readonly trial: number
}

/** A reward of a weighted kind, with a tier (from `tierWeights`) only if the kind is fungible. */
const generateReward = (rng: Rng, tierWeights: Partial<Record<Tier, number>>): ResourceDelta => {
  const kind = pickWeighted(rng, goalsConfig().rewardKindWeights)
  return isNonfungible(kind) ? { kind } : { kind, tier: pickWeighted(rng, tierWeights) }
}

/** Generate the primary goal: a weighted reward and a viability flag. */
export const generatePrimaryGoal = (rng: Rng): Goal => {
  const cfg = goalsConfig()
  return { reward: generateReward(rng, cfg.rewardTierWeights), viable: rng.next() >= cfg.inviableChance }
}

/** Pick `k` distinct indices from `[0, n)` using `rng` (partial Fisher–Yates). */
const pickDistinct = (rng: Rng, n: number, k: number): number[] => {
  const pool = Array.from({ length: n }, (_, i) => i)
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng.next() * (n - i))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
  }
  return pool.slice(0, k)
}

/**
 * Generate the adventure's optional goals: a weighted count (capped at the number of trials), each
 * bound to a distinct trial and rewarded from the goal table but skewed smaller than the primary.
 */
export const generateOptionalGoals = (rng: Rng, trialCount: number): OptionalGoal[] => {
  const cfg = goalsConfig()
  const count = Math.min(Number(pickWeighted(rng, cfg.optionalCountWeights)), trialCount)
  return pickDistinct(rng, trialCount, count).map((trial) => ({
    reward: generateReward(rng, cfg.optionalTierWeights),
    trial,
  }))
}
