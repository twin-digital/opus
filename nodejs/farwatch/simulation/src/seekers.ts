import { createRng, type Rng } from '@thrashplay/fw-core'

import { APPROACHES, type Approach } from './approaches.js'
import { seekersConfig, type SeekersConfig } from './config.js'
import { PROFILES } from './profiles.js'
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
 *
 * `appearance` and `temperament` are stable descriptive texture from the world's permanent record
 * (see {@link PROFILES}) — not simulation load-bearing, but carried here so a seeker reads the same
 * across every chronicle. Optional: a seeker built without the record (e.g. a test) simply has none,
 * and the chronicler falls back to inventing them.
 */
export interface Seeker {
  readonly id: string
  readonly name: string
  readonly skills: Partial<Record<Approach, Skill>>
  readonly appearance?: string
  readonly temperament?: string
}

/** A seeker's standing at an approach, defaulting any unrated approach to unremarkable (`0`/`0`). */
export const skillFor = (seeker: Seeker, approach: Approach): Skill =>
  seeker.skills[approach] ?? { affinity: 0, competence: 0 }

/**
 * Who in a party leads a trial met with `approach`. Affinity picks the lead — whoever is most drawn
 * to meeting it this way steps up — with competence breaking an affinity tie (when no one is keen, the
 * most able is pressed in). Among those *still* tied — notably the common case where no one is notable
 * at the approach and everyone sits at `0`/`0` — one is chosen at random, so the spotlight isn't
 * always the same member. The lead's competence colors *how* the trial read; it never touches the
 * outcome.
 */
export const leadFor = (rng: Rng, party: readonly Seeker[], approach: Approach): Seeker => {
  let best = skillFor(party[0], approach)
  let tied: Seeker[] = [party[0]]
  for (let i = 1; i < party.length; i++) {
    const skill = skillFor(party[i], approach)
    const cmp = skill.affinity - best.affinity || skill.competence - best.competence
    if (cmp > 0) {
      best = skill
      tied = [party[i]]
    } else if (cmp === 0) {
      tied.push(party[i])
    }
  }
  return tied[Math.floor(rng.next() * tied.length)]
}

/**
 * Pick a trial's approach from the **party's leanings** rather than at random.
 *
 * **This is a stop-gap for iterating on the chronicler, *not* the intended sim model.** In the real
 * sim a trial's approach is driven by its obstacle and the agents' choices (deferred — see the design
 * doc's "agent-chosen approaches"); tuning encounters to the roster is exactly what that design avoids.
 * But while we tune the chronicle, drawing the approach from who actually went makes the events
 * reflect the cast — and makes the chosen {@link leadFor} someone genuinely keen, so the prose shows
 * the eager/able corners instead of a fog of "indifferent".
 *
 * Each approach the party is *positively drawn to* is weighted by the summed positive affinity across
 * its members; the draw lands there — except with `offTypeChance`, when it instead falls uniformly on
 * an approach **no one is drawn to** (the party forced onto unfamiliar ground). With no positive
 * affinities at all, it is uniform across the pool.
 */
export const pickPartyApproach = (rng: Rng, party: readonly Seeker[]): Approach => {
  const attuned: Partial<Record<Approach, number>> = {}
  const offTypes: Approach[] = []
  for (const approach of APPROACHES) {
    const drawnTo = party.reduce((sum, seeker) => sum + Math.max(0, skillFor(seeker, approach).affinity), 0)
    if (drawnTo > 0) {
      attuned[approach] = drawnTo
    } else {
      offTypes.push(approach)
    }
  }
  const wild = rng.next() < seekersConfig().offTypeChance
  if (Object.keys(attuned).length === 0 || (wild && offTypes.length > 0)) {
    const pool = offTypes.length > 0 ? offTypes : APPROACHES
    return pool[Math.floor(rng.next() * pool.length)]
  }
  return pickWeighted(rng, attuned)
}

/**
 * The cast we draw from: the names in the permanent record ({@link PROFILES}), sampled without
 * replacement so a roster never repeats a name. The record *is* the vocabulary — every drawable name
 * carries a profile — and single given names are deliberate: for a cast you mean to come to know,
 * first-names-only reads like an ensemble.
 */
const NAME_POOL = Object.keys(PROFILES)

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

/**
 * Generate one seeker with the given name: a sparse handful of standout skills over the approaches,
 * plus the stable descriptive texture the permanent record holds for that name.
 */
const generateSeeker = (rng: Rng, name: string): Seeker => {
  const count = Number(pickWeighted(rng, seekersConfig().skillCountWeights))
  const approaches = pickDistinct(rng, APPROACHES.length, Math.min(count, APPROACHES.length)).map((i) => APPROACHES[i])
  const skills: Partial<Record<Approach, Skill>> = {}
  for (const approach of approaches) {
    skills[approach] = rollSkill(rng)
  }
  return { id: name.toLowerCase(), name, skills, ...PROFILES[name as keyof typeof PROFILES] }
}

/** Generate `size` distinct seekers (distinct names) from `rng` — the cast, built from nothing. */
export const generateRoster = (rng: Rng, size: number): Seeker[] =>
  pickDistinct(rng, NAME_POOL.length, Math.min(size, NAME_POOL.length)).map((i) => generateSeeker(rng, NAME_POOL[i]))

/**
 * The covenant's standing cast: the same {@link ROSTER_SIZE} seekers every time, grown from a fixed
 * seed so they recur across chronicles (the point — that you come to know them). Memoized on the
 * config's identity (which `seekersConfig` swaps only when `seekers.yaml` changes on disk), so the
 * resolver's hot path doesn't re-roll the whole cast every adventure, yet tuning the YAML still
 * re-rolls it live without a restart.
 */
let cachedRoster: { config: SeekersConfig; cast: Seeker[] } | undefined
export const roster = (): Seeker[] => {
  const config = seekersConfig()
  if (cachedRoster?.config !== config) {
    cachedRoster = { config, cast: generateRoster(createRng(ROSTER_SEED), ROSTER_SIZE) }
  }
  return cachedRoster.cast
}

/** Pull a party — a weighted-size, distinct subset — from a roster for one adventure. */
export const pickParty = (rng: Rng, pool: readonly Seeker[]): Seeker[] => {
  const size = Number(pickWeighted(rng, seekersConfig().partySizeWeights))
  return pickDistinct(rng, pool.length, Math.min(size, pool.length)).map((i) => pool[i])
}
