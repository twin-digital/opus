/**
 * `@twin-digital/rpg-core` — what an adventure imports to spawn and use actors.
 *
 * ```ts
 * import { spawnActor } from '@twin-digital/rpg-core'
 *
 * const wizard = spawnActor('wizard', { dimension, location }, { id: 'tower-wizard' })
 * ```
 *
 * The actor content — the entity definitions and everything they render from — is the
 * `vendored_pack/` tree of this same package, which the adventure's own build merges into its
 * behavior and resource packs. An actor's identifier is the adventure's, composed at call time.
 */

export { PRESET_NAMES, PRESETS, type ActorPreset, type PresetName } from './presets.js'
export { findActor, spawnActor, type ActorHandle, type ActorPlace, type SpawnActorOptions } from './actor.js'
export { ForeignEntityError } from '@twin-digital/mc-pack-runtime'
