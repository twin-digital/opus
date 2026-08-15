/**
 * The checked entity calls: each hands back only entities carrying this pack's own type family,
 * so a definition a rival pack's content replaced (the engine keeps one whole definition per
 * identifier) is caught at use instead of acting under this pack's name. They are for the pack's
 * own types — a vanilla or foreign entity is reached through `@minecraft/server` directly.
 *
 * In a pack built with namespacing off the build stamped no family, and every call here answers
 * unchecked, exactly as the engine does.
 */
import type { Dimension, Entity, EntityQueryOptions, SpawnEntityOptions, Vector3 } from '@minecraft/server'

/** Raised by a checked call whose one answering entity lacks the pack's own family. */
export class ForeignEntityError extends Error {
  /** The type of the entity that failed the check. */
  readonly entityTypeId: string
  /** The family the pack's own entities carry, which the entity lacked. */
  readonly expectedFamily: string
  /** Whether the call removed the entity: a spawn removes what it spawned, a lookup leaves it. */
  readonly removed: boolean

  constructor(entityTypeId: string, expectedFamily: string, removed: boolean) {
    super(
      `entity '${entityTypeId}' lacks the pack's own family '${expectedFamily}': its definition was replaced by another pack's`,
    )
    this.name = 'ForeignEntityError'
    this.entityTypeId = entityTypeId
    this.expectedFamily = expectedFamily
    this.removed = removed
  }
}

/**
 * Spawns one of this pack's own entities, as `Dimension.spawnEntity` does, and checks what came
 * back: an entity lacking the pack's own family is removed and the call raises
 * {@link ForeignEntityError}, so nothing foreign persists under a spawn this pack made.
 */
export function spawnEntity(
  dimension: Dimension,
  identifier: string,
  location: Vector3,
  options?: SpawnEntityOptions,
): Entity {
  void dimension
  void identifier
  void location
  void options
  throw new Error('not implemented')
}

/**
 * Looks an entity up by id, as `world.getEntity` does, and checks what came back: an entity
 * lacking the pack's own family raises {@link ForeignEntityError}, left where it was found.
 * `undefined` where nothing answers, exactly as the engine reports it.
 */
export function getEntity(entityId: string): Entity | undefined {
  void entityId
  throw new Error('not implemented')
}

/**
 * Queries a dimension's entities, as `Dimension.getEntities` does, and hands back only those
 * carrying the pack's own family: foreign entities are left out of the result, never raised over.
 */
export function getEntities(dimension: Dimension, options?: EntityQueryOptions): Entity[] {
  void dimension
  void options
  throw new Error('not implemented')
}
