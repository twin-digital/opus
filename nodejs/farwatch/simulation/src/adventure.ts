import type { Rng } from '@thrashplay/fw-core'

import { APPROACHES, type Approach } from './approaches.js'
import { generatePrimaryGoal, type Goal } from './goals.js'
import type { ResourceDelta } from './resources.js'
import { generateStake } from './stakes.js'

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
 * A node in the adventure: a hard thing the party came through. For now a leaf — a single check
 * met with one {@link Approach}, its outcome equal to that check's. It gains an obstacle, a prize,
 * and (eventually) nested sub-trials as generated chronicles show we need them.
 */
export interface Trial {
  /** The method the party used to (try to) overcome this trial. */
  readonly approach: Approach
  /** What failing this trial costs — generated from the approach; absent on most trials. */
  readonly stake?: ResourceDelta
  readonly check: Check
  readonly outcome: Outcome
}

/** Where a ledger movement came from. */
export type LedgerSource = 'cost' | 'stake' | 'prize' | 'reward'

/** One resource movement an adventure produced, tagged with its source (gain/loss is implied). */
export interface LedgerEntry {
  readonly source: LedgerSource
  readonly delta: ResourceDelta
}

/** One resolved adventure: its goal, the trials, the overall verdict, and the resource ledger. */
export interface Adventure {
  readonly goal: Goal
  readonly trials: readonly Trial[]
  readonly outcome: Outcome
  /** Itemized resource movements (stakes lost, reward won), in order. @see buildLedger */
  readonly ledger: readonly LedgerEntry[]
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
  const stake = generateStake(rng, approach)
  return stake ? { approach, stake, check, outcome: check.outcome } : { approach, check, outcome: check.outcome }
}

/** Assemble the itemized ledger: stakes lost on failed trials, plus the goal reward if won. */
const buildLedger = (goal: Goal, trials: readonly Trial[], outcome: Outcome): LedgerEntry[] => {
  const ledger: LedgerEntry[] = []
  for (const trial of trials) {
    if (trial.stake && trial.outcome === 'failure') {
      ledger.push({ source: 'stake', delta: trial.stake })
    }
  }
  // The reward lands only on overall success, and only if the goal was actually there to win.
  if (outcome === 'success' && goal.viable) {
    ledger.push({ source: 'reward', delta: goal.reward })
  }
  return ledger
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
  const goal = generatePrimaryGoal(rng)
  const trials: Trial[] = []
  let outcome: Outcome = 'failure'
  for (let i = 0; i < TRIALS; i++) {
    const trial = resolveTrial(rng)
    trials.push(trial)
    outcome = trial.outcome
  }
  return { goal, trials, outcome, ledger: buildLedger(goal, trials, outcome) }
}
