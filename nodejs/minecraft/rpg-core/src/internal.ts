/**
 * The machinery behind the public calls, with the definitions check and the world as parameters.
 * Internal: `index.ts` does not export it, and the package's exports map makes it unreachable
 * from outside.
 */

import type { Entity, World } from '@minecraft/server'

import type { ActorHandle, ActorPlace, SpawnActorOptions } from './actor.js'
import type { EnsureDefinitions } from './catalog.js'
import { NAMESPACE, PRESET_NAMES, PRESETS, type PresetName } from './registry.js'

/** The world dynamic property a durable name is carried by. */
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
const readActorRecord = (world: World, id: string): ActorRecord | undefined => {
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

const createHandle = (
  ensure: EnsureDefinitions,
  world: World,
  preset: PresetName,
  typeId: string,
  entity: Entity,
  id?: string,
): ActorHandle => ({
  preset,
  entityId: typeId,
  id,
  entity,
  remove: () => {
    ensure(preset, typeId)
    entity.remove()
    if (id !== undefined) {
      world.setDynamicProperty(actorPropertyKey(id))
    }
  },
})

/**
 * `spawnActor`, given its check and world. Checks first; resolves an existing durable name to the
 * actor already there; otherwise spawns, names, and records.
 */
export const placeActor = (
  ensure: EnsureDefinitions,
  world: World,
  preset: PresetName,
  place: ActorPlace,
  options?: SpawnActorOptions,
): ActorHandle => {
  const definition = PRESETS[preset] as (typeof PRESETS)[PresetName] | undefined
  if (definition === undefined) {
    throw new TypeError(`Unknown preset '${preset}'. Known presets: ${PRESET_NAMES.join(', ')}.`)
  }
  ensure(preset, definition.entityId)
  if (options?.id !== undefined) {
    const existing = resolveActor(ensure, world, options.id)
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
  return createHandle(ensure, world, preset, definition.entityId, entity, options?.id)
}

/**
 * `findActor`, given its check and world. An absent durable name is undefined with no check made —
 * there is no actor to act on. A present one is checked before the entity is touched; a record
 * whose entity no longer exists resolves to undefined, and the stale record is left in place.
 */
export const resolveActor = (ensure: EnsureDefinitions, world: World, id: string): ActorHandle | undefined => {
  const record = readActorRecord(world, id)
  if (record === undefined) {
    return undefined
  }
  ensure(record.preset, record.typeId)
  const entity = world.getEntity(record.entity)
  if (!entity?.isValid) {
    return undefined
  }
  return createHandle(ensure, world, record.preset as PresetName, record.typeId, entity, id)
}
