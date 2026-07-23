/**
 * The entity fake: a handle over a world-store record, carrying only real `Entity` members.
 * Behaving methods implement the documented semantics against the record; every member outside
 * the built surface presents as a stub that honors the declared validity guard and then throws
 * `NotImplementedError`.
 *
 * Validity is enforced member by member, following the `@throws` annotations of the pinned
 * declarations: the 56 guarded members throw `InvalidEntityError` once the record is gone,
 * while `id`, `typeId`, `isValid`, and `nameTag` keep answering — `isValid` is the probe and
 * never throws — and `isSneaking` and `scoreboardIdentity`, unguarded and unbuilt, throw
 * `NotImplementedError` regardless of validity.
 */
import type {
  Dimension,
  Effect,
  EffectType,
  Entity,
  EntityApplyDamageByProjectileOptions,
  EntityApplyDamageOptions,
  EntityComponent,
  EntityComponentReturnType,
  EntityDamageSource,
  EntityEffectOptions,
  Vector3,
} from '@minecraft/server'

import {
  dispatchHealthCascade,
  FakeEntityAttributeComponent,
  FakeEntityHealthComponent,
  HEALTH_COMPONENT_ID,
} from './components.js'
import { effectTypeId, removeEffectState, stageEffect } from './effects.js'
import { EntityDamageCause } from './enums.js'
import { InvalidEntityError, NotImplementedError } from './errors.js'
import { dispatchEvent } from './events.js'
import { canonicalizeId } from './ids.js'
import { installStubs } from './internal/stubs.js'
import { invalidateRecord, type EntityRecord, type WorldStore } from './internal/store.js'
import type { Equals, Expect } from './internal/type-checks.js'

/** Members implemented with behaviour (or, for the never-throw identity set, live reads). */
export const BUILT_ENTITY_MEMBERS = [
  'addEffect',
  'addTag',
  'applyDamage',
  'dimension',
  'getComponent',
  'getComponents',
  'getEffect',
  'getEffects',
  'getTags',
  'hasComponent',
  'hasTag',
  'id',
  'isValid',
  'kill',
  'location',
  'nameTag',
  'remove',
  'removeEffect',
  'removeTag',
  'typeId',
] as const

/**
 * Unbuilt members whose declarations carry an `InvalidEntityError` `@throws`: their stubs
 * check validity first — an invalid entity throws `InvalidEntityError`, a valid one
 * `NotImplementedError`.
 */
export const GUARDED_ENTITY_STUBS = [
  'addItem',
  'applyImpulse',
  'applyKnockback',
  'clearDynamicProperties',
  'clearVelocity',
  'extinguishFire',
  'getAABB',
  'getAllBlocksStandingOn',
  'getBlockFromViewDirection',
  'getBlockStandingOn',
  'getDynamicProperty',
  'getDynamicPropertyIds',
  'getDynamicPropertyTotalByteCount',
  'getEntitiesFromViewDirection',
  'getHeadLocation',
  'getProperty',
  'getRotation',
  'getVelocity',
  'getViewDirection',
  'isClimbing',
  'isFalling',
  'isInWater',
  'isOnGround',
  'isSleeping',
  'isSprinting',
  'isSwimming',
  'localizationKey',
  'lookAt',
  'matches',
  'playAnimation',
  'resetProperty',
  'runCommand',
  'setDynamicProperties',
  'setDynamicProperty',
  'setOnFire',
  'setProperty',
  'setRotation',
  'teleport',
  'triggerEvent',
  'tryTeleport',
] as const

/**
 * Unbuilt members with no `@throws` at all: they never throw `InvalidEntityError`, so their
 * stubs throw `NotImplementedError` even on an invalid entity.
 */
export const UNGUARDED_ENTITY_STUBS = ['isSneaking', 'scoreboardIdentity'] as const

type BuiltEntityKey = (typeof BUILT_ENTITY_MEMBERS)[number]
type EntityStubKey = Exclude<keyof Entity, BuiltEntityKey>

type _entityStubsExact = Expect<
  Equals<(typeof GUARDED_ENTITY_STUBS)[number] | (typeof UNGUARDED_ENTITY_STUBS)[number], EntityStubKey>
>

// Assigned in the class's static block so the control plane can reach the private record
// without adding a member to the fake's surface.
let internalsOf!: (entity: FakeEntity) => { store: WorldStore; record: EntityRecord }

/** Resolves a fake entity's backing store and record; throws for anything else. */
export const getEntityInternals = (entity: Entity): { store: WorldStore; record: EntityRecord } => {
  if (!(entity instanceof FakeEntity)) {
    throw new TypeError('expected an entity created by this library (spawnFake)')
  }
  return internalsOf(entity)
}

/**
 * Fake of `Entity`. Vended by `spawnFake` (and read back through `world.getEntity` and
 * `dimension.getEntities`); never constructed by a test directly. Declared against the real
 * type, so it is accepted anywhere an `Entity` is expected, without casts.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- stub members are installed on the prototype from the stub lists above, whose completeness the Expect<Equals<...>> check enforces
export class FakeEntity {
  readonly #store: WorldStore
  readonly #record: EntityRecord

  constructor(store: WorldStore, init: Omit<EntityRecord, 'handle' | 'componentHandles'>) {
    this.#store = store
    this.#record = { ...init, handle: this, componentHandles: new Map() }
  }

  static {
    internalsOf = (entity) => ({ store: entity.#store, record: entity.#record })
    installStubs(FakeEntity.prototype, 'Entity', GUARDED_ENTITY_STUBS, (self) => {
      ;(self as FakeEntity).#assertValid()
    })
    installStubs(FakeEntity.prototype, 'Entity', UNGUARDED_ENTITY_STUBS)
  }

  #assertValid(): void {
    if (!this.#record.valid) {
      throw new InvalidEntityError(this.#record.id, this.#record.typeId)
    }
  }

  #componentHandle(canonicalId: string): FakeEntityAttributeComponent {
    const cached = this.#record.componentHandles.get(canonicalId)
    if (cached) {
      return cached
    }
    const handle =
      canonicalId === HEALTH_COMPONENT_ID ?
        new FakeEntityHealthComponent(this.#store, this.#record, canonicalId)
      : new FakeEntityAttributeComponent(this.#store, this.#record, canonicalId)
    this.#record.componentHandles.set(canonicalId, handle)
    return handle
  }

  /**
   * Dimension the entity is within — the handle `world.getDimension` returns for the spawn
   * spec's `dimension`. Reading it on an entity whose spec staged no dimension throws
   * `NotImplementedError` naming the missing field.
   */
  get dimension(): Dimension {
    this.#assertValid()
    if (this.#record.dimensionId === undefined) {
      throw new NotImplementedError('Entity.dimension (not staged in the spawn spec)')
    }
    const dimension = this.#store.dimensions.get(this.#record.dimensionId)
    if (!dimension) {
      throw new NotImplementedError(`Entity.dimension ('${this.#record.dimensionId}' is not a vanilla dimension)`)
    }
    return dimension
  }

  /** Unique opaque id, assigned at spawn (or staged via the spec). Readable while invalid. */
  get id(): string {
    return this.#record.id
  }

  /** Whether the entity can still be manipulated; the safe probe, it never throws. */
  get isValid(): boolean {
    return this.#record.valid
  }

  /**
   * Current location, as staged in the spawn spec. Reading it on an entity whose spec staged
   * no location throws `NotImplementedError` naming the missing field.
   */
  get location(): Vector3 {
    this.#assertValid()
    if (!this.#record.location) {
      throw new NotImplementedError('Entity.location (not staged in the spawn spec)')
    }
    return this.#record.location
  }

  /** Given name; `''` until set, exactly as the engine reports an unnamed entity. */
  get nameTag(): string {
    return this.#record.nameTag
  }

  set nameTag(value: string) {
    this.#record.nameTag = value
  }

  /** Canonical (`minecraft:`-prefixed) entity type id. Readable while invalid. */
  get typeId(): string {
    return this.#record.typeId
  }

  /**
   * Adds an effect, or replaces one already present — amplifier and duration are overwritten
   * unconditionally, observed by every existing `Effect` handle. The amplifier defaults to
   * `0`; `showParticles` has no observable fake surface and is ignored. Returns the `Effect`
   * handle for the applied effect.
   *
   * The declarations are contradictory about this return — the prose says success returns
   * nothing while the signature says `Effect | undefined` — and the fake follows the
   * signature, reserving `undefined` for the failure the type implies.
   */
  addEffect(effectType: EffectType | string, duration: number, options?: EntityEffectOptions): Effect | undefined {
    this.#assertValid()
    const canonicalId = canonicalizeId(effectTypeId(effectType))
    return stageEffect(this.#record, canonicalId, duration, options?.amplifier ?? 0)
  }

  /** Adds a tag; returns `false` (and adds nothing) when the entity already carries it. */
  addTag(tag: string): boolean {
    this.#assertValid()
    if (this.#record.tags.has(tag)) {
      return false
    }
    this.#record.tags.add(tag)
    return true
  }

  /**
   * Applies damage: lowers the health component's `currentValue`, clamped at its effective
   * minimum, and returns whether the entity took any damage — `false` for a non-positive
   * amount, a missing health component, or health already at its minimum, and then nothing
   * fires. A damaging hit dispatches `entityHurt`, then `entityHealthChanged`, then — when
   * health reaches its minimum — `entityDie`, synchronously, with the record already written.
   *
   * The fired `damageSource` carries the caller's options; its cause is `'none'` when the
   * options carry no `cause` (including the projectile-options form, which has none).
   */
  applyDamage(amount: number, options?: EntityApplyDamageByProjectileOptions | EntityApplyDamageOptions): boolean {
    this.#assertValid()
    const health = this.#record.components.get(HEALTH_COMPONENT_ID)
    if (amount <= 0 || !health) {
      return false
    }
    const oldValue = health.current
    const newValue = Math.max(health.min, oldValue - amount)
    if (newValue === oldValue) {
      return false
    }
    health.current = newValue

    const damageSource: EntityDamageSource = {
      cause: options !== undefined && 'cause' in options ? options.cause : EntityDamageCause.none,
      damagingEntity: options?.damagingEntity,
      damagingProjectile:
        options !== undefined && 'damagingProjectile' in options ? options.damagingProjectile : undefined,
    }
    dispatchEvent(this.#store.afterEvents.entityHurt, {
      damage: amount,
      damageSource,
      hurtEntity: this,
    })
    dispatchHealthCascade(this.#store, this.#record, oldValue, newValue, health.min, damageSource)
    return true
  }

  /**
   * Returns the component handle for `componentId` — bare or prefixed — or `undefined` when
   * the entity lacks it. Absence is answerable for every component id, modeled or not;
   * presence is only expressible for the attribute-shaped ids a spawn spec can stage.
   */
  getComponent<T extends string>(componentId: T): EntityComponentReturnType<T> | undefined {
    this.#assertValid()
    const canonicalId = canonicalizeId(componentId)
    if (!this.#record.components.has(canonicalId)) {
      return undefined
    }
    return this.#componentHandle(canonicalId) as unknown as EntityComponentReturnType<T>
  }

  /** Returns handles for every component present on the entity. */
  getComponents(): EntityComponent[] {
    this.#assertValid()
    return [...this.#record.components.keys()].map((canonicalId) => this.#componentHandle(canonicalId))
  }

  /**
   * Returns the `Effect` handle for the given type — bare or prefixed — or `undefined` when
   * not present. Whether an effect type exists at all is not validated: the engine's registry
   * is not available at runtime, so an unknown id simply reads as absent.
   */
  getEffect(effectType: EffectType | string): Effect | undefined {
    this.#assertValid()
    return this.#record.effects.get(canonicalizeId(effectTypeId(effectType)))?.handle
  }

  /** Returns handles for every effect on the entity. */
  getEffects(): Effect[] {
    this.#assertValid()
    return [...this.#record.effects.values()].map((state) => state.handle)
  }

  /** Returns all tags on the entity. */
  getTags(): string[] {
    this.#assertValid()
    return [...this.#record.tags]
  }

  /** Returns whether the component — bare or prefixed id — is present on the entity. */
  hasComponent(componentId: string): boolean {
    this.#assertValid()
    return this.#record.components.has(canonicalizeId(componentId))
  }

  /** Returns whether the entity carries the tag. */
  hasTag(tag: string): boolean {
    this.#assertValid()
    return this.#record.tags.has(tag)
  }

  /**
   * Drives health to its effective minimum and the death cascade with it —
   * `entityHealthChanged`, then `entityDie` with a `damageSource` of cause `'none'`; no
   * `entityHurt`, since the fidelity sources do not document kill as a hurt. The reference
   * stays valid: despawn is not modeled, and a test that wants the dead entity gone calls
   * `invalidate` itself. Returns `true` (even when already dead, per the documented
   * contract); an entity with no health component is left unchanged and nothing fires.
   */
  kill(): boolean {
    this.#assertValid()
    const health = this.#record.components.get(HEALTH_COMPONENT_ID)
    if (!health || health.current === health.min) {
      return true
    }
    const oldValue = health.current
    health.current = health.min
    dispatchHealthCascade(this.#store, this.#record, oldValue, health.min, health.min, {
      cause: EntityDamageCause.none,
    })
    return true
  }

  /**
   * Immediately invalidates the entity: the record is removed, `isValid` turns `false`, and
   * every surviving handle throws per its guard. Fires no death event.
   */
  remove(): void {
    this.#assertValid()
    invalidateRecord(this.#store, this.#record)
  }

  /**
   * Removes the effect — bare or prefixed id — returning whether it was present. Surviving
   * `Effect` handles for it turn invalid.
   */
  removeEffect(effectType: EffectType | string): boolean {
    this.#assertValid()
    return removeEffectState(this.#record, canonicalizeId(effectTypeId(effectType)))
  }

  /** Removes a tag; returns whether the entity carried it. */
  removeTag(tag: string): boolean {
    this.#assertValid()
    return this.#record.tags.delete(tag)
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- see class comment; the interface half of the merge intentionally adds only inherited members
export interface FakeEntity extends Pick<Entity, EntityStubKey> {}

type _fakeEntityAssignable = Expect<FakeEntity extends Entity ? true : false>
type _fakeEntityNoExtraMembers = Expect<Equals<keyof FakeEntity, keyof Entity>>
