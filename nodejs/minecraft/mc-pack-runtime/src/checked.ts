/**
 * The checked entity calls: each hands back only entities carrying this pack's own type family,
 * so a definition a rival pack's content replaced (the engine keeps one whole definition per
 * identifier) is caught at use instead of acting under this pack's name. They are for the pack's
 * own types — a vanilla or foreign entity is reached through `@minecraft/server` directly.
 *
 * In a pack built with namespacing off the build stamped no family, and every call here answers
 * unchecked, exactly as the engine does.
 */
import { world } from '@minecraft/server'
import type { Dimension, Entity, EntityQueryOptions, SpawnEntityOptions, Vector3 } from '@minecraft/server'

import { packFamily } from './identifier.js'

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

/** Whether the entity carries `family`; an entity with no type-family component carries none. */
const carriesFamily = (entity: Entity, family: string): boolean =>
  entity.getComponent('minecraft:type_family')?.hasTypeFamily(family) ?? false

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
  const entity = dimension.spawnEntity(identifier, location, options)
  const family = packFamily()
  if (family !== undefined && !carriesFamily(entity, family)) {
    const entityTypeId = entity.typeId
    entity.remove()
    throw new ForeignEntityError(entityTypeId, family, true)
  }
  return entity
}

/**
 * Looks an entity up by id, as `world.getEntity` does, and checks what came back: an entity
 * lacking the pack's own family raises {@link ForeignEntityError}, left where it was found.
 * `undefined` where nothing answers, exactly as the engine reports it.
 */
export function getEntity(entityId: string): Entity | undefined {
  const entity = world.getEntity(entityId)
  if (entity === undefined) {
    return undefined
  }
  const family = packFamily()
  if (family !== undefined && !carriesFamily(entity, family)) {
    throw new ForeignEntityError(entity.typeId, family, false)
  }
  return entity
}

/**
 * Queries a dimension's entities, as `Dimension.getEntities` does, and hands back only those
 * carrying the pack's own family: foreign entities are left out of the result, never raised over.
 */
export function getEntities(dimension: Dimension, options?: EntityQueryOptions): Entity[] {
  const family = packFamily()
  if (family === undefined) {
    return dimension.getEntities(options)
  }
  // `families` conjoins, so appending keeps every filter the caller asked for (f-a4ibml4h).
  return dimension.getEntities({ ...options, families: [...(options?.families ?? []), family] })
}
