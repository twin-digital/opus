import type { EntityAttributeComponent, EntityComponentTypeMap } from '@minecraft/server'

/**
 * Every entity component id `@minecraft/server` declares, in both the bare (`health`) and the
 * canonical prefixed (`minecraft:health`) form. Derived from `EntityComponentTypeMap`, so a
 * version bump updates it with no hand-maintained list.
 */
export type EntityComponentId = keyof EntityComponentTypeMap

/**
 * The canonical (`minecraft:`-prefixed) subset of {@link EntityComponentId}. This is the form
 * the engine reports and the form all fake state is stored in.
 */
export type CanonicalEntityComponentId = Extract<EntityComponentId, `minecraft:${string}`>

/**
 * The component ids whose declared component class is attribute-shaped
 * (`EntityAttributeComponent`) — the only components a spawn spec or {@link addComponent} can
 * stage. Both bare and prefixed forms are accepted; state is stored under the prefixed form.
 */
export type AttributeComponentId = {
  [K in EntityComponentId]: EntityComponentTypeMap[K] extends EntityAttributeComponent ? K : never
}[EntityComponentId]

/**
 * The canonical (`minecraft:`-prefixed) subset of {@link AttributeComponentId}.
 */
export type CanonicalAttributeComponentId = Extract<AttributeComponentId, `minecraft:${string}`>

/**
 * Normalizes a namespace-optional id to the canonical form: an id with no namespace gets the
 * `minecraft:` prefix, an id that already carries a namespace is returned unchanged. The engine
 * applies this rule uniformly across component ids, effect types, entity events, and entity
 * types, and reports the prefixed form; the fakes store and report only that canonical form.
 */
export const canonicalizeId = (id: string): string => (id.includes(':') ? id : `minecraft:${id}`)
