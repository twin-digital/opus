/**
 * Effects: `addEffect`, `getEffect`, `getEffects` and `removeEffect`, the amplifier-first
 * replacement rule, the display-name table with its computed numeral, and the
 * `registerEffectBaseName` free function behind custom types and overrides.
 *
 * An effect's duration is the number applied and stays that number until the effect is removed:
 * advancing ticks does not decay it and never expires an effect.
 */

import type * as MC from '@minecraft/server'

import type { ServerLike } from './create-server.js'
import { displayNameOf, EFFECT_BASE_NAMES } from './effect-names.js'
import { ArgumentOutOfBoundsError, NotImplementedError, UnsetValueError } from './errors.js'
import { dispatchBefore } from './events.js'
import { canonicalId } from './ids.js'
import { construct } from './runtime/construct.js'
import { isValidFake, registerBehaviour, stateOf, type ClassBehaviour } from './runtime/member.js'
import { dataOf, serverOf, type EffectState, type EntityData, type ServerState } from './runtime/state.js'

const AMPLIFIER_BOUNDS = { min: 0, max: 255 } as const
const DURATION_BOUNDS = { min: 1, max: 20000000 } as const

/**
 * The base display name for an effect type — a name for a custom type, or an override of a shipped
 * one, which is how a test targeting another locale supplies its own strings. The numeral mapping
 * is computed over it, so a registered `"Gravity Well"` reads `"Gravity Well III"` at amplifier 2.
 *
 * It is a free function because `addEffect` takes the engine's own `EntityEffectOptions`, which has
 * no display-name field, and `Effect` has no member to set one through.
 */
export const registerEffectBaseName = (server: ServerLike, effectTypeId: string, baseName: string): void => {
  serverOf(server.world).effectBaseNames.set(canonicalId(effectTypeId), baseName)
}

/** The base registered for a type, falling back to the shipped table. */
const baseNameOf = (server: ServerState, typeId: string): string | undefined =>
  server.effectBaseNames.get(typeId) ?? EFFECT_BASE_NAMES[typeId]

/** A display name, or the throw that says no base was ever supplied for the type. */
const requireDisplayName = (server: ServerState, typeId: string, amplifier: number, member: string): string => {
  const base = baseNameOf(server, typeId)
  if (base === undefined) {
    throw new UnsetValueError(member)
  }
  return displayNameOf(base, amplifier)
}

/**
 * The id an effect-taking argument names. The declarations accept an `EffectType` too, but the
 * registries are declared and throw, so no test can hold one and the object arm is not modelled.
 */
const idOf = (effectType: MC.EffectType | string, member: string): string => {
  if (typeof effectType !== 'string') {
    throw new NotImplementedError(`${member}(EffectType)`)
  }
  return canonicalId(effectType)
}

/** `+ 0` normalises the `-0` a truncated negative fraction leaves, which the engine never reports. */
const truncate = (value: number): number => Math.trunc(value) + 0

/**
 * The two rejections do not share a message: the amplifier names its parameter after a colon, the
 * duration ends the argument index with a period and names none. A non-integer is truncated toward
 * zero and *then* checked, so duration `0.5` is refused as the `0` it truncates to. `NaN` and
 * `Infinity` land here too — the engine refuses them earlier with a `TypeError`, which this does
 * not reproduce.
 */
const checkAmplifier = (value: number): number => {
  const amplifier = truncate(value)
  if (!(amplifier >= AMPLIFIER_BOUNDS.min && amplifier <= AMPLIFIER_BOUNDS.max)) {
    throw new ArgumentOutOfBoundsError(
      `Unsupported or out of bounds value passed to function argument [2]: amplifier, Value: ${amplifier}, Argument bounds: [${AMPLIFIER_BOUNDS.min}, ${AMPLIFIER_BOUNDS.max}]`,
    )
  }
  return amplifier
}

const checkDuration = (value: number): number => {
  const duration = truncate(value)
  if (!(duration >= DURATION_BOUNDS.min && duration <= DURATION_BOUNDS.max)) {
    throw new ArgumentOutOfBoundsError(
      `Unsupported or out of bounds value passed to function argument [1]. Value: ${duration}, Argument bounds: [${DURATION_BOUNDS.min}, ${DURATION_BOUNDS.max}]`,
    )
  }
  return duration
}

/** The entity an effect hangs off. An effect is always built with its owner's state. */
const ownerDataOf = (fake: object): EntityData => {
  const { owner } = stateOf(fake)
  if (!owner) {
    throw new TypeError('an Effect fake was built without its owner')
  }
  return owner.data as EntityData
}

/** Takes an effect's fake out of service, which is what a removal and a replacement both do. */
const retire = (state: EffectState): void => {
  state.present = false
  stateOf(state.effect).valid = false
}

/**
 * Whether a re-add displaces what is already there: amplifier first, the duration only breaking a
 * tie. A lower amplifier never replaces whatever the duration, and an equal amplifier replaces on a
 * duration longer or equal. The engine compares the duration *remaining*; a fake duration never
 * decays, so this compares the duration stored with nothing to subtract.
 */
const replaces = (existing: EffectState, amplifier: number, duration: number): boolean =>
  amplifier > existing.amplifier || (amplifier === existing.amplifier && duration >= existing.duration)

/** The live effect an entity carries for a type, if it carries one. */
const effectOf = (data: EntityData, typeId: string): EffectState | undefined => {
  const state = data.effects.get(typeId)
  return state?.present === true ? state : undefined
}

const addEffect = (
  fake: object,
  effectType: MC.EffectType | string,
  requestedDuration: number,
  options?: MC.EntityEffectOptions,
): MC.Effect | undefined => {
  const typeId = idOf(effectType, 'Entity.addEffect')
  const duration = checkDuration(requestedDuration)
  const amplifier = checkAmplifier(options?.amplifier ?? 0)

  const data = dataOf<EntityData>(fake)
  const { server } = data

  // `effectType` carries the display name, resolved lazily: raising the event for a type with no
  // registered base must not throw before a handler asks for the name.
  const payload = {
    cancel: false,
    duration,
    entity: data.entity,
    get effectType(): string {
      return requireDisplayName(server, typeId, amplifier, 'EffectAddBeforeEvent.effectType')
    },
  } as MC.EffectAddBeforeEvent

  if (!dispatchBefore(server, 'effectAdd', payload)) {
    return undefined
  }

  // A handler's write is honoured as given: the bounds check is on the call's own arguments.
  const applied = payload.duration
  const existing = effectOf(data, typeId)
  if (existing) {
    if (!replaces(existing, amplifier, applied)) {
      return existing.effect
    }
    retire(existing)
  }

  const state: EffectState = {
    typeId,
    // Filled the moment the fake exists: the state and the fake each need the other.
    effect: undefined as unknown as MC.Effect,
    amplifier,
    duration: applied,
    present: true,
  }
  ;(state as { effect: MC.Effect }).effect = construct('Effect', { data: state, owner: stateOf(fake) }) as MC.Effect
  data.effects.set(typeId, state)
  return state.effect
}

/** The effect members of an entity. `Player` carries the same set. */
const entityEffectMembers: ClassBehaviour = {
  addEffect,

  getEffect: (fake: object, effectType: MC.EffectType | string) =>
    effectOf(dataOf<EntityData>(fake), idOf(effectType, 'Entity.getEffect'))?.effect,

  getEffects: (fake: object) =>
    [...dataOf<EntityData>(fake).effects.values()].filter((state) => state.present).map((state) => state.effect),

  removeEffect: (fake: object, effectType: MC.EffectType | string) => {
    const data = dataOf<EntityData>(fake)
    const typeId = idOf(effectType, 'Entity.removeEffect')
    const state = effectOf(data, typeId)
    if (!state) {
      return false
    }
    retire(state)
    data.effects.delete(typeId)
    return true
  },
}

registerBehaviour('Entity', entityEffectMembers)
registerBehaviour('Player', entityEffectMembers)

registerBehaviour('Effect', {
  isValid: (fake: object) => isValidFake(stateOf(fake)),
  typeId: (fake: object) => dataOf<EffectState>(fake).typeId,
  amplifier: (fake: object) => dataOf<EffectState>(fake).amplifier,
  duration: (fake: object) => dataOf<EffectState>(fake).duration,
  displayName: (fake: object) => {
    const { typeId, amplifier } = dataOf<EffectState>(fake)
    return requireDisplayName(ownerDataOf(fake).server, typeId, amplifier, 'Effect.displayName')
  },
})
