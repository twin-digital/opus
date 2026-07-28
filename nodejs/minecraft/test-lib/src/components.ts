/**
 * Entity components: the `addComponent` and `removeComponent` free functions, `getComponent` id
 * normalization, the seven attribute-shaped components with their bounds checks, and every cascade
 * that writes health — the component writes, `applyDamage`, and `kill`'s health-bearing branch.
 *
 * Every other component can be attached and carries its declared shape, but only its `typeId`,
 * `isValid` and `entity` members behave; the rest throw `NotImplementedError`.
 */

import type * as MC from '@minecraft/server'

import type { EntityComponentId } from './ids.js'
import type { AttributeValues } from './runtime/state.js'

/**
 * The state an attribute-shaped component is attached with: the four numbers it holds, or one of
 * two shorthands. A single number is `currentValue`, with `effectiveMin` 0 and `effectiveMax` equal
 * to it; a `[min, max]` pair gives those bounds with `currentValue` at `max`. Both leave
 * `defaultValue` unset, and each is exactly the record it abbreviates.
 */
export type ComponentSpec = AttributeValues | number | readonly [min: number, max: number]

/**
 * Attaches a component to a live entity, because the real API reshapes an entity's components only
 * through data-driven paths these fakes do not model. The state argument is accepted only on one of
 * the seven attribute-shaped ids; passing it with any other id throws `InvalidArgumentError`.
 */
export const addComponent = (_entity: MC.Entity, _componentId: string, _state?: ComponentSpec): MC.EntityComponent => {
  throw new Error('component attachment is not built yet')
}

/** Detaches a component from a live entity, and answers whether it was there. */
export const removeComponent = (_entity: MC.Entity, _componentId: EntityComponentId): boolean => {
  throw new Error('component detachment is not built yet')
}
