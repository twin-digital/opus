/**
 * Attribute-shaped component handles. A component is a thin handle over attribute state in its
 * owner's record and follows the owner's validity: value members throw `InvalidEntityError`
 * when the owner is invalid — the same guard the real API documents — while `isValid` and
 * `typeId` keep answering.
 */
import type { Entity, EntityAttributeComponent, EntityHealthComponent } from '@minecraft/server'

import { notYetImplemented } from './internal/not-yet.js'
import type { EntityRecord, WorldStore } from './internal/store.js'
import type { Equals, Expect } from './internal/type-checks.js'

/**
 * Fake of `EntityAttributeComponent`, the shape shared by `minecraft:health`,
 * `minecraft:movement`, `minecraft:underwater_movement`, and `minecraft:lava_movement`. Vended
 * by `Entity.getComponent`; never constructed by a test directly.
 *
 * Every write that changes the current value of a `minecraft:health` component fires
 * `entityHealthChanged`, and a write that drives it to its effective minimum fires `entityDie`
 * — the events are keyed to the change, not the path that made it. Attribute state the spawn
 * spec staged is the full value set: current, default, min, and max; no bound is derived from
 * another.
 */
export class FakeEntityAttributeComponent {
  readonly #store: WorldStore
  readonly #owner: EntityRecord
  readonly #canonicalId: string

  constructor(store: WorldStore, owner: EntityRecord, canonicalId: string) {
    this.#store = store
    this.#owner = owner
    this.#canonicalId = canonicalId
    void this.#store
    void this.#owner
    void this.#canonicalId
  }

  /**
   * The entity that owns this component. Throws `InvalidEntityError` once the owner is
   * invalid — this is the one `Component` member the declarations guard.
   */
  get entity(): Entity {
    return notYetImplemented()
  }

  /**
   * Whether the component is still usable: `false` once its owner is invalid or the component
   * has been removed. The safe probe; never throws.
   */
  get isValid(): boolean {
    return notYetImplemented()
  }

  /** Canonical (`minecraft:`-prefixed) component id. Stays readable on an invalid owner. */
  get typeId(): string {
    return notYetImplemented()
  }

  /** Current value of this attribute. */
  get currentValue(): number {
    return notYetImplemented()
  }

  /** The staged default value for this attribute. */
  get defaultValue(): number {
    return notYetImplemented()
  }

  /** The staged effective maximum of this attribute. */
  get effectiveMax(): number {
    return notYetImplemented()
  }

  /** The staged effective minimum of this attribute. */
  get effectiveMin(): number {
    return notYetImplemented()
  }

  /** Resets the current value to the staged default value. */
  resetToDefaultValue(): void {
    notYetImplemented()
  }

  /** Resets the current value to the staged effective maximum. */
  resetToMaxValue(): void {
    notYetImplemented()
  }

  /**
   * Resets the current value to the staged effective minimum; on a health component this is a
   * death: `entityHealthChanged` then `entityDie` fire when the value actually changes.
   */
  resetToMinValue(): void {
    notYetImplemented()
  }

  /**
   * Sets the current value of this attribute and returns whether it was set. Validity is
   * checked first: an invalid owner throws `InvalidEntityError` even for a value that would
   * be rejected. A value outside the staged bounds (inclusive on both ends) throws
   * `NotImplementedError` — the real API documents an out-of-bounds throw whose runtime class
   * the fake cannot import, and it does not guess.
   */
  setCurrentValue(value: number): boolean {
    void value
    return notYetImplemented()
  }
}

/**
 * Fake of `EntityHealthComponent` — the attribute component for `minecraft:health`, whose
 * writes drive the damage-path events.
 */
export class FakeEntityHealthComponent extends FakeEntityAttributeComponent {
  static readonly componentId = 'minecraft:health'
}

type _fakeAttributeAssignable = Expect<FakeEntityAttributeComponent extends EntityAttributeComponent ? true : false>
type _fakeAttributeFullShape = Expect<Equals<keyof FakeEntityAttributeComponent, keyof EntityAttributeComponent>>
type _fakeHealthAssignable = Expect<FakeEntityHealthComponent extends EntityHealthComponent ? true : false>
