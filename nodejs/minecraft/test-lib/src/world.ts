/**
 * The world and its dimensions: dimension registration and `getDimension` resolution, and the
 * entity registry behind `world.getEntity`, `world.getAllPlayers`, `world.getPlayers`,
 * `dimension.getEntities` and `dimension.getPlayers`.
 *
 * A new world has no dimensions at all — `withVanillaDimensions` is what puts the three vanilla
 * ones on it — so `getDimension` throws for every id until a preset or a test registers one.
 */

import type * as minecraftcommon from '@minecraft/common'
import type * as MC from '@minecraft/server'

import { assertQueryHonoured, matchesQuery } from './query.js'
import { construct } from './runtime/construct.js'
import { registerBehaviour } from './runtime/member.js'
import { dataOf, serverOf, type DimensionData, type EntityData, type ServerState } from './runtime/state.js'

/** The state behind the world fake: its bundle, its signal containers and its scoreboard. */
export interface WorldData {
  readonly server: ServerState
  readonly afterEvents: MC.WorldAfterEvents
  readonly beforeEvents: MC.WorldBeforeEvents
  readonly scoreboard: MC.Scoreboard
}

/**
 * Every entity still registered with the world, in creation order. Registration, not validity, is
 * what this filters on: `invalidate()` models a reference gone stale on an entity that is *still in
 * the world*, so a stale one is listed here and throws from the members a query happens to read.
 */
export const registeredEntities = (server: ServerState): EntityData[] =>
  server.entities.filter((entity) => entity.registered)

/** The entities a lookup answers with, filtered by the part of `EntityQueryOptions` it honours. */
export const lookupEntities = (
  server: ServerState,
  options: MC.EntityQueryOptions | undefined,
  where: (entity: EntityData) => boolean,
): MC.Entity[] => {
  // Ahead of the entities: a query that matched nothing still reports the filter it dropped.
  assertQueryHonoured(options)
  return registeredEntities(server)
    .filter((entity) => where(entity))
    .filter((entity) => matchesQuery(entity.entity, options))
    .map((entity) => entity.entity)
}

/** What a caller supplies to put a dimension on a world. */
export interface DimensionSpec {
  /** The canonical, prefixed id the dimension reports — `minecraft:overworld`. */
  readonly id: string
  /** Every id `world.getDimension` answers to for it, the canonical one included. */
  readonly aliases: readonly string[]
  readonly heightRange: minecraftcommon.NumberRange
  readonly localizationKey: string
}

/**
 * Registers a dimension on a world under every id it answers to. Presets use this; nothing in the
 * library registers a dimension unasked.
 */
export const registerDimension = (server: ServerState, spec: DimensionSpec): MC.Dimension => {
  const dimension = construct('Dimension', {
    data: {
      server,
      id: spec.id,
      heightRange: spec.heightRange,
      localizationKey: spec.localizationKey,
    } satisfies DimensionData,
  }) as MC.Dimension
  for (const alias of spec.aliases) {
    server.dimensions.set(alias, dimension)
  }
  return dimension
}

registerBehaviour('World', {
  afterEvents: (fake: object) => dataOf<WorldData>(fake).afterEvents,
  beforeEvents: (fake: object) => dataOf<WorldData>(fake).beforeEvents,
  scoreboard: (fake: object) => dataOf<WorldData>(fake).scoreboard,

  getDimension: (fake: object, dimensionId: string) => {
    const dimension = serverOf(fake).dimensions.get(dimensionId)
    if (!dimension) {
      throw new Error(`Dimension '${dimensionId}' is invalid.`)
    }
    return dimension
  },

  getEntity: (fake: object, id: string) =>
    registeredEntities(serverOf(fake)).find((entity) => entity.id === id)?.entity,

  getAllPlayers: (fake: object) =>
    registeredEntities(serverOf(fake))
      .filter((entity) => entity.isPlayer)
      .map((entity) => entity.entity),

  getPlayers: (fake: object, options?: MC.EntityQueryOptions) =>
    lookupEntities(serverOf(fake), options, (entity) => entity.isPlayer),
})

registerBehaviour('Dimension', {
  id: (fake: object) => dataOf<DimensionData>(fake).id,
  heightRange: (fake: object) => dataOf<DimensionData>(fake).heightRange,
  localizationKey: (fake: object) => dataOf<DimensionData>(fake).localizationKey,

  getEntities: (fake: object, options?: MC.EntityQueryOptions) => {
    const { server } = dataOf<DimensionData>(fake)
    return lookupEntities(server, options, (entity) => entity.dimension === fake)
  },

  getPlayers: (fake: object, options?: MC.EntityQueryOptions) => {
    const { server } = dataOf<DimensionData>(fake)
    return lookupEntities(server, options, (entity) => entity.isPlayer && entity.dimension === fake)
  },
})
