/**
 * Entity components: the `addComponent` and `removeComponent` free functions, `getComponent` id
 * normalization, the seven attribute-shaped components with their bounds checks, and every cascade
 * that writes health — the component writes, `applyDamage`, and `kill`'s health-bearing branch.
 *
 * Every other component can be attached and carries its declared shape, but only its `typeId`,
 * `isValid` and `entity` members behave; the rest throw `NotImplementedError`.
 */

import type * as MC from '@minecraft/server'

import { killWithoutHealth } from './entity.js'
import { ArgumentOutOfBoundsError, InvalidArgumentError, UnsetValueError } from './errors.js'
import { dispatchAfter, dispatchBefore } from './events.js'
import { ATTRIBUTE_COMPONENT_CLASSES, COMPONENT_CLASSES, componentClassFor } from './generated/manifests.js'
import { canonicalId, isAttributeComponentId, type EntityComponentId } from './ids.js'
import { construct } from './runtime/construct.js'
import { assertLiveEntity, isValidFake, registerBehaviour, stateOf, type ClassBehaviour } from './runtime/member.js'
import { dataOf, entityDataOf, type AttributeValues, type ComponentState, type EntityData } from './runtime/state.js'

/**
 * The state an attribute-shaped component is attached with: the four numbers it holds, or one of
 * two shorthands. A single number is `currentValue`, with `effectiveMin` 0 and `effectiveMax` equal
 * to it; a `[min, max]` pair gives those bounds with `currentValue` at `max`. Both leave
 * `defaultValue` unset, and each is exactly the record it abbreviates.
 */
export type ComponentSpec = AttributeValues | number | readonly [min: number, max: number]

/** The one component whose writes cascade: the fakes raise health events for no other. */
const HEALTH_ID = 'minecraft:health'

/** What a component fake holds: the entity it hangs off, and the state that entity keeps for it. */
interface ComponentData {
  readonly server: EntityData['server']
  readonly owner: EntityData
  readonly state: ComponentState
}

/** The record a spec abbreviates. Each shorthand is exactly the record it stands for. */
const attributeValuesOf = (spec: ComponentSpec | undefined): AttributeValues => {
  if (spec === undefined) {
    return {}
  }
  if (typeof spec === 'number') {
    return { currentValue: spec, effectiveMin: 0, effectiveMax: spec }
  }
  if (Array.isArray(spec)) {
    const [min, max] = spec as readonly [number, number]
    return { currentValue: max, effectiveMin: min, effectiveMax: max }
  }
  return { ...(spec as AttributeValues) }
}

/**
 * Attaches a component to a live entity, because the real API reshapes an entity's components only
 * through data-driven paths these fakes do not model. The state argument is accepted only on one of
 * the seven attribute-shaped ids; passing it with any other id throws `InvalidArgumentError`.
 */
export const addComponent = <T extends EntityComponentId>(
  entity: MC.Entity,
  componentId: T,
  state?: ComponentSpec,
): MC.EntityComponentTypeMap[T] => {
  assertLiveEntity(entity, 'addComponent')
  const id = canonicalId(componentId)
  const className = componentClassFor(id)
  if (className === undefined) {
    throw new InvalidArgumentError(`Invalid value passed to argument [1]. ${componentId} is not a component id.`)
  }
  const data = entityDataOf(entity)
  if (data.components.has(id)) {
    throw new InvalidArgumentError(`Invalid value passed to argument [1]. ${id} is already attached to this entity.`)
  }
  if (state !== undefined && !isAttributeComponentId(id)) {
    throw new InvalidArgumentError(`Invalid value passed to argument [2]. ${id} is not an attribute component.`)
  }

  const componentState: ComponentState = {
    componentId: id,
    // Filled the moment the fake exists: the state and the fake each need the other.
    component: undefined as unknown as MC.EntityComponent,
    attribute: isAttributeComponentId(id) ? attributeValuesOf(state) : undefined,
  }
  const component = construct(className, {
    data: { server: data.server, owner: data, state: componentState } satisfies ComponentData,
    owner: stateOf(entity),
  }) as MC.EntityComponent
  ;(componentState as { component: MC.EntityComponent }).component = component
  data.components.set(id, componentState)
  return component as MC.EntityComponentTypeMap[T]
}

/** Detaches a component from a live entity, and answers whether it was there. */
export const removeComponent = (entity: MC.Entity, componentId: EntityComponentId): boolean => {
  assertLiveEntity(entity, 'removeComponent')
  const data = entityDataOf(entity)
  const state = data.components.get(canonicalId(componentId))
  if (!state) {
    return false
  }
  data.components.delete(state.componentId)
  // A detached reference goes stale exactly as one whose entity went invalid does.
  stateOf(state.component).valid = false
  return true
}

// ---------------------------------------------------------------------------
// Behaviour
// ---------------------------------------------------------------------------

/** The four numbers behind an attribute component, with the state and class that carry them. */
const attributeOf = (fake: object): { values: AttributeValues; data: ComponentData; className: string } => {
  const data = dataOf<ComponentData>(fake)
  const { className } = stateOf(fake)
  const { attribute } = data.state
  if (!attribute) {
    throw new UnsetValueError(`${className}.currentValue`)
  }
  return { values: attribute, data, className }
}

/** One of the four, or `UnsetValueError` naming it where the test supplied none. */
const numberOf = (fake: object, field: keyof AttributeValues): number => {
  const { values, className } = attributeOf(fake)
  const value = values[field]
  if (value === undefined) {
    throw new UnsetValueError(`${className}.${field}`)
  }
  return value
}

/** The damage source a cascade carries, as the payloads declare it. */
const sourceOf = (cause: string, from?: Partial<MC.EntityDamageSource>): MC.EntityDamageSource => ({
  ...from,
  cause: cause as MC.EntityDamageCause,
})

/**
 * Writes health and raises what the write raises: `entityHealthChanged` always, and `entityDie`
 * where the value lands at or below `effectiveMin`. A component write carries cause `override`;
 * `applyDamage` and `kill` pass their own.
 */
const writeHealth = (fake: object, next: number, damageSource: MC.EntityDamageSource): void => {
  const { values, data } = attributeOf(fake)
  const oldValue = numberOf(fake, 'currentValue')
  const effectiveMin = numberOf(fake, 'effectiveMin')
  values.currentValue = next
  dispatchAfter(data.server, 'entityHealthChanged', { entity: data.owner.entity, oldValue, newValue: next })
  // Death is settled by the value written, not by what a handler did after: in the engine the
  // question cannot arise, since after-events are deferred past the whole call.
  if (next <= effectiveMin) {
    dispatchAfter(data.server, 'entityDie', { deadEntity: data.owner.entity, damageSource })
  }
}

/** Applies a value the component itself computed, cascading only on `minecraft:health`. */
const applyWrite = (fake: object, next: number): void => {
  const { values, data } = attributeOf(fake)
  if (data.state.componentId !== HEALTH_ID) {
    values.currentValue = next
    return
  }
  writeHealth(fake, next, sourceOf('override'))
}

/** Every component's behaving members: the three the spec models on all 68. */
const componentBehaviour: ClassBehaviour = {
  isValid: (fake: object) => isValidFake(stateOf(fake)),
  typeId: (fake: object) => dataOf<ComponentData>(fake).state.componentId,
  entity: (fake: object) => dataOf<ComponentData>(fake).owner.entity,
}

/** The seven attribute-shaped components, which behave in full. */
const attributeBehaviour: ClassBehaviour = {
  ...componentBehaviour,

  currentValue: (fake: object) => numberOf(fake, 'currentValue'),
  defaultValue: (fake: object) => numberOf(fake, 'defaultValue'),
  effectiveMin: (fake: object) => numberOf(fake, 'effectiveMin'),
  effectiveMax: (fake: object) => numberOf(fake, 'effectiveMax'),

  setCurrentValue: (fake: object, value: number) => {
    const effectiveMin = numberOf(fake, 'effectiveMin')
    const effectiveMax = numberOf(fake, 'effectiveMax')
    if (value < effectiveMin || value > effectiveMax) {
      throw new ArgumentOutOfBoundsError(
        `Unsupported or out of bounds value passed to function argument [0]: value, Value: ${String(value)}, Argument bounds: [${String(effectiveMin)}, ${String(effectiveMax)}]`,
      )
    }
    applyWrite(fake, value)
    return true
  },

  // Each reset takes the value it names; none consults the bounds check.
  resetToDefaultValue: (fake: object) => {
    applyWrite(fake, numberOf(fake, 'defaultValue'))
  },
  resetToMaxValue: (fake: object) => {
    applyWrite(fake, numberOf(fake, 'effectiveMax'))
  },
  resetToMinValue: (fake: object) => {
    applyWrite(fake, numberOf(fake, 'effectiveMin'))
  },
}

for (const className of COMPONENT_CLASSES) {
  registerBehaviour(className, componentBehaviour)
}

for (const className of ATTRIBUTE_COMPONENT_CLASSES) {
  registerBehaviour(className, attributeBehaviour)
}

/** The health component an entity carries, or `undefined`. */
const healthOf = (data: EntityData): MC.EntityAttributeComponent | undefined =>
  data.components.get(HEALTH_ID)?.component as MC.EntityAttributeComponent | undefined

/** The `damageSource` a call's options describe. The projectile form declares no cause of its own. */
const damageSourceOf = (
  options?: MC.EntityApplyDamageByProjectileOptions | MC.EntityApplyDamageOptions,
): MC.EntityDamageSource => {
  if (options === undefined) {
    return sourceOf('none')
  }
  if ('damagingProjectile' in options) {
    return sourceOf('projectile', {
      damagingEntity: options.damagingEntity,
      damagingProjectile: options.damagingProjectile,
    })
  }
  return sourceOf(options.cause, { damagingEntity: options.damagingEntity })
}

/** The component members on `Entity`, and the two cascades that write health through them. */
const entityComponentBehaviour: ClassBehaviour = {
  getComponent: (fake: object, componentId: string) =>
    dataOf<EntityData>(fake).components.get(canonicalId(componentId))?.component,
  getComponents: (fake: object) => [...dataOf<EntityData>(fake).components.values()].map((state) => state.component),
  hasComponent: (fake: object, componentId: string) =>
    dataOf<EntityData>(fake).components.has(canonicalId(componentId)),

  applyDamage: (
    fake: object,
    amount: number,
    options?: MC.EntityApplyDamageByProjectileOptions | MC.EntityApplyDamageOptions,
  ) => {
    const data = dataOf<EntityData>(fake)
    const health = healthOf(data)
    // Admission — damageable entity, positive amount — is settled before anything is read.
    if (health === undefined || amount <= 0) {
      return false
    }

    const damageSource = damageSourceOf(options)
    const before = { hurtEntity: data.entity, damage: amount, damageSource, cancel: false }
    if (!dispatchBefore(data.server, 'entityHurt', before)) {
      return true
    }
    // The handler ran inside this call and may have removed the entity or detached its health.
    // Admission was already settled, so the boolean stands while the write and its cascade do not.
    if (!isValidFake(stateOf(fake)) || data.components.get(HEALTH_ID)?.component !== health) {
      return true
    }

    const { damage } = before
    const oldValue = numberOf(health, 'currentValue')
    const effectiveMin = numberOf(health, 'effectiveMin')
    // The damage path writes directly: no bounds check, no clamp, and the damage's own cause.
    const newValue = oldValue - damage
    attributeOf(health).values.currentValue = newValue
    dispatchAfter(data.server, 'entityHurt', { hurtEntity: data.entity, damage, damageSource })
    dispatchAfter(data.server, 'entityHealthChanged', { entity: data.entity, oldValue, newValue })
    if (newValue <= effectiveMin) {
      dispatchAfter(data.server, 'entityDie', { deadEntity: data.entity, damageSource })
    }
    return true
  },

  kill: (fake: object) => {
    const data = dataOf<EntityData>(fake)
    const health = healthOf(data)
    if (health === undefined) {
      killWithoutHealth(data.entity)
      return true
    }

    const currentValue = numberOf(health, 'currentValue')
    const effectiveMin = numberOf(health, 'effectiveMin')
    // A corpse already sits at the minimum: a second kill returns true and raises nothing.
    if (currentValue <= effectiveMin) {
      return true
    }

    const damageSource = sourceOf('selfDestruct')
    // The health lost, captured before the write; handlers observe post-write state, so the write
    // lands ahead of the whole cascade.
    const damage = currentValue - effectiveMin
    attributeOf(health).values.currentValue = effectiveMin
    dispatchAfter(data.server, 'entityHurt', { hurtEntity: data.entity, damage, damageSource })
    dispatchAfter(data.server, 'entityHealthChanged', {
      entity: data.entity,
      oldValue: currentValue,
      newValue: effectiveMin,
    })
    dispatchAfter(data.server, 'entityDie', { deadEntity: data.entity, damageSource })
    return true
  },
}

registerBehaviour('Entity', entityComponentBehaviour)
registerBehaviour('Player', entityComponentBehaviour)
