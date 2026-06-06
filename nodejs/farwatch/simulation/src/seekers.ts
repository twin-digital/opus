import type { Approach } from './approaches.js'

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
