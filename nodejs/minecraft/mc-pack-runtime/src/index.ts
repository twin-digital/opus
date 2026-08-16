/**
 * `@twin-digital/mc-pack-runtime` — the dev kit's engine-side half: code the kit's build bundles
 * into a pack's own script bundle, running on the Bedrock script engine.
 *
 * A pack takes it as an ordinary dependency. In a namespaced pack the build injects the pack's
 * namespace and token ahead of every module, and everything here reads that injection with
 * nothing passed per call:
 *
 * ```ts
 * import { packId, spawnEntity } from '@twin-digital/mc-pack-runtime'
 * import { world } from '@minecraft/server'
 *
 * const overworld = world.getDimension('overworld')
 * const wizard = spawnEntity(overworld, packId('wizard'), { x: 0, y: 64, z: 0 })
 * ```
 */

export { getEntities, getEntity, spawnEntity, ForeignEntityError } from './checked.js'
export { foreignNamespaceClaims, type NamespaceClaim } from './claims.js'
export { packFamily, packId, packNamespace } from './identifier.js'
