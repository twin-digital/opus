/**
 * Entity identity and lifecycle: the `createEntity` and `createPlayer` free functions, id
 * assignment, the per-entity fields and tag set, `spawnEntity`, `triggerEvent` recording,
 * `remove()` with its detach-and-invalidate step, and the `invalidate` free function.
 *
 * Reading a field the caller never supplied — `nameTag`, `location`, `getRotation()` — throws
 * `UnsetValueError` naming the member, because the engine cannot lack those values and a fake that
 * invented one would let a handler branch on fiction.
 */

import type * as MC from '@minecraft/server'

import type { ServerLike } from './create-server.js'

/** What a caller supplies to create an entity. `typeId` is required; the library assigns the id. */
export interface EntityOptions {
  readonly typeId: string
  readonly id?: string
  readonly dimension?: MC.Dimension
  readonly location?: MC.Vector3
}

/** As `EntityOptions`, plus the name a player is worth being given. */
export interface PlayerOptions extends Partial<EntityOptions> {
  readonly name?: string
}

/**
 * A fake entity registered with that bundle's world. An id the caller does not supply is assigned:
 * a decimal string issued sequentially from `1` and never reissued, since in the engine the spawner
 * never chooses it either.
 */
export const createEntity = (_server: ServerLike, _options: EntityOptions): MC.Entity => {
  throw new Error('entity creation is not built yet')
}

/**
 * A fake player, registered like any entity. `name` is worth supplying: `Player.name` is declared a
 * bare `string`, so every read of it on a player created without one throws `UnsetValueError`.
 */
export const createPlayer = (_server: ServerLike, _options?: PlayerOptions): MC.Player => {
  throw new Error('player creation is not built yet')
}

/**
 * Puts a reference into the state the real API leaves a stale one in, at any point in a test —
 * including on a reference a handler is holding mid-event. Distinct from `remove()`, which
 * invalidates as part of removing: this reaches the entity that goes stale without leaving the
 * world, and the corpse a `kill()` left valid.
 */
export const invalidate = (_entity: MC.Entity): void => {
  throw new Error('invalidation is not built yet')
}

/**
 * The `kill()` path for an entity carrying no health component: it fires `entityDie` with cause
 * `selfDestruct` and nothing else, and leaves the reference valid and registered. `kill` itself is
 * registered by the component model, which branches here when no health component is attached.
 */
export const killWithoutHealth = (_entity: MC.Entity): void => {
  throw new Error('the health-less kill path is not built yet')
}

/** The `triggerEvent` calls made on an entity, in order. */
export const getTriggeredEvents = (_entity: MC.Entity): readonly string[] => {
  throw new Error('trigger-event recording is not built yet')
}
