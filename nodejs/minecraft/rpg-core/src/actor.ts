/**
 * The spawn, lookup, and removal surface. Every call acting on an actor first checks that the
 * entity type its preset names is registered in the world, and throws
 * `ActorDefinitionsMissingError` when it is not — no call half-succeeds.
 */

import { world, type Dimension, type Entity, type Vector3 } from '@minecraft/server'

import { requireDefinitions } from './catalog.js'
import { placeActor, resolveActor } from './internal.js'
import type { PresetName } from './registry.js'

/** Where an actor is placed. */
export interface ActorPlace {
  readonly dimension: Dimension
  readonly location: Vector3
}

/** Options a spawn call may carry beyond the preset and the place. */
export interface SpawnActorOptions {
  /** Overrides the preset's default display name. */
  readonly name?: string
  /**
   * A durable name of the adventure's own. Spawning again under a durable name already in the
   * world returns the actor already there rather than a second one, and {@link findActor}
   * resolves it in a later session.
   */
  readonly id?: string
}

/** What a spawn call gives an adventure back: the actor, and what it may do to it afterwards. */
export interface ActorHandle {
  /** The preset this actor was spawned from. */
  readonly preset: PresetName
  /** The entity identifier the preset names, e.g. `rpg:wizard`. */
  readonly entityId: string
  /** The durable name the actor was created under, if any. */
  readonly id?: string
  /** The underlying entity, for whatever the adventure does beyond this surface. */
  readonly entity: Entity
  /** Removes the actor from the world, and releases its durable name if it holds one. */
  remove(): void
}

/**
 * Spawns an actor by naming a preset. Applies the preset's default name unless `options.name`
 * overrides it. Spawning under a durable name already in the world returns the actor already
 * there — nothing about it, its name included, is changed.
 *
 * Call after the world has loaded (`world.afterEvents.worldLoad`): the definitions check reads
 * the entity-type catalog, which the engine refuses during early execution.
 *
 * @throws {ActorDefinitionsMissingError} when the preset's entity type is not registered.
 *
 * @example
 * ```ts
 * const wizard = spawnActor('wizard', { dimension: overworld, location: { x: 0, y: 64, z: 0 } }, {
 *   name: 'Eldrin',
 *   id: 'tower-wizard',
 * })
 * ```
 */
export const spawnActor = (preset: PresetName, place: ActorPlace, options?: SpawnActorOptions): ActorHandle =>
  placeActor(requireDefinitions, world, preset, place, options)

/**
 * Resolves a handle to the actor spawned under a durable name, in this session or a later one.
 * Returns undefined when no actor holds the name.
 *
 * @throws {ActorDefinitionsMissingError} when the named actor's entity type is not registered.
 */
export const findActor = (id: string): ActorHandle | undefined => resolveActor(requireDefinitions, world, id)
