export {
  resolveAdventure,
  TARGET,
  type Adventure,
  type Check,
  type LedgerEntry,
  type LedgerSource,
  type Outcome,
  type Trial,
} from './adventure.js'
export { APPROACHES, type Approach } from './approaches.js'
export { type Goal, type OptionalGoal, type UnknownGoal } from './goals.js'
export {
  skillFor,
  leadFor,
  roster,
  pickParty,
  generateRoster,
  AFFINITY_WORDS,
  COMPETENCE_WORDS,
  RATING_MIN,
  RATING_MAX,
  ROSTER_SEED,
  ROSTER_SIZE,
  type Rating,
  type Skill,
  type Seeker,
} from './seekers.js'
export {
  approachesConfig,
  costsConfig,
  goalsConfig,
  prizesConfig,
  seekersConfig,
  stakesConfig,
  type ApproachesConfig,
  type CostsConfig,
  type GoalsConfig,
  type PrizesConfig,
  type SeekersConfig,
  type StakesConfig,
} from './config.js'
export {
  FUNGIBLE_KINDS,
  NONFUNGIBLE_KINDS,
  RESOURCE_KINDS,
  RESOURCE_INFO,
  TIERS,
  isNonfungible,
  pickWeighted,
  type FungibleKind,
  type NonfungibleKind,
  type ResourceDelta,
  type ResourceInfo,
  type ResourceKind,
  type Tier,
} from './resources.js'

/** A discrete-time simulation that advances in fixed steps ("ticks"). */
export interface SimulationState {
  /** Number of ticks elapsed since the simulation began. */
  readonly tick: number
}

export interface Simulation {
  /** A snapshot of the current state. */
  readonly state: SimulationState
  /** Advance the simulation by `steps` ticks (default 1). Returns the new state. */
  step(steps?: number): SimulationState
}

/**
 * Create a discrete-time simulation.
 *
 * @param initialTick - the tick the simulation starts at (default 0)
 */
export const createSimulation = (initialTick = 0): Simulation => {
  if (!Number.isInteger(initialTick) || initialTick < 0) {
    throw new RangeError(`initialTick must be a non-negative integer, got ${initialTick}`)
  }

  let tick = initialTick

  return {
    get state(): SimulationState {
      return { tick }
    },
    step(steps = 1): SimulationState {
      if (!Number.isInteger(steps) || steps < 0) {
        throw new RangeError(`steps must be a non-negative integer, got ${steps}`)
      }
      tick += steps
      return { tick }
    },
  }
}
