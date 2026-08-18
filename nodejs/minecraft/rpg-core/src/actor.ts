/**
 * The spawn, lookup, and removal surface.
 *
 * Every actor is reached through `@twin-digital/mc-pack-runtime`'s checked calls, so an entity
 * answering under one of this product's identifiers without this pack's own type family raises
 * `ForeignEntityError` rather than being acted on (d-q9fkyuqx). Nothing here checks an actor's
 * definitions or its appearance, and a call that returns says nothing about whether the actor
 * will render (d-xiswv8vb).
 */

import { world, type Dimension, type Entity, type Vector3 } from '@minecraft/server'
import { getEntity, packId, packNamespace, spawnEntity } from '@twin-digital/mc-pack-runtime'

import { PRESET_NAMES, PRESETS, type ActorPreset, type PresetName } from './presets.js'

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
   * A durable name of the adventure's own, holding no `:`. Spawning again under a durable name
   * already in the world returns the actor already there rather than a second one, and
   * {@link findActor} resolves it in a later session.
   */
  readonly id?: string
}

/** What a spawn call gives an adventure back: the actor, and what it may do to it afterwards. */
export interface ActorHandle {
  /** The preset this actor was spawned from. */
  readonly preset: PresetName
  /** The actor's entity identifier, as this adventure's build spells it. */
  readonly entityId: string
  /** The durable name the actor was created under, if any. */
  readonly id?: string
  /** The underlying entity, for whatever the adventure does beyond this surface. */
  readonly entity: Entity
  /** Removes the actor from the world, and releases its durable name if it holds one. */
  remove(): void
}

/**
 * The world dynamic property a durable name is carried by (d-85wcszy4). Internal — exported for
 * the package's own tests, unreachable from outside the package.
 */
export const actorPropertyKey = (id: string): string => {
  if (id.includes(':')) {
    throw new TypeError(`a durable name holds no ':', and '${id}' does`)
  }
  const namespace = packNamespace()
  if (namespace === undefined) {
    throw new Error(
      `a durable name is keyed on the adventure's namespace, and this pack was built with namespacing off`,
    )
  }
  return `${namespace}:rpg-core.actor.${id}`
}

/** What the property holds, as JSON: the bare preset name and the entity's runtime id. */
interface ActorRecord {
  readonly preset: string
  readonly entity: string
}

const isActorRecord = (value: unknown): value is ActorRecord =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ActorRecord).preset === 'string' &&
  typeof (value as ActorRecord).entity === 'string'

/** The stored record for a durable name, or undefined where none (or an unreadable one) exists. */
const readActorRecord = (id: string): ActorRecord | undefined => {
  const stored = world.getDynamicProperty(actorPropertyKey(id))
  if (typeof stored !== 'string') {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(stored)
    if (!isActorRecord(parsed) || !(parsed.preset in PRESETS)) {
      return undefined
    }
    return parsed
  } catch {
    return undefined
  }
}

const createHandle = (preset: PresetName, entity: Entity, id?: string): ActorHandle => ({
  preset,
  entityId: packId(preset),
  id,
  entity,
  remove: () => {
    entity.remove()
    if (id !== undefined) {
      world.setDynamicProperty(actorPropertyKey(id))
    }
  },
})

/**
 * Resolves the actor a durable record names, or `undefined` where the record is stale.
 *
 * @throws {ForeignEntityError} when the record's entity lacks this pack's own type family.
 */
const resolveRecord = (record: ActorRecord, id: string): ActorHandle | undefined => {
  const entity = getEntity(record.entity)
  if (!entity?.isValid) {
    return undefined
  }
  return createHandle(record.preset as PresetName, entity, id)
}

/**
 * Spawns an actor by naming a preset, applying the preset's default name unless `options.name`
 * overrides it.
 *
 * Under a durable name the world already holds, the record resolves before anything else
 * (d-w4m10236): where it still resolves and carries this pack's family the call returns that
 * actor unchanged — a display-name override is not applied; where it resolves but lacks the
 * family the call raises `ForeignEntityError` and the record stands; otherwise the record is
 * stale, a fresh actor is spawned, and the record is overwritten.
 *
 * @throws {ForeignEntityError} when an entity answering this preset's identifier is not this
 *   pack's own.
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
  const definition = PRESETS[preset] as ActorPreset | undefined
  if (definition === undefined) {
    throw new TypeError(`Unknown preset '${preset}'. Known presets: ${PRESET_NAMES.join(', ')}.`)
  }
  const id = options?.id
  if (id !== undefined) {
    const record = readActorRecord(id)
    const existing = record === undefined ? undefined : resolveRecord(record, id)
    if (existing !== undefined) {
      return existing
    }
  }
  const entity = spawnEntity(place.dimension, packId(preset), place.location)
  entity.nameTag = options?.name ?? definition.defaultName
  if (id !== undefined) {
    const record: ActorRecord = { preset, entity: entity.id }
    world.setDynamicProperty(actorPropertyKey(id), JSON.stringify(record))
  }
  return createHandle(preset, entity, id)
}

/**
 * Resolves a handle to the actor spawned under a durable name, in this session or a later one.
 * Returns `undefined` where no record holds the name — with no lookup made, there being no actor
 * to act on (d-f7o3vg4n) — and where the record's actor no longer exists, the stale record left
 * in place until a spawn under the name overwrites it.
 *
 * @throws {ForeignEntityError} when the record's entity lacks this pack's own type family.
 */
export const findActor = (id: string): ActorHandle | undefined => {
  const record = readActorRecord(id)
  return record === undefined ? undefined : resolveRecord(record, id)
}
