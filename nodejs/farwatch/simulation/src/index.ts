export {
  APPROACHES,
  resolveAdventure,
  TARGET,
  type Adventure,
  type Approach,
  type Check,
  type Outcome,
  type Trial,
} from './adventure.js'

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
