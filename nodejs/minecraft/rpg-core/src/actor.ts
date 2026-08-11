/**
 * The spawn, lookup, and removal surface. Every call acting on an actor first checks that the
 * entity type its preset names is registered in the world, and throws
 * `ActorDefinitionsMissingError` when it is not — no call half-succeeds.
 */

import { world, type Dimension, type Entity, type Vector3 } from '@minecraft/server'

import { requireDefinitions } from './catalog.js'
import { NAMESPACE, PRESET_NAMES, PRESETS, type PresetName } from './registry.js'

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
 * The world dynamic property a durable name is carried by. Internal — exported for the package's
 * own tests, unreachable from outside.
 */
export const actorPropertyKey = (id: string): string => `${NAMESPACE}:actor.${id}`

/** What the property holds, as JSON: enough to check and resolve without touching the entity. */
interface ActorRecord {
  readonly preset: string
  readonly typeId: string
  readonly entity: string
}

const isActorRecord = (value: unknown): value is ActorRecord =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ActorRecord).preset === 'string' &&
  typeof (value as ActorRecord).typeId === 'string' &&
  typeof (value as ActorRecord).entity === 'string'

/** The stored record for a durable name, or undefined where none (or an unreadable one) exists. */
const readActorRecord = (id: string): ActorRecord | undefined => {
  const stored = world.getDynamicProperty(actorPropertyKey(id))
  if (typeof stored !== 'string') {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(stored)
    return isActorRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

const createHandle = (preset: PresetName, typeId: string, entity: Entity, id?: string): ActorHandle => ({
  preset,
  entityId: typeId,
  id,
  entity,
  remove: () => {
    requireDefinitions(preset, typeId)
    entity.remove()
    if (id !== undefined) {
      world.setDynamicProperty(actorPropertyKey(id))
    }
  },
})

/**
 * Spawns an actor by naming a preset. Applies the preset's default name unless `options.name`
 * overrides it. Spawning under a durable name already in the world returns the actor already
 * there — nothing about it, its name included, is changed.
 *
 * Call after the world has loaded (`world.afterEvents.worldLoad`): the definitions check reads
 * the entity-type catalog, which the engine refuses during early execution — that refusal
 * propagates untranslated.
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
  const definition = PRESETS[preset] as (typeof PRESETS)[PresetName] | undefined
  if (definition === undefined) {
    throw new TypeError(`Unknown preset '${preset}'. Known presets: ${PRESET_NAMES.join(', ')}.`)
  }
  requireDefinitions(preset, definition.entityId)
  if (options?.id !== undefined) {
    const existing = findActor(options.id)
    if (existing !== undefined) {
      return existing
    }
  }
  const entity = place.dimension.spawnEntity(definition.entityId, place.location)
  entity.nameTag = options?.name ?? definition.defaultName
  if (options?.id !== undefined) {
    const record: ActorRecord = { preset, typeId: definition.entityId, entity: entity.id }
    world.setDynamicProperty(actorPropertyKey(options.id), JSON.stringify(record))
  }
  return createHandle(preset, definition.entityId, entity, options?.id)
}

/**
 * Resolves a handle to the actor spawned under a durable name, in this session or a later one.
 * Returns undefined when no actor holds the name — with no definitions check made, since there is
 * no actor to act on. A record whose actor no longer exists resolves to undefined, and the stale
 * record is left in place until a spawn under the name overwrites it.
 *
 * @throws {ActorDefinitionsMissingError} when the named actor's entity type is not registered.
 */
export const findActor = (id: string): ActorHandle | undefined => {
  const record = readActorRecord(id)
  if (record === undefined) {
    return undefined
  }
  requireDefinitions(record.preset, record.typeId)
  const entity = world.getEntity(record.entity)
  if (!entity?.isValid) {
    return undefined
  }
  return createHandle(record.preset as PresetName, record.typeId, entity, id)
}
