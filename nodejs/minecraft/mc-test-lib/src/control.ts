/**
 * The control plane: free functions over the fakes for everything the real surface cannot
 * express — constructing worlds and entities, reshaping components on a live entity,
 * unloading, and firing events from the engine's side. The fakes themselves carry only real
 * members, so nothing on them competes with the genuine access path.
 */
import type { Entity, Vector3, World } from '@minecraft/server'

import { FakeEntity, getEntityInternals } from './entity.js'
import { dispatchEvent, FakeEventSignal, FakeWorldAfterEvents } from './events.js'
import type { AttributeComponentId } from './ids.js'
import { canonicalizeId } from './ids.js'
import type { AttributeState, WorldStore } from './internal/store.js'
import { invalidateRecord } from './internal/store.js'
import { FakeDimension, FakeWorld, getWorldStore, VANILLA_DIMENSION_IDS } from './world.js'

/**
 * Full value set of one attribute-shaped component in a spawn spec: current, default, min,
 * and max. Every field is required — no bound is derived from another — so the state a test
 * runs against is exactly the state it wrote down.
 */
export interface AttributeComponentSpec {
  current: number
  default: number
  min: number
  max: number
}

/**
 * What `spawnFake` stages. A factory adds nothing the caller did not specify: omitted
 * `components` means a bare entity, and omitted `location`/`dimension` mean those reads throw
 * `NotImplementedError` until a test that needs them stages them.
 *
 * Component keys accept the bare or the `minecraft:`-prefixed form of the attribute-shaped
 * ids — the only components whose presence the fakes can model; supplying the same component
 * under both forms is a staging error and throws. Presence of anything else is inexpressible
 * by design, while absence reads back exactly as the engine reports it.
 */
export interface EntitySpawnSpec {
  /** Entity type id, bare or prefixed; required — the spawner never invents a type. */
  typeId: string
  /** Unique id override. Defaults to a fresh opaque id — in the engine, too, the spawner never chooses it. */
  id?: string
  /** Given name; defaults to `''`, exactly as the engine reports an unnamed entity. */
  nameTag?: string
  /** Staged location for `entity.location`. */
  location?: Vector3
  /** Dimension id, bare or prefixed; the entity joins that dimension's entity set. */
  dimension?: string
  /** Attribute-shaped components to stage, keyed by component id. */
  components?: Partial<Record<AttributeComponentId, AttributeComponentSpec>>
}

/**
 * A reusable starting point a test opts into by explicit merge:
 * `spawnFake(world, { ...livingMob, typeId: 'minecraft:villager_v2' })`. Bases are plain
 * data — composable by spread — and a factory never applies one unasked.
 */
export type EntitySpawnBase = Omit<EntitySpawnSpec, 'typeId'>

/**
 * The subscribe surface `emit` needs from a signal; every fake signal satisfies it, and the
 * event type parameter gives `emit` its payload type.
 */
export interface EmittableSignal<TEvent> {
  subscribe(callback: (event: TEvent) => void): (event: TEvent) => void
}

/**
 * Creates a world: the instance all fake state hangs off. It carries the three vanilla
 * dimensions — a world without them is not a state the engine can exhibit — and starts
 * otherwise empty. Isolation between tests is object lifetime: make a new world per test.
 */
export const createWorld = (): World => {
  const store: WorldStore = {
    entities: new Map(),
    dimensions: new Map(),
    afterEvents: new FakeWorldAfterEvents(),
    nextEntityOrdinal: 0,
    usedIds: new Set(),
  }
  for (const dimensionId of VANILLA_DIMENSION_IDS) {
    store.dimensions.set(dimensionId, new FakeDimension(store, dimensionId))
  }
  return new FakeWorld(store)
}

/**
 * Spawns a fake entity into `world` with exactly the state named in `spec` — see
 * {@link EntitySpawnSpec} for what staging means. Returns the `Entity` handle, typed as the
 * real class so it passes anywhere the real type is expected.
 *
 * Staging errors — a duplicate entity id, an unknown dimension, or the same component in
 * both id forms — throw a `TypeError` immediately rather than producing a world the engine
 * could not exhibit.
 */
export const spawnFake = (world: World, spec: EntitySpawnSpec): Entity => {
  const store = getWorldStore(world)

  let id: string
  if (spec.id === undefined) {
    do {
      id = String(-4294967296 - store.nextEntityOrdinal++)
    } while (store.usedIds.has(id))
  } else {
    id = spec.id
  }
  if (store.entities.has(id)) {
    throw new TypeError(`spawnFake: an entity with id '${id}' already exists`)
  }
  store.usedIds.add(id)

  let dimensionId: string | undefined
  if (spec.dimension !== undefined) {
    dimensionId = canonicalizeId(spec.dimension)
    if (!store.dimensions.has(dimensionId)) {
      throw new TypeError(`spawnFake: '${spec.dimension}' is not a vanilla dimension`)
    }
  }

  const components = new Map<string, AttributeState>()
  for (const [componentId, attributes] of Object.entries(spec.components ?? {})) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Partial values are undefined-bearing at runtime (e.g. a conditional override in a base spread); without this check an empty AttributeState would be staged
    if (attributes === undefined) {
      continue
    }
    const canonicalId = canonicalizeId(componentId)
    if (components.has(canonicalId)) {
      throw new TypeError(`spawnFake: component '${canonicalId}' staged under both id forms`)
    }
    components.set(canonicalId, { ...attributes })
  }

  const entity = new FakeEntity(store, {
    id,
    typeId: canonicalizeId(spec.typeId),
    nameTag: spec.nameTag ?? '',
    location: spec.location === undefined ? undefined : { ...spec.location },
    dimensionId,
    tags: new Set(),
    components,
    effects: new Map(),
    valid: true,
  })
  store.entities.set(id, getEntityInternals(entity).record)
  return entity
}

/**
 * Stages an attribute-shaped component on a live entity. The real API reshapes components
 * only through data-driven paths the fakes do not model, so this lives on the control plane.
 * Replaces the component's state when it is already present; the handle is read back through
 * the genuine path, `entity.getComponent(componentId)`.
 */
export const addComponent = (entity: Entity, componentId: AttributeComponentId, spec: AttributeComponentSpec): void => {
  const { record } = getEntityInternals(entity)
  record.components.set(canonicalizeId(componentId), { ...spec })
}

/**
 * Removes a staged component from a live entity. A component the entity lacks is a no-op —
 * absence is already the answerable state. Surviving component handles turn invalid.
 */
export const removeComponent = (entity: Entity, componentId: AttributeComponentId): void => {
  const { record } = getEntityInternals(entity)
  record.components.delete(canonicalizeId(componentId))
}

/**
 * Unloads an entity from the engine's side: the record is removed, `world.getEntity` stops
 * returning it, it leaves its dimension's entity set, and every handle a test already holds
 * survives to throw per its member's guard — the same stale-reference shape the real API
 * leaves, produced mid-test. Fires nothing; already-invalid entities are a no-op.
 */
export const invalidate = (entity: Entity): void => {
  const { store, record } = getEntityInternals(entity)
  if (!record.valid) {
    return
  }
  invalidateRecord(store, record)
}

/**
 * Delivers `event` to `signal`'s subscribers and mutates nothing — the escape hatch for
 * cascades whose engine-side cause lies outside the faked surface. The payload is typed from
 * the signal's handler parameter, so every signal's emit is fully typed without per-signal
 * helpers:
 *
 * ```typescript
 * emit(world.afterEvents.entityHurt, {
 *   damage: 4,
 *   damageSource: { cause: EntityDamageCause.entityAttack },
 *   hurtEntity,
 * })
 * ```
 *
 * Because emit does not mutate, it can deliver to an entity the same staged hit has already
 * invalidated — the handler-under-test then sees the event exactly as the engine would hand
 * it a stale reference. Throws a `TypeError` if `signal` is not one of this library's fakes.
 */
export const emit = <TEvent>(signal: EmittableSignal<TEvent>, event: TEvent): void => {
  if (!(signal instanceof FakeEventSignal)) {
    throw new TypeError('emit: expected an event signal from a world created by this library')
  }
  dispatchEvent(signal as FakeEventSignal<TEvent>, event)
}
