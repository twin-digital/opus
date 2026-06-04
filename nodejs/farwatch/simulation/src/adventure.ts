import type { Rng } from '@thrashplay/fw-core'

/**
 * The success threshold for the (deliberately trivial) adventure check: a flat 50%.
 *
 * There are no stats, modifiers, tags, or difficulty yet — an adventure is one random draw
 * against this target. This is the thinnest thing that can be true. Everything a story needs
 * beyond "did it succeed?" is intentionally not pinned, so that reading generated chronicles
 * tells us what to pin next.
 */
export const TARGET = 0.5

/** The pinned result of resolving one adventure — the entire factual record. */
export interface AdventureResult {
  /** The random draw in [0, 1). Pinned for reproducibility/debugging, not for the narrative. */
  readonly roll: number
  /** The threshold the roll was compared against. */
  readonly target: number
  /** Whether the adventure succeeded (`roll < target`). */
  readonly success: boolean
}

/** Resolve one adventure: a single random draw against {@link TARGET}. */
export const resolveAdventure = (rng: Rng): AdventureResult => {
  const roll = rng.next()
  return { roll, target: TARGET, success: roll < TARGET }
}
