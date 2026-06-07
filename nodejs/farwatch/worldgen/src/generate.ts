import { createRng, hashSeed, type Rng } from '@thrashplay/fw-core'

import { THEMES } from './grammar.js'
import type { Charter, Founding, Seeker } from './types.js'
import { DOMAINS, TEMPERAMENTS } from './vocabulary.js'

/** Fill {a} {b} {elder} {name} with distinct cast names, and {lost} with a lost name. */
const fill = (template: string, rng: Rng, castNames: string[], lostName: string): string => {
  const pool = rng.shuffle(castNames)
  let cursor = 0
  const assigned: Record<string, string> = {}
  const take = (): string => pool[cursor++ % pool.length]
  return template.replace(/\{(\w+)\}/g, (_match, token: string) => {
    if (token === 'lost') {
      return lostName
    }
    assigned[token] ??= take()
    return assigned[token]
  })
}

/**
 * Generate a fresh compact founding from a seed. Deterministic: same seed → same founding.
 *
 * The output satisfies the toy quality contract — graspable cast (5–8 named), a legible
 * charter, ≥1 live tension, ≥1 open thread — coherently themed by construction.
 */
export const generateFounding = (seed: number): Founding => {
  // Hash the user-facing seed so consecutive seeds (e.g. --count) yield varied foundings;
  // the original seed is still what we report and reproduce from.
  const rng = createRng(hashSeed(seed))

  const theme = rng.pick(THEMES)
  const name = rng.pick(theme.names)
  const themeTags = rng.sample(theme.tags, rng.int(2, 3))
  const mood = rng.pick(theme.moods)

  const purpose = rng.pick(theme.purposes)
  const charter: Charter = {
    purpose: purpose.text,
    arcShape: purpose.arcShape,
    arcGloss: purpose.arcGloss,
    domains: purpose.domains,
  }

  // The charter biases who the compact draws — its demanded domains are over-represented.
  const domainWeight = (domain: string): number => (charter.domains.includes(domain) ? 3 : 1)

  const castSize = rng.int(5, 8)
  const castNames = rng.sample(theme.givenNames, castSize)
  const epithets = rng.shuffle(theme.epithets)
  const flavors = rng.shuffle(theme.flavors)

  const cast: Seeker[] = castNames.map((memberName, i): Seeker => {
    const seeker: Seeker = {
      name: memberName,
      domain: rng.weighted(DOMAINS, domainWeight),
      temperament: rng.sample(TEMPERAMENTS, rng.int(1, 2)),
    }
    // Epithets and flavor are scarce — not every seeker earns one.
    if (rng.chance(0.5) && i < epithets.length) {
      seeker.epithet = epithets[i]
    }
    if (rng.chance(0.55) && i < flavors.length) {
      seeker.flavor = flavors[i]
    }
    return seeker
  })

  const taken = new Set(castNames)
  const leftover = theme.givenNames.filter((n) => !taken.has(n))
  const lostName = leftover.length > 0 ? rng.pick(leftover) : 'one whose name is lost'

  const tension = fill(rng.pick(theme.tensions), rng, castNames, lostName)
  const openThread = fill(rng.pick(theme.threads), rng, castNames, lostName)

  const membership = rng.int(cast.length + 12, cast.length + 48)

  return { seed, name, theme: theme.key, themeTags, mood, charter, cast, membership, tension, openThread }
}
