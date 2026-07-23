/**
 * Effect handles. Effect state lives in the owning entity's record; a handle reads that state
 * live, so `addEffect` replacing an effect's amplifier and duration is observed by every
 * existing handle for it.
 */
import type { Effect, EffectType } from '@minecraft/server'

import { InvalidEntityError, NotImplementedError } from './errors.js'
import type { EffectState, EntityRecord } from './internal/store.js'
import type { Equals, Expect } from './internal/type-checks.js'

// Assigned in the class's static block so the staging helper can reach the private state
// without adding a member to the fake's surface.
let stateOf!: (effect: FakeEffect) => EffectState

/**
 * Fake of `Effect`. Vended by `Entity.addEffect`, `getEffect`, and `getEffects`; never
 * constructed by a test directly.
 *
 * Validity follows both the effect and its owner: `isValid` is `false` once the effect has
 * been removed or the owning entity invalidated, and it never throws. The value members throw
 * `InvalidEntityError` when the owner is invalid; on a removed effect with a valid owner they
 * throw `NotImplementedError` — the real API documents that they throw, but not what, and the
 * fake does not guess.
 */
export class FakeEffect {
  readonly #owner: EntityRecord
  readonly #state: EffectState

  constructor(owner: EntityRecord, init: Omit<EffectState, 'handle'>) {
    this.#owner = owner
    this.#state = { ...init, handle: this }
  }

  static {
    stateOf = (effect) => effect.#state
  }

  #guard(member: string): EffectState {
    if (!this.#owner.valid) {
      throw new InvalidEntityError(this.#owner.id, this.#owner.typeId)
    }
    if (this.#state.removed) {
      throw new NotImplementedError(`Effect.${member} on a removed effect`)
    }
    return this.#state
  }

  /** Amplifier applied to this effect; `0` when `addEffect` received no amplifier option. */
  get amplifier(): number {
    return this.#guard('amplifier').amplifier
  }

  /**
   * A localized string the fake cannot produce; always throws `NotImplementedError`, even on a
   * valid effect.
   */
  get displayName(): string {
    this.#guard('displayName')
    throw new NotImplementedError('Effect.displayName (localized names are not modeled)')
  }

  /** Remaining duration in ticks. The world has no clock: it reads exactly as staged or set. */
  get duration(): number {
    return this.#guard('duration').duration
  }

  /** Whether this effect instance is still usable; the safe probe, it never throws. */
  get isValid(): boolean {
    return this.#owner.valid && !this.#state.removed
  }

  /** Canonical (`minecraft:`-prefixed) effect type id. */
  get typeId(): string {
    return this.#guard('typeId').typeId
  }
}

/** Resolves the id of an `EffectType | string` argument; canonicalization is the caller's. */
export const effectTypeId = (effectType: EffectType | string): string =>
  typeof effectType === 'string' ? effectType : effectType.getName()

/**
 * Adds or replaces an effect on a record: an existing effect's amplifier and duration are
 * overwritten in place (existing handles observe the change); otherwise fresh state and its
 * handle are created. Returns the handle for the applied effect.
 */
export const stageEffect = (
  record: EntityRecord,
  canonicalId: string,
  duration: number,
  amplifier: number,
): FakeEffect => {
  const existing = record.effects.get(canonicalId)
  if (existing) {
    existing.duration = duration
    existing.amplifier = amplifier
    return existing.handle
  }
  const handle = new FakeEffect(record, {
    typeId: canonicalId,
    amplifier,
    duration,
    removed: false,
  })
  record.effects.set(canonicalId, stateOf(handle))
  return handle
}

/**
 * Removes an effect from a record, returning whether it was present. The removed state is
 * flagged so surviving handles answer `isValid` false and throw on value reads; a later
 * re-add creates fresh state rather than reviving them.
 */
export const removeEffectState = (record: EntityRecord, canonicalId: string): boolean => {
  const state = record.effects.get(canonicalId)
  if (!state) {
    return false
  }
  state.removed = true
  record.effects.delete(canonicalId)
  return true
}

type _fakeEffectAssignable = Expect<FakeEffect extends Effect ? true : false>
type _fakeEffectFullShape = Expect<Equals<keyof FakeEffect, keyof Effect>>
