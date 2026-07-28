/**
 * Populated starting points a caller invokes explicitly. A preset supplies only values a source
 * pins, and presets compose; neither invents per-type vanilla data, which belongs to a package
 * built on this one.
 */

import type * as MC from '@minecraft/server'

import type { ServerLike } from './create-server.js'

/**
 * Adds the three vanilla dimensions. `world.getDimension` then resolves `overworld`, `nether` and
 * `the_end`, their `minecraft:`-prefixed forms and the spaced alias `"the end"`, each returning a
 * dimension whose `id` is the prefixed form, with the observed height ranges and localization keys.
 */
export const withVanillaDimensions = (_server: ServerLike): void => {
  throw new Error('the vanilla-dimensions preset is not built yet')
}

/**
 * Supplies the spawn frame: `nameTag` the empty string, `getRotation()` `{x: 0, y: 0}` and
 * `getVelocity()` `{x: 0, y: 0, z: 0}`, on every entity type. Those zeros are the observed spawn
 * frame of seven of the eight types sampled; `minecraft:xp_orb` spawns with a randomized rotation
 * and velocity, which this preset simplifies past rather than modelling a per-type draw.
 */
export const asSpawnedEntity = (_entity: MC.Entity): void => {
  throw new Error('the spawn-frame preset is not built yet')
}
