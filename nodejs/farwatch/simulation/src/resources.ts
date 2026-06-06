import type { Rng } from '@thrashplay/fw-core'

/**
 * The resource economy's vocabulary — deliberately small (lean nouns, see
 * `docs/farwatch/adventure-simulation.md`).
 *
 * **Fungible** kinds are tracked as a coarse magnitude {@link Tier} (no units — never "3 wealth,"
 * always "a major haul"). **Non-fungible** kinds have no tier: they are a specific named instance,
 * had or not (the macguffin).
 */
export const FUNGIBLE_KINDS = ['wealth', 'supplies', 'vigor', 'renown', 'lore'] as const
export const NONFUNGIBLE_KINDS = ['item', 'secret'] as const

export type FungibleKind = (typeof FUNGIBLE_KINDS)[number]
export type NonfungibleKind = (typeof NONFUNGIBLE_KINDS)[number]

/** All resource kinds, fungible first — the source tuple for config key enums. */
export const RESOURCE_KINDS = [...FUNGIBLE_KINDS, ...NONFUNGIBLE_KINDS] as const
export type ResourceKind = (typeof RESOURCE_KINDS)[number]

/** Coarse magnitude tiers for fungible amounts. Ordinal (1–4 below), surfaced as the word. */
export const TIERS = ['minor', 'moderate', 'major', 'extreme'] as const
export type Tier = (typeof TIERS)[number]

/** A change to resources: a fungible amount (a tier of a kind) or a non-fungible instance. */
export type ResourceDelta = { readonly kind: FungibleKind; readonly tier: Tier } | { readonly kind: NonfungibleKind } // a specific one — the chronicler names it; identity TBD

/** True for the non-fungible kinds; narrows a {@link ResourceKind} for delta construction. */
export const isNonfungible = (kind: ResourceKind): kind is NonfungibleKind =>
  (NONFUNGIBLE_KINDS as readonly ResourceKind[]).includes(kind)

/**
 * Pick one key from a weight map (`{ value: weight }`) using `rng`. Weights are relative; they need
 * not sum to 1. This is the shape config tables take, so generation reads straight from YAML.
 */
export const pickWeighted = <K extends string>(rng: Rng, weights: Partial<Record<K, number>>): K => {
  const entries = Object.entries(weights) as [K, number][]
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let roll = rng.next() * total
  for (const [value, weight] of entries) {
    roll -= weight
    if (roll < 0) {
      return value
    }
  }
  return entries[entries.length - 1][0] // unreachable barring float rounding
}

/** Human-facing description and a worked example for a resource kind. */
export interface ResourceInfo {
  readonly description: string
  readonly example: string
}

/**
 * The resource catalog: what each kind *means*, in one place. Single source for the glossary, for
 * generated docs, and (later) for the chronicler — so the model knows what a `vigor` loss or an
 * `item` gained actually is. `satisfies` guarantees every kind is described.
 */
export const RESOURCE_INFO = {
  wealth: { description: 'Fungible coin and treasure.', example: 'a chest of old marks' },
  supplies: {
    description: 'Consumable provisions and gear — food, rope, oil, spare arms.',
    example: 'a season of rations',
  },
  vigor: { description: "The party's health, strength, and stamina.", example: 'the strength to press on' },
  renown: { description: 'Fame and reputation — how the covenant is regarded.', example: 'the awe of three valleys' },
  lore: {
    description: 'General knowledge — maps, history, the ways of things.',
    example: 'the reading of star-charts',
  },
  item: {
    description: 'A specific, non-fungible treasure, artifact, or piece of equipment.',
    example: 'the drowned bell',
  },
  secret: { description: 'A specific, non-fungible thing known.', example: "where the vault's true lock lies" },
} as const satisfies Record<ResourceKind, ResourceInfo>
