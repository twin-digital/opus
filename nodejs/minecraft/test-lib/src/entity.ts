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
import { InvalidArgumentError, NotImplementedError, UnsetValueError } from './errors.js'
import { deliver, dispatchAfter } from './events.js'
import { canonicalId } from './ids.js'
import { matchesQuery } from './query.js'
import { construct } from './runtime/construct.js'
import { isValidFake, registerBehaviour, stateOf, type ClassBehaviour } from './runtime/member.js'
import {
  dataOf,
  entityDataOf,
  serverOf,
  type DimensionData,
  type EntityData,
  type ServerState,
} from './runtime/state.js'

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

/** The type a player carries when the caller names none. */
const PLAYER_TYPE_ID = 'minecraft:player'

/**
 * The next unused id: a decimal string issued sequentially from `1`, stepping over any id a caller
 * supplied, since the engine reissues none either.
 */
const assignId = (server: ServerState): string => {
  const taken = new Set(server.entities.map((entity) => entity.id))
  while (taken.has(String(server.nextEntityId))) {
    server.nextEntityId += 1
  }
  const id = String(server.nextEntityId)
  server.nextEntityId += 1
  return id
}

/** Builds an entity or player fake, registers it with the world, and hands back its state. */
const create = (server: ServerState, options: PlayerOptions, isPlayer: boolean): EntityData => {
  if (options.id !== undefined && server.entities.some((entity) => entity.id === options.id)) {
    throw new InvalidArgumentError(
      `Invalid value passed to argument [1]. An entity with id ${options.id} is already registered with this world.`,
    )
  }
  const data: EntityData = {
    server,
    // Filled the moment the fake exists: the state and the fake each need the other.
    entity: undefined as unknown as MC.Entity,
    typeId: canonicalId(options.typeId ?? PLAYER_TYPE_ID),
    id: options.id ?? assignId(server),
    isPlayer,
    dimension: options.dimension,
    location: options.location,
    name: options.name,
    tags: new Set(),
    components: new Map(),
    effects: new Map(),
    dynamicProperties: new Map(),
    triggeredEvents: [],
    output: [],
    registered: true,
  }
  const entity = construct(isPlayer ? 'Player' : 'Entity', {
    data,
    own: { typeId: data.typeId, id: data.id },
  }) as MC.Entity
  ;(data as { entity: MC.Entity }).entity = entity
  server.entities.push(data)
  return data
}

/**
 * A fake entity registered with that bundle's world. An id the caller does not supply is assigned:
 * a decimal string issued sequentially from `1` and never reissued, since in the engine the spawner
 * never chooses it either.
 */
export const createEntity = (server: ServerLike, options: EntityOptions): MC.Entity =>
  create(serverOf(server.world), options, false).entity

/**
 * A fake player, registered like any entity. `name` is worth supplying: `Player.name` is declared a
 * bare `string`, so every read of it on a player created without one throws `UnsetValueError`.
 */
export const createPlayer = (server: ServerLike, options: PlayerOptions = {}): MC.Player =>
  create(serverOf(server.world), options, true).entity as MC.Player

/**
 * Puts a reference into the state the real API leaves a stale one in, at any point in a test —
 * including on a reference a handler is holding mid-event. Distinct from `remove()`, which
 * invalidates as part of removing: this reaches the entity that goes stale without leaving the
 * world, and the corpse a `kill()` left valid. The entity stays registered, so the world and
 * dimension lookups still list it — that staleness-in-place is the whole of what this models.
 */
export const invalidate = (entity: MC.Entity): void => {
  stateOf(entity).valid = false
}

/**
 * The `kill()` path for an entity carrying no health component: it fires `entityDie` with cause
 * `selfDestruct` and nothing else, and leaves the reference valid and registered. `kill` itself is
 * registered by the component model, which branches here when no health component is attached.
 */
export const killWithoutHealth = (entity: MC.Entity): void => {
  const { server } = entityDataOf(entity)
  dispatchAfter(server, 'entityDie', {
    deadEntity: entity,
    damageSource: { cause: 'selfDestruct' as MC.EntityDamageCause },
  })
}

/** The `triggerEvent` calls made on an entity, in order. */
export const getTriggeredEvents = (entity: MC.Entity): readonly string[] => [...entityDataOf(entity).triggeredEvents]

// ---------------------------------------------------------------------------
// Behaviour
// ---------------------------------------------------------------------------

/** A field the engine could not lack: unset until supplied, and a read of one then throws. */
const supplied = <K extends keyof EntityData>(fake: object, field: K, member: string): NonNullable<EntityData[K]> => {
  const value = dataOf<EntityData>(fake)[field]
  if (value === undefined) {
    throw new UnsetValueError(member)
  }
  return value
}

/** Every modelled `Entity` member; `Player` carries the same set plus its own. */
const entityBehaviour: ClassBehaviour = {
  isValid: (fake: object) => isValidFake(stateOf(fake)),

  dimension: (fake: object) => supplied(fake, 'dimension', 'Entity.dimension'),
  location: (fake: object) => supplied(fake, 'location', 'Entity.location'),
  nameTag: (fake: object) => supplied(fake, 'nameTag', 'Entity.nameTag'),
  'nameTag=': (fake: object, value: string) => {
    dataOf<EntityData>(fake).nameTag = value
  },
  getRotation: (fake: object) => supplied(fake, 'rotation', 'Entity.getRotation'),
  getVelocity: (fake: object) => supplied(fake, 'velocity', 'Entity.getVelocity'),

  addTag: (fake: object, tag: string) => {
    const { tags } = dataOf<EntityData>(fake)
    if (tags.has(tag)) {
      return false
    }
    tags.add(tag)
    return true
  },
  removeTag: (fake: object, tag: string) => dataOf<EntityData>(fake).tags.delete(tag),
  hasTag: (fake: object, tag: string) => dataOf<EntityData>(fake).tags.has(tag),
  getTags: (fake: object) => [...dataOf<EntityData>(fake).tags],

  matches: (fake: object, options: MC.EntityQueryOptions) => matchesQuery(fake as MC.Entity, options),

  triggerEvent: (fake: object, eventName: string) => {
    const data = dataOf<EntityData>(fake)
    // The one surface the engine looks up literally: a bare id names no event at all.
    if (!eventName.includes(':')) {
      throw new InvalidArgumentError(
        `Invalid value passed to argument [0]. The event ${eventName} does not exist on ${data.typeId}`,
      )
    }
    data.triggeredEvents.push(eventName)
    return undefined
  },

  remove: (fake: object) => {
    const data = dataOf<EntityData>(fake)
    // A notification: EntityRemoveBeforeEvent declares no cancel, so a handler gets no hold on it.
    deliver(data.server, 'world.beforeEvents', 'entityRemove', { removedEntity: data.entity })
    // Detached and invalidated as one act: no handler can observe one without the other.
    data.registered = false
    stateOf(fake).valid = false
    dispatchAfter(data.server, 'entityRemove', { removedEntityId: data.id, typeId: data.typeId })
  },
}

registerBehaviour('Entity', entityBehaviour)

registerBehaviour('Player', {
  ...entityBehaviour,
  name: (fake: object) => supplied(fake, 'name', 'Player.name'),
})

registerBehaviour('Dimension', {
  spawnEntity: (fake: object, identifier: MC.EntityType | string, location: MC.Vector3, options?: unknown) => {
    if (typeof identifier !== 'string') {
      throw new NotImplementedError('Dimension.spawnEntity(EntityType)')
    }
    if (options !== undefined) {
      throw new NotImplementedError('Dimension.spawnEntity(options)')
    }
    const { server } = dataOf<DimensionData>(fake)
    const { entity } = create(server, { typeId: identifier, dimension: fake as MC.Dimension, location }, false)
    dispatchAfter(server, 'entitySpawn', { entity, cause: 'Spawned' as MC.EntityInitializationCause })
    return entity
  },
})
