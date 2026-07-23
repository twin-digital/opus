/**
 * Effect handles. Effect state lives in the owning entity's record; a handle reads that state
 * live, so `addEffect` replacing an effect's amplifier and duration is observed by every
 * existing handle for it.
 */
import type { Effect } from '@minecraft/server'

import { notYetImplemented } from './internal/not-yet.js'
import type { EffectState, EntityRecord } from './internal/store.js'
import type { Equals, Expect } from './internal/type-checks.js'

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

  constructor(owner: EntityRecord, state: EffectState) {
    this.#owner = owner
    this.#state = state
    void this.#owner
    void this.#state
  }

  /** Amplifier applied to this effect; `0` when `addEffect` received no amplifier option. */
  get amplifier(): number {
    return notYetImplemented()
  }

  /**
   * A localized string the fake cannot produce; always throws `NotImplementedError`, even on a
   * valid effect.
   */
  get displayName(): string {
    return notYetImplemented()
  }

  /** Remaining duration in ticks. The world has no clock: it reads exactly as staged or set. */
  get duration(): number {
    return notYetImplemented()
  }

  /** Whether this effect instance is still usable; the safe probe, it never throws. */
  get isValid(): boolean {
    return notYetImplemented()
  }

  /** Canonical (`minecraft:`-prefixed) effect type id. */
  get typeId(): string {
    return notYetImplemented()
  }
}

type _fakeEffectAssignable = Expect<FakeEffect extends Effect ? true : false>
type _fakeEffectFullShape = Expect<Equals<keyof FakeEffect, keyof Effect>>
