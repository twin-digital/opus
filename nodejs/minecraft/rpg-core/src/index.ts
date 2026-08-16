/**
 * `@twin-digital/rpg-core` — what an adventure imports to spawn and use actors.
 *
 * ```ts
 * import { spawnActor } from '@twin-digital/rpg-core'
 *
 * const wizard = spawnActor('wizard', { dimension, location }, { id: 'tower-wizard' })
 * ```
 *
 * The preset registry here is also what the assets pack builds its entity definitions from; at
 * run time neither package reads the other.
 */

export { NAMESPACE, PACK_NAME, PRESET_NAMES, PRESETS, type ActorPreset, type PresetName } from './registry.js'
export { ActorDefinitionsMissingError } from './errors.js'
export { findActor, spawnActor, type ActorHandle, type ActorPlace, type SpawnActorOptions } from './actor.js'
