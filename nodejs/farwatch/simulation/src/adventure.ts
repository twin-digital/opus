import type { Rng } from '@thrashplay/fw-core'

/**
 * The success threshold for the (deliberately trivial) check: a flat 50%.
 *
 * There are no skills, difficulties, or modifiers yet — a check is one random draw against this
 * target. This is the thinnest thing that can be true; everything a story needs beyond the
 * sequence of outcomes is intentionally not pinned, so that reading generated chronicles tells us
 * what to pin next.
 */
export const TARGET = 0.5

/** Whether a check, trial, or adventure resolved for or against the party. */
export type Outcome = 'success' | 'failure'

/** The atomic resolution: one gated test against a target. */
export interface Check {
  /** The random draw in [0, 1). */
  readonly roll: number
  /** The threshold the roll was compared against. */
  readonly target: number
  /** Whether the draw cleared the target (`roll < target`). */
  readonly outcome: Outcome
}

/**
 * The approaches a party can bring to bear on a trial — the method they (try to) overcome it with.
 * A mechanical skeleton only: it says *how* they engaged (a fight, a ruse, an outlasting), giving
 * the chronicler a concrete hook for variety, but carries no narrative texture itself. One is drawn
 * at random per trial for now — there are no seekers or stats yet to choose it.
 */
export const APPROACHES = [
  'combat',
  'might',
  'speed',
  'endurance',
  'agility',
  'lore',
  'insight',
  'cunning',
  'resolve',
  'diplomacy',
  'deception',
  'intimidation',
  'charm',
  'performance',
  'stealth',
  'evasion',
  'magic',
  'ritual',
  'sacrifice',
  'wealth',
  'craft',
  'preparation',
] as const

/** How a party (tries to) overcome a trial. @see APPROACHES */
export type Approach = (typeof APPROACHES)[number]

/**
 * A node in the adventure: a hard thing the party came through. For now a leaf — a single check
 * met with one {@link Approach}, its outcome equal to that check's. It gains an obstacle, a prize,
 * and (eventually) nested sub-trials as generated chronicles show we need them.
 */
export interface Trial {
  /** The method the party used to (try to) overcome this trial. */
  readonly approach: Approach
  readonly check: Check
  readonly outcome: Outcome
}

/** One resolved adventure: an ordered run of trials plus its overall verdict. */
export interface Adventure {
  readonly trials: readonly Trial[]
  readonly outcome: Outcome
}

/** Resolve a single check: one random draw against {@link TARGET}. */
const resolveCheck = (rng: Rng): Check => {
  const roll = rng.next()
  return { roll, target: TARGET, outcome: roll < TARGET ? 'success' : 'failure' }
}

/** Draw one approach at random from the pool. */
const pickApproach = (rng: Rng): Approach => APPROACHES[Math.floor(rng.next() * APPROACHES.length)]

/** Resolve a single trial — for now a leaf: one approach, one check, its outcome the trial's. */
const resolveTrial = (rng: Rng): Trial => {
  const approach = pickApproach(rng)
  const check = resolveCheck(rng)
  return { approach, check, outcome: check.outcome }
}

/**
 * The shape of an adventure: a few trials of approach, then the climactic trial that decides it.
 * Fixed for now (a chain to read), and named `3 + 1` to keep the deciding trial distinct from the
 * approach — the resolver doesn't treat it specially yet, but the chain's spine is the last beat.
 */
const APPROACH_TRIALS = 3
const TRIALS = APPROACH_TRIALS + 1

/**
 * Resolve one adventure: a short chain of trials, resolved in order. The adventure's overall
 * outcome is its **final** trial's — the climactic beat the chain builds toward. (How the earlier
 * trials should bear on the whole — a tally, a sudden death — is a roll-up rule we haven't needed
 * yet; "the last one decides" is the thinnest rule that still gives the chain a spine.)
 */
export const resolveAdventure = (rng: Rng): Adventure => {
  const trials: Trial[] = []
  let outcome: Outcome = 'failure'
  for (let i = 0; i < TRIALS; i++) {
    const trial = resolveTrial(rng)
    trials.push(trial)
    outcome = trial.outcome
  }
  return { trials, outcome }
}
