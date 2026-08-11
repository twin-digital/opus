/**
 * The spawn, lookup, and removal surface. Every call acting on an actor first checks that the
 * entity type its preset names is registered in the world, and throws
 * `ActorDefinitionsMissingError` when it is not — no call half-succeeds.
 */

import type { Dimension, Entity, Vector3 } from '@minecraft/server'

import type { PresetName } from './registry.js'

/** Where an actor is placed. */
export interface ActorPlace {
  readonly dimension: Dimension
  readonly location: Vector3
  /** Y rotation in degrees the actor initially faces. Defaults to 0. */
  readonly rotation?: number
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
  /** Removes the actor from the world. */
  remove(): void
}

/**
 * Spawns an actor by naming a preset. Applies the preset's default name unless
 * `options.name` overrides it.
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
export const spawnActor = (preset: PresetName, place: ActorPlace, options?: SpawnActorOptions): ActorHandle => {
  void preset
  void place
  void options
  throw new Error('not implemented')
}

/**
 * Resolves a handle to the actor spawned under a durable name, in this session or a later one.
 * Returns undefined when no actor holds the name.
 *
 * @throws {ActorDefinitionsMissingError} when the found actor's entity type is not registered.
 */
export const findActor = (id: string): ActorHandle | undefined => {
  void id
  throw new Error('not implemented')
}
