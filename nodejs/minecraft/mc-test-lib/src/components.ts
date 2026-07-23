/**
 * Attribute-shaped component handles. A component is a thin handle over attribute state in its
 * owner's record and follows the owner's validity: value members throw `InvalidEntityError`
 * when the owner is invalid — the same guard the real API documents — while `isValid` and
 * `typeId` keep answering.
 */
import type { Entity, EntityAttributeComponent, EntityDamageSource, EntityHealthComponent } from '@minecraft/server'

import { EntityDamageCause } from './enums.js'
import { InvalidEntityError, NotImplementedError } from './errors.js'
import { dispatchEvent } from './events.js'
import type { AttributeState, EntityRecord, WorldStore } from './internal/store.js'
import type { Equals, Expect } from './internal/type-checks.js'

export const HEALTH_COMPONENT_ID = 'minecraft:health'

/**
 * Fires the cascade of a health write, from the values captured at write time: a change fires
 * `entityHealthChanged`, and a change that reached the effective minimum fires `entityDie` —
 * even if a reentrant handler has already written health again, matching the engine, where
 * the death precedes the after-event handlers.
 */
export const dispatchHealthCascade = (
  store: WorldStore,
  record: EntityRecord,
  oldValue: number,
  newValue: number,
  min: number,
  damageSource: EntityDamageSource,
): void => {
  if (oldValue === newValue) {
    return
  }
  dispatchEvent(store.afterEvents.entityHealthChanged, {
    entity: record.handle,
    oldValue,
    newValue,
  })
  if (newValue === min) {
    dispatchEvent(store.afterEvents.entityDie, {
      damageSource,
      deadEntity: record.handle,
    })
  }
}

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
  }

  #assertOwnerValid(): void {
    if (!this.#owner.valid) {
      throw new InvalidEntityError(this.#owner.id, this.#owner.typeId)
    }
  }

  /** Owner-validity guard first, then presence: a removed component has no state to answer. */
  #stateFor(member: string): AttributeState {
    this.#assertOwnerValid()
    const state = this.#owner.components.get(this.#canonicalId)
    if (!state) {
      throw new NotImplementedError(`EntityAttributeComponent.${member} on a removed component`)
    }
    return state
  }

  #write(state: AttributeState, newValue: number): void {
    const oldValue = state.current
    if (oldValue === newValue) {
      return
    }
    state.current = newValue
    if (this.#canonicalId === HEALTH_COMPONENT_ID) {
      dispatchHealthCascade(this.#store, this.#owner, oldValue, newValue, state.min, {
        cause: EntityDamageCause.none,
      })
    }
  }

  /**
   * The entity that owns this component. Throws `InvalidEntityError` once the owner is
   * invalid — this is the one `Component` member the declarations guard.
   */
  get entity(): Entity {
    this.#assertOwnerValid()
    return this.#owner.handle
  }

  /**
   * Whether the component is still usable: `false` once its owner is invalid or the component
   * has been removed. The safe probe; never throws.
   */
  get isValid(): boolean {
    return this.#owner.valid && this.#owner.components.has(this.#canonicalId)
  }

  /** Canonical (`minecraft:`-prefixed) component id. Stays readable on an invalid owner. */
  get typeId(): string {
    return this.#canonicalId
  }

  /** Current value of this attribute. */
  get currentValue(): number {
    return this.#stateFor('currentValue').current
  }

  /** The staged default value for this attribute. */
  get defaultValue(): number {
    return this.#stateFor('defaultValue').default
  }

  /** The staged effective maximum of this attribute. */
  get effectiveMax(): number {
    return this.#stateFor('effectiveMax').max
  }

  /** The staged effective minimum of this attribute. */
  get effectiveMin(): number {
    return this.#stateFor('effectiveMin').min
  }

  /** Resets the current value to the staged default value. */
  resetToDefaultValue(): void {
    const state = this.#stateFor('resetToDefaultValue')
    this.#write(state, state.default)
  }

  /** Resets the current value to the staged effective maximum. */
  resetToMaxValue(): void {
    const state = this.#stateFor('resetToMaxValue')
    this.#write(state, state.max)
  }

  /**
   * Resets the current value to the staged effective minimum; on a health component this is a
   * death: `entityHealthChanged` then `entityDie` fire when the value actually changes.
   */
  resetToMinValue(): void {
    const state = this.#stateFor('resetToMinValue')
    this.#write(state, state.min)
  }

  /**
   * Sets the current value of this attribute and returns whether it was set. Validity is
   * checked first: an invalid owner throws `InvalidEntityError` even for a value that would
   * be rejected. A value outside the staged bounds (inclusive on both ends) throws
   * `NotImplementedError` — the real API documents an out-of-bounds throw whose runtime class
   * the fake cannot import, and it does not guess.
   */
  setCurrentValue(value: number): boolean {
    const state = this.#stateFor('setCurrentValue')
    if (value < state.min || value > state.max) {
      throw new NotImplementedError(
        `EntityAttributeComponent.setCurrentValue(${value}) outside the staged bounds [${state.min}, ${state.max}]`,
      )
    }
    this.#write(state, value)
    return true
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
