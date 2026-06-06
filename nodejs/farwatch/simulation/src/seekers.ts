import { createRng, type Rng } from '@thrashplay/fw-core'

import { APPROACHES, type Approach } from './approaches.js'
import { seekersConfig } from './config.js'
import { pickDistinct } from './random.js'
import { pickWeighted } from './resources.js'

/** An integer level in [{@link RATING_MIN}, {@link RATING_MAX}]; `0` is unremarkable. */
export type Rating = number
export const RATING_MIN = -2
export const RATING_MAX = 2

/**
 * Words for a {@link Rating}, worst → best. Index into either with `rating - RATING_MIN`, so the
 * middle entry is `0` (unremarkable). These name the scale's meaning and are what a later
 * chronicler projection will render instead of the bare numbers (expose the dice, hide the genome).
 */
export const AFFINITY_WORDS = ['averse', 'reluctant', 'indifferent', 'eager', 'zealous'] as const
export const COMPETENCE_WORDS = ['hapless', 'poor', 'average', 'skilled', 'masterful'] as const

/**
 * Where a seeker stands on one approach — two independent scales, each a {@link Rating}:
 *
 * - **affinity** — how drawn they are to meeting a trial this way (whether they *want* to lead with it).
 * - **competence** — how effective they are when they do (whether it goes deftly or white-knuckle).
 *
 * Independence is the point: the eager bungler (high affinity, low competence) and the reluctant
 * expert (low affinity, high competence) are the characterful corners. Neither bears on a trial's
 * **outcome** — the check decides that — they color *who* led and *how* it read.
 */
export interface Skill {
  readonly affinity: Rating
  readonly competence: Rating
}

/**
 * A seeker: a member of the covenant the chronicles can come to know. Identity is stable — the same
 * `id` and `name` recur across every adventure this person joins, which is what lets a reader (and us)
 * build a sense of them over time. Skills are **sparse**: only the approaches this seeker is notably
 * keen/averse or able/inept at are listed; every unlisted approach is unremarkable on both scales
 * (see {@link skillFor}). The sparseness *is* the characterization — a short list of standout leanings
 * is a silhouette, where a full 22-approach matrix would be a fog.
 */
export interface Seeker {
  readonly id: string
  readonly name: string
  readonly skills: Partial<Record<Approach, Skill>>
}

/** A seeker's standing at an approach, defaulting any unrated approach to unremarkable (`0`/`0`). */
export const skillFor = (seeker: Seeker, approach: Approach): Skill =>
  seeker.skills[approach] ?? { affinity: 0, competence: 0 }

/**
 * The cast we draw from. A fixed pool of grounded, pronounceable given names — a *vocabulary*, like
 * the approaches — sampled without replacement so a roster never repeats a name. Single names are
 * deliberate: for a cast you mean to come to know, first-names-only reads like an ensemble.
 */
const NAME_POOL = [
  'Wren',
  'Edra',
  'Tomas',
  'Sela',
  'Garrick',
  'Miren',
  'Cael',
  'Bryn',
  'Hale',
  'Odric',
  'Lys',
  'Pell',
  'Senna',
  'Roon',
  'Vesna',
  'Dain',
  'Asha',
  'Goss',
  'Tamsin',
  'Eli',
  'Maro',
  'Nessa',
  'Joss',
  'Ferro',
  'Linn',
] as const

/** The fixed roster: which seed grows the cast, and how many of them. */
export const ROSTER_SEED = 1
export const ROSTER_SIZE = 10

/** Draw one affinity/competence level from the weighted table. */
const rollRating = (rng: Rng): Rating => Number(pickWeighted(rng, seekersConfig().ratingWeights))

/**
 * Roll one notable skill. A listed skill must deviate on at least one axis — a `0`/`0` would just be
 * an unlisted approach — so a flat roll is re-drawn until it stands out somewhere.
 */
const rollSkill = (rng: Rng): Skill => {
  let affinity = rollRating(rng)
  let competence = rollRating(rng)
  while (affinity === 0 && competence === 0) {
    affinity = rollRating(rng)
    competence = rollRating(rng)
  }
  return { affinity, competence }
}

/** Generate one seeker with the given name: a sparse handful of standout skills over the approaches. */
const generateSeeker = (rng: Rng, name: string): Seeker => {
  const count = Number(pickWeighted(rng, seekersConfig().skillCountWeights))
  const approaches = pickDistinct(rng, APPROACHES.length, Math.min(count, APPROACHES.length)).map((i) => APPROACHES[i])
  const skills: Partial<Record<Approach, Skill>> = {}
  for (const approach of approaches) {
    skills[approach] = rollSkill(rng)
  }
  return { id: name.toLowerCase(), name, skills }
}

/** Generate `size` distinct seekers (distinct names) from `rng` — the cast, built from nothing. */
export const generateRoster = (rng: Rng, size: number): Seeker[] =>
  pickDistinct(rng, NAME_POOL.length, Math.min(size, NAME_POOL.length)).map((i) => generateSeeker(rng, NAME_POOL[i]))

/**
 * The covenant's standing cast: the same {@link ROSTER_SIZE} seekers every time, grown from a fixed
 * seed so they recur across chronicles (the point — that you come to know them). Regenerated per call
 * rather than memoized, so tuning `seekers.yaml` re-rolls the cast live without a restart.
 */
export const roster = (): Seeker[] => generateRoster(createRng(ROSTER_SEED), ROSTER_SIZE)

/** Pull a party — a weighted-size, distinct subset — from a roster for one adventure. */
export const pickParty = (rng: Rng, pool: readonly Seeker[]): Seeker[] => {
  const size = Number(pickWeighted(rng, seekersConfig().partySizeWeights))
  return pickDistinct(rng, pool.length, Math.min(size, pool.length)).map((i) => pool[i])
}
