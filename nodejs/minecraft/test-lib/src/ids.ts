/**
 * The id sets the library handles, derived from the declarations rather than transcribed, and the
 * normalization every id-taking surface applies on entry.
 *
 * `@minecraft/server` ships no runtime JavaScript, so an enum member like
 * `EntityComponentTypes.Health` has a type and no value: every id the library handles is a plain
 * string. A test wanting named constants takes them from `@minecraft/vanilla-data`, whose values
 * are these same prefixed ids.
 */

import type * as MC from '@minecraft/server'

/** Every component id the declarations accept, bare and prefixed alike. */
export type EntityComponentId = keyof MC.EntityComponentTypeMap

/** The `minecraft:`-prefixed component ids — the form the library stores and reports. */
export type CanonicalEntityComponentId = `${MC.EntityComponentTypes}`

/** The component ids whose component is attribute-shaped, whichever form they are written in. */
export type AttributeComponentId = {
  [K in keyof MC.EntityComponentTypeMap]: MC.EntityComponentTypeMap[K] extends MC.EntityAttributeComponent ? K : never
}[keyof MC.EntityComponentTypeMap]

/** The prefixed spelling of an attribute-shaped component id. */
export type CanonicalAttributeComponentId = Extract<AttributeComponentId, `minecraft:${string}`>

/**
 * The attribute-shaped ids as data. The derived union above is a type and produces nothing at
 * runtime, so `addComponent` dispatches on this array and the union checks that it is complete.
 */
export const ATTRIBUTE_COMPONENT_IDS = [
  'minecraft:health',
  'minecraft:lava_movement',
  'minecraft:movement',
  'minecraft:player.exhaustion',
  'minecraft:player.hunger',
  'minecraft:player.saturation',
  'minecraft:underwater_movement',
] as const satisfies readonly CanonicalAttributeComponentId[]

type AssertNever<T extends never> = T
/** Fails to compile if the declarations carry an attribute component the array above misses. */
type _AttributeIdsComplete = AssertNever<
  Exclude<CanonicalAttributeComponentId, (typeof ATTRIBUTE_COMPONENT_IDS)[number]>
>
export type { _AttributeIdsComplete }

/** Whether an id — in either form — names one of the seven attribute-shaped components. */
export const isAttributeComponentId = (id: string): boolean =>
  (ATTRIBUTE_COMPONENT_IDS as readonly string[]).includes(canonicalId(id))

/**
 * The canonical, `minecraft:`-prefixed spelling of an id. The engine reports the prefixed form, so
 * storing it is what makes a read compare equal against the `@minecraft/vanilla-data` constants a
 * test holds. Tolerance of the bare form is per-surface, so a caller decides where to apply this;
 * `triggerEvent` is the one modelled surface that does not.
 */
export const canonicalId = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`)
