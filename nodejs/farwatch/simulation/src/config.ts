import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { parse } from 'yaml'
import { z } from 'zod'

import { APPROACHES } from './approaches.js'
import { FUNGIBLE_KINDS, RESOURCE_KINDS, TIERS } from './resources.js'

/**
 * The generation tables live as editable YAML under `config/` (a sibling of `src/`/`dist/`, so the
 * same path resolves in dev and the built output — no build copy). Zod validates them against the
 * real vocabulary at load and gives us the static config types via `z.infer`; `.meta()` carries the
 * descriptions that surface as editor tooltips and generated docs. Files are re-read only when they
 * change on disk, so tuning the YAML is live.
 */

/** A weight map over a fixed key set — `{ key: relativeWeight }`, any subset of keys allowed. */
const weights = <T extends string>(keys: readonly [T, ...T[]]) =>
  z.partialRecord(z.enum(keys), z.number().nonnegative())

/** Primary-goal generation knobs. */
export const GoalsConfig = z.object({
  rewardKindWeights: weights(RESOURCE_KINDS).meta({
    description: 'Relative weights for which resource a primary goal seeks; skewed to quest-worthy kinds.',
  }),
  rewardTierWeights: weights(TIERS).meta({ description: 'Relative weights for the magnitude of a fungible reward.' }),
  inviableChance: z
    .number()
    .min(0)
    .max(1)
    .meta({ description: "Chance the primary goal isn't actually there, revealed by a trial.", examples: [0.15] }),
})
export type GoalsConfig = z.infer<typeof GoalsConfig>

/** Stake (failure-cost) generation knobs. */
export const StakesConfig = z.object({
  stakeChance: z
    .number()
    .min(0)
    .max(1)
    .meta({ description: 'Chance a failed trial costs a permanent resource at all.', examples: [0.4] }),
  stakeTierWeights: weights(TIERS).meta({ description: 'Relative weights for how grave a stake is when one lands.' }),
  stakeKinds: z.partialRecord(z.enum(APPROACHES), weights(FUNGIBLE_KINDS)).meta({
    description: 'Per approach, what a failed trial of that method can cost — weighted by likelihood.',
  }),
})
export type StakesConfig = z.infer<typeof StakesConfig>

/** Prize (success-boon) generation knobs. */
export const PrizesConfig = z.object({
  prizeChance: z
    .number()
    .min(0)
    .max(1)
    .meta({ description: 'Chance a won trial yields a prize.', examples: [0.35] }),
  prizeKindWeights: weights(RESOURCE_KINDS).meta({
    description: 'Relative weights for what a prize is — any resource kind (reflects what was there to win).',
  }),
  prizeTierWeights: weights(TIERS).meta({ description: 'Relative weights for the magnitude of a fungible prize.' }),
})
export type PrizesConfig = z.infer<typeof PrizesConfig>

/** Upfront-cost knobs: the price paid to attempt a trial, win or lose. */
export const CostsConfig = z.object({
  costs: z.partialRecord(z.enum(APPROACHES), z.object({ kind: z.enum(FUNGIBLE_KINDS), tier: z.enum(TIERS) })).meta({
    description: 'Upfront cost of attempting a trial, by approach. Only the few pre-paying approaches appear.',
  }),
})
export type CostsConfig = z.infer<typeof CostsConfig>

const CONFIG_DIR = join(import.meta.dirname, '..', 'config')

const cache = new Map<string, { mtimeMs: number; value: unknown }>()

/** Read + validate a config file, re-parsing only when it changes on disk (so YAML edits are live). */
const load = <T>(file: string, schema: z.ZodType<T>): T => {
  const path = join(CONFIG_DIR, file)
  const mtimeMs = statSync(path).mtimeMs
  const hit = cache.get(file)
  if (hit?.mtimeMs === mtimeMs) {
    return hit.value as T
  }
  const value = schema.parse(parse(readFileSync(path, 'utf8')))
  cache.set(file, { mtimeMs, value })
  return value
}

export const goalsConfig = (): GoalsConfig => load('goals.yaml', GoalsConfig)
export const stakesConfig = (): StakesConfig => load('stakes.yaml', StakesConfig)
export const prizesConfig = (): PrizesConfig => load('prizes.yaml', PrizesConfig)
export const costsConfig = (): CostsConfig => load('costs.yaml', CostsConfig)
