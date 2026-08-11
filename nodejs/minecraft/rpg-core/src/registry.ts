/**
 * The preset registry: the one source both halves of the product read. The library resolves its
 * calls through these identifiers, and the assets pack builds its entity definitions from this
 * module at build time — the two cannot come to disagree.
 */

/**
 * The namespace every name the product declares carries. Bare token at the first major
 * (`rpg:wizard`); it carries the major after (`rpg2:wizard`).
 */
export const NAMESPACE = 'rpg'

/**
 * The display name of the behavior pack that supplies the actor entity definitions. The error a
 * missing definition raises names this pack, so an adventure's author knows what to install.
 */
export const PACK_NAME = 'RPG Core Actors'

/** The name of a preset an adventure spawns an actor by. */
export type PresetName = 'wizard'

/** One preset: a complete description of one kind of actor. */
export interface ActorPreset {
  /** The name an adventure spawns this preset by. */
  readonly preset: PresetName
  /** The entity identifier the assets pack registers for this preset. */
  readonly entityId: `${typeof NAMESPACE}:${PresetName}`
  /** The name applied to the actor as it is created, unless the spawn call overrides it. */
  readonly defaultName: string
}

/** Every preset the product offers, keyed by preset name. */
export const PRESETS: Readonly<Record<PresetName, ActorPreset>> = {
  wizard: {
    preset: 'wizard',
    entityId: `${NAMESPACE}:wizard`,
    defaultName: 'Wizard',
  },
}

/** The preset names, in registry order. */
export const PRESET_NAMES: readonly PresetName[] = Object.keys(PRESETS) as PresetName[]
