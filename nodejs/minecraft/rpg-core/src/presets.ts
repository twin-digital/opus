/**
 * The preset catalogue: the names an adventure spawns by, and each preset's own description.
 *
 * No entity identifier lives here. An actor's identifier is `<adventure-namespace>:<prefix>.<preset>`,
 * composed at call time by the adventure's build (d-dpeizvxw, d-d4yzvu0o).
 */

/** The name of a preset an adventure spawns an actor by. */
export type PresetName = 'wizard'

/** One preset: what an adventure may read about a kind of actor, and pass back to `spawnActor`. */
export interface ActorPreset {
  /** The name an adventure spawns this preset by. */
  readonly preset: PresetName
  /** The name applied to the actor as it is created, unless the spawn call overrides it. */
  readonly defaultName: string
}

/** Every preset the product offers, keyed by preset name. */
export const PRESETS: Readonly<Record<PresetName, ActorPreset>> = {
  wizard: {
    preset: 'wizard',
    defaultName: 'Wizard',
  },
}

/** The preset names, in catalogue order. */
export const PRESET_NAMES: readonly PresetName[] = Object.keys(PRESETS) as PresetName[]
