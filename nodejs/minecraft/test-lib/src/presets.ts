/**
 * Populated starting points a caller invokes explicitly. A preset supplies only values a source
 * pins, and presets compose; neither invents per-type vanilla data, which belongs to a package
 * built on this one.
 */

import type * as MC from '@minecraft/server'

import type { ServerLike } from './create-server.js'
import { entityDataOf, serverOf } from './runtime/state.js'
import { registerDimension, type DimensionSpec } from './world.js'

/** The three vanilla dimensions as the engine reports them, ids, aliases and all. */
const VANILLA_DIMENSIONS: readonly DimensionSpec[] = [
  {
    id: 'minecraft:overworld',
    aliases: ['overworld', 'minecraft:overworld'],
    heightRange: { min: -64, max: 320 },
    localizationKey: 'dimension.dimensionName0',
  },
  {
    id: 'minecraft:nether',
    aliases: ['nether', 'minecraft:nether'],
    heightRange: { min: 0, max: 128 },
    localizationKey: 'dimension.dimensionName1',
  },
  {
    id: 'minecraft:the_end',
    // The engine answers to the spaced alias on this one as well as the underscored id.
    aliases: ['the_end', 'minecraft:the_end', 'the end'],
    heightRange: { min: 0, max: 256 },
    localizationKey: 'dimension.dimensionName2',
  },
]

/**
 * Adds the three vanilla dimensions. `world.getDimension` then resolves `overworld`, `nether` and
 * `the_end`, their `minecraft:`-prefixed forms and the spaced alias `"the end"`, each returning a
 * dimension whose `id` is the prefixed form, with the observed height ranges and localization keys.
 */
export const withVanillaDimensions = (server: ServerLike): void => {
  const state = serverOf(server.world)
  for (const dimension of VANILLA_DIMENSIONS) {
    registerDimension(state, dimension)
  }
}

/**
 * Supplies the spawn frame: `nameTag` the empty string, `getRotation()` `{x: 0, y: 0}` and
 * `getVelocity()` `{x: 0, y: 0, z: 0}`, on every entity type, leaving alone whatever the caller
 * already supplied so that presets compose.
 *
 * Those zeros are the observed spawn frame of seven of the eight types sampled;
 * `minecraft:xp_orb` spawns with a randomized rotation and a nonzero randomized velocity, which
 * this preset simplifies past rather than modelling a per-type draw.
 */
export const asSpawnedEntity = (entity: MC.Entity): void => {
  const data = entityDataOf(entity)
  data.nameTag ??= ''
  data.rotation ??= { x: 0, y: 0 }
  data.velocity ??= { x: 0, y: 0, z: 0 }
}
