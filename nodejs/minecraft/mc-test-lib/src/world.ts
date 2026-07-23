/**
 * World and dimension fakes: the minimum surface needed to hold entities. A created world
 * carries the three vanilla dimensions and starts otherwise empty; it has no clock, and no
 * state outside its own store.
 */
import type { Dimension, Entity, EntityQueryOptions, World, WorldAfterEvents } from '@minecraft/server'

import { notYetImplemented } from './internal/not-yet.js'
import type { WorldStore } from './internal/store.js'
import type { Equals, Expect } from './internal/type-checks.js'

/** Canonical ids of the three vanilla dimensions every created world carries. */
export const VANILLA_DIMENSION_IDS = ['minecraft:overworld', 'minecraft:nether', 'minecraft:the_end'] as const

export const BUILT_WORLD_MEMBERS = ['afterEvents', 'getDimension', 'getEntity'] as const

type BuiltWorldKey = (typeof BUILT_WORLD_MEMBERS)[number]
type WorldStubKey = Exclude<keyof World, BuiltWorldKey>

/**
 * Every `World` member outside the first surface; accessing one throws `NotImplementedError`.
 * The `Expect<Equals<...>>` check fails the build if this list drifts from the declaration.
 */
export const WORLD_STUBS = [
  'beforeEvents',
  'clearDynamicProperties',
  'gameRules',
  'getAbsoluteTime',
  'getAimAssist',
  'getAllPlayers',
  'getDay',
  'getDefaultSpawnLocation',
  'getDifficulty',
  'getDynamicProperty',
  'getDynamicPropertyIds',
  'getDynamicPropertyTotalByteCount',
  'getLootTableManager',
  'getMoonPhase',
  'getPackSettings',
  'getPlayers',
  'getTimeOfDay',
  'isHardcore',
  'playMusic',
  'primitiveShapesManager',
  'queueMusic',
  'scoreboard',
  'seed',
  'sendMessage',
  'setAbsoluteTime',
  'setDefaultSpawnLocation',
  'setDifficulty',
  'setDynamicProperties',
  'setDynamicProperty',
  'setTimeOfDay',
  'stopMusic',
  'structureManager',
  'tickingAreaManager',
] as const

type _worldStubsExact = Expect<Equals<(typeof WORLD_STUBS)[number], WorldStubKey>>

/**
 * Fake of `World`. Vended by `createWorld`; never constructed by a test directly. All fake
 * state hangs off the world a test creates — isolation between tests is object lifetime, not
 * a reset hook.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- stub members are installed on the prototype from WORLD_STUBS, whose completeness the Expect<Equals<...>> check above enforces
export class FakeWorld {
  readonly #store: WorldStore

  constructor(store: WorldStore) {
    this.#store = store
    void this.#store
  }

  /**
   * The world's after-event signals: `entityHurt`, `entityHealthChanged`, and `entityDie` are
   * live; every other signal property throws `NotImplementedError`, as does `beforeEvents`.
   */
  get afterEvents(): WorldAfterEvents {
    return notYetImplemented()
  }

  /**
   * Returns the dimension for a vanilla dimension id — bare or prefixed, e.g. `'overworld'`
   * or `'minecraft:the_end'` — the same handle for the same dimension every time. Any other
   * id throws `NotImplementedError`: the real API documents a throw there but not its class,
   * and the fake does not guess.
   */
  getDimension(dimensionId: string): Dimension {
    void dimensionId
    return notYetImplemented()
  }

  /** Returns the live entity with the given id, or `undefined` — including once unloaded. */
  getEntity(id: string): Entity | undefined {
    void id
    return notYetImplemented()
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- see class comment; the interface half of the merge intentionally adds only inherited members
export interface FakeWorld extends Pick<World, WorldStubKey> {}

type _fakeWorldAssignable = Expect<FakeWorld extends World ? true : false>
type _fakeWorldNoExtraMembers = Expect<Equals<keyof FakeWorld, keyof World>>

export const BUILT_DIMENSION_MEMBERS = ['getEntities'] as const

type BuiltDimensionKey = (typeof BUILT_DIMENSION_MEMBERS)[number]
type DimensionStubKey = Exclude<keyof Dimension, BuiltDimensionKey>

/**
 * Every `Dimension` member outside the first surface — including `id`; a test that needs to
 * identify a dimension compares handles against `world.getDimension(...)`.
 */
export const DIMENSION_STUBS = [
  'containsBiomes',
  'containsBlock',
  'createExplosion',
  'fillBlocks',
  'getBiome',
  'getBlock',
  'getBlockAbove',
  'getBlockBelow',
  'getBlockFromRay',
  'getBlocks',
  'getEntitiesAtBlockLocation',
  'getEntitiesFromRay',
  'getLightLevel',
  'getPlayers',
  'getSkyLightLevel',
  'getTopmostBlock',
  'heightRange',
  'id',
  'isChunkLoaded',
  'localizationKey',
  'placeFeature',
  'placeFeatureRule',
  'playSound',
  'runCommand',
  'setBlockPermutation',
  'setBlockType',
  'setWeather',
  'spawnEntity',
  'spawnItem',
  'spawnParticle',
] as const

type _dimensionStubsExact = Expect<Equals<(typeof DIMENSION_STUBS)[number], DimensionStubKey>>

/**
 * Fake of `Dimension`. Vended by `world.getDimension`; never constructed by a test directly.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- stub members are installed on the prototype from DIMENSION_STUBS, whose completeness the Expect<Equals<...>> check above enforces
export class FakeDimension {
  readonly #store: WorldStore
  readonly #canonicalId: string

  constructor(store: WorldStore, canonicalId: string) {
    this.#store = store
    this.#canonicalId = canonicalId
    void this.#store
    void this.#canonicalId
  }

  /**
   * Returns the live entities whose spawn spec staged this dimension. Query options are not
   * modeled: any options argument — even `{}` — throws `NotImplementedError`; an explicit
   * `undefined` counts as absent.
   */
  getEntities(options?: EntityQueryOptions): Entity[] {
    void options
    return notYetImplemented()
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- see class comment; the interface half of the merge intentionally adds only inherited members
export interface FakeDimension extends Pick<Dimension, DimensionStubKey> {}

type _fakeDimensionAssignable = Expect<FakeDimension extends Dimension ? true : false>
type _fakeDimensionNoExtraMembers = Expect<Equals<keyof FakeDimension, keyof Dimension>>
