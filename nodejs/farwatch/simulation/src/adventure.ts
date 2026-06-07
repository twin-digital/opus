import type { Rng } from '@thrashplay/fw-core'

import type { Approach } from './approaches.js'
import { approachesConfig } from './config.js'
import { generateCost } from './costs.js'
import {
  generateOptionalGoals,
  generatePrimaryGoal,
  generateUnknownGoal,
  type Goal,
  type OptionalGoal,
  type UnknownGoal,
} from './goals.js'
import { generatePrize } from './prizes.js'
import { pickWeighted, type ResourceDelta } from './resources.js'
import { leadFor, pickParty, roster, type Seeker } from './seekers.js'
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
  /** What attempting this trial costs up front, win or lose — only a few approaches pre-pay. */
  readonly cost?: ResourceDelta
  /** What failing this trial costs — generated from the approach; absent on most trials. */
  readonly stake?: ResourceDelta
  /** What succeeding at this trial wins — a boon; absent on most trials. */
  readonly prize?: ResourceDelta
  /** The `id` of the party member who led this trial — chosen by affinity. @see leadFor */
  readonly lead: string
  readonly check: Check
  readonly outcome: Outcome
}

/** Where a ledger movement came from. */
export type LedgerSource = 'cost' | 'stake' | 'prize' | 'optional' | 'unknown' | 'reward'

/** One resource movement an adventure produced, tagged with its source (gain/loss is implied). */
export interface LedgerEntry {
  readonly source: LedgerSource
  readonly delta: ResourceDelta
}

/** One resolved adventure: its goal, the trials, the overall verdict, and the resource ledger. */
export interface Adventure {
  readonly goal: Goal
  /** The seekers who set out — each trial's `lead` is one of these. @see pickParty */
  readonly party: readonly Seeker[]
  /** Secondary aims, each bound to a trial whose success wins it. @see generateOptionalGoals */
  readonly optionalGoals: readonly OptionalGoal[]
  /** Unsought goals minted by a winning trial, each bound to the trial that found it. */
  readonly unknownGoals: readonly UnknownGoal[]
  readonly trials: readonly Trial[]
  readonly outcome: Outcome
  /** Itemized resource movements (costs, stakes, prizes, reward), in order. @see buildLedger */
  readonly ledger: readonly LedgerEntry[]
}

/** Resolve a single check: one random draw against {@link TARGET}. */
const resolveCheck = (rng: Rng): Check => {
  const roll = rng.next()
  return { roll, target: TARGET, outcome: roll < TARGET ? 'success' : 'failure' }
}

/** Draw one approach from the weighted table (skewed to adventure-common methods). */
const pickApproach = (rng: Rng): Approach => pickWeighted(rng, approachesConfig().approachWeights)

/** Resolve a single trial — for now a leaf: one approach, one check, its outcome the trial's. */
const resolveTrial = (rng: Rng, party: readonly Seeker[]): Trial => {
  const approach = pickApproach(rng)
  const check = resolveCheck(rng)
  const stake = generateStake(rng, approach)
  const cost = generateCost(approach)
  const lead = leadFor(rng, party, approach).id
  return {
    approach,
    ...(cost ? { cost } : {}),
    ...(stake ? { stake } : {}),
    lead,
    check,
    outcome: check.outcome,
  }
}

/**
 * Assemble the itemized ledger: each trial's upfront cost (always), its stake (on a failed trial)
 * and its incidental prize (on a won trial); each optional goal won by its bound trial; each unknown
 * goal a trial discovered; and the goal reward on overall success (which already accounts for
 * viability).
 */
const buildLedger = (
  goal: Goal,
  optionalGoals: readonly OptionalGoal[],
  unknownGoals: readonly UnknownGoal[],
  trials: readonly Trial[],
  outcome: Outcome,
): LedgerEntry[] => {
  const ledger: LedgerEntry[] = []
  for (const trial of trials) {
    if (trial.cost) {
      ledger.push({ source: 'cost', delta: trial.cost })
    }
    if (trial.stake && trial.outcome === 'failure') {
      ledger.push({ source: 'stake', delta: trial.stake })
    }
    if (trial.prize && trial.outcome === 'success') {
      ledger.push({ source: 'prize', delta: trial.prize })
    }
  }
  // An optional goal is won by succeeding at its bound trial — independent of the overall outcome.
  for (const opt of optionalGoals) {
    if (trials[opt.trial].outcome === 'success') {
      ledger.push({ source: 'optional', delta: opt.reward })
    }
  }
  // An unknown goal is already conditioned on its trial's success (it can only be minted by one).
  for (const unknown of unknownGoals) {
    ledger.push({ source: 'unknown', delta: unknown.reward })
  }
  if (outcome === 'success') {
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
  const party = pickParty(rng, roster())
  const goal = generatePrimaryGoal(rng)
  const optionalGoals = generateOptionalGoals(rng, TRIALS)
  const bound = new Set(optionalGoals.map((opt) => opt.trial))
  const trials: Trial[] = []
  const unknownGoals: UnknownGoal[] = []
  let lastOutcome: Outcome = 'failure'
  for (let i = 0; i < TRIALS; i++) {
    const core = resolveTrial(rng, party)
    // A trial bound to an optional goal has no incidental prize — its reward is that optional.
    const prize = bound.has(i) ? undefined : generatePrize(rng)
    trials.push(prize ? { ...core, prize } : core)
    // Only a won trial can turn up an unsought goal — the discovery has a cause.
    if (core.outcome === 'success') {
      const reward = generateUnknownGoal(rng)
      if (reward) {
        unknownGoals.push({ reward, trial: i })
      }
    }
    lastOutcome = core.outcome
  }
  // The expedition fails outright if its goal was never there to win, however the trials went.
  const outcome: Outcome = goal.viable ? lastOutcome : 'failure'
  return {
    goal,
    party,
    optionalGoals,
    unknownGoals,
    trials,
    outcome,
    ledger: buildLedger(goal, optionalGoals, unknownGoals, trials, outcome),
  }
}
