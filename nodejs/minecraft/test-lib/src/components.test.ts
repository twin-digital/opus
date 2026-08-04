/**
 * Component attachment and detachment, id normalization, the seven attribute-shaped components,
 * the health-write cascade, the other 61 components, and the guard table on an invalid owner.
 *
 * `applyDamage` and `kill()` live in `damage.test.ts`.
 */

import type * as MC from '@minecraft/server'
import { beforeEach, describe, expect, it } from 'vitest'

import { addComponent, removeComponent } from './components.js'
import { createEntity, invalidate } from './entity.js'
import { createServer, type FakeServer } from './create-server.js'
import {
  ArgumentOutOfBoundsError,
  InvalidArgumentError,
  InvalidEntityError,
  NotImplementedError,
  UnsetValueError,
} from './errors.js'
import { COMPONENT_CLASS_BY_ID } from './generated/manifests.js'
import { ATTRIBUTE_COMPONENT_IDS, type EntityComponentId } from './ids.js'

/** `EntityDamageCause` is types-only at runtime, so a cause is written as its string value. */
const cause = (value: string): MC.EntityDamageCause => value as MC.EntityDamageCause

/** Every declared component id, and the 61 that are not attribute-shaped. */
const ALL_COMPONENT_IDS = Object.keys(COMPONENT_CLASS_BY_ID) as EntityComponentId[]
const OTHER_COMPONENT_IDS = ALL_COMPONENT_IDS.filter(
  (id) => !(ATTRIBUTE_COMPONENT_IDS as readonly string[]).includes(id),
)

/** The payload each recorded signal delivers. */
interface PayloadBySignal {
  entityHurt: MC.EntityHurtAfterEvent
  entityHealthChanged: MC.EntityHealthChangedAfterEvent
  entityDie: MC.EntityDieAfterEvent
}

/** One delivered after-event, tagged with the signal that delivered it. */
type Recorded = {
  [K in keyof PayloadBySignal]: { readonly signal: K; readonly payload: PayloadBySignal[K] }
}[keyof PayloadBySignal]

/** Subscribes to the three after-events a health write can raise, in delivery order. */
const recordEvents = (server: FakeServer): Recorded[] => {
  const records: Recorded[] = []
  server.world.afterEvents.entityHurt.subscribe((payload) => {
    records.push({ signal: 'entityHurt', payload })
  })
  server.world.afterEvents.entityHealthChanged.subscribe((payload) => {
    records.push({ signal: 'entityHealthChanged', payload })
  })
  server.world.afterEvents.entityDie.subscribe((payload) => {
    records.push({ signal: 'entityDie', payload })
  })
  return records
}

/** The signals delivered, in order. */
const delivered = (records: readonly Recorded[]): string[] => records.map((record) => record.signal)

/** The one payload delivered on a signal; fails the test where there is not exactly one. */
const only = <K extends keyof PayloadBySignal>(records: readonly Recorded[], signal: K): PayloadBySignal[K] => {
  const found = records.filter((record) => record.signal === signal)
  const [first] = found
  if (found.length !== 1) {
    throw new Error(`expected exactly one ${signal}, got ${String(found.length)}`)
  }
  return first.payload as PayloadBySignal[K]
}

/** The error a call threw, for assertions on its class, message and fields. */
const throws = (call: () => unknown): Error => {
  try {
    call()
  } catch (error) {
    if (error instanceof Error) {
      return error
    }
    throw new Error(`expected an Error, got ${String(error)}`, { cause: error })
  }
  throw new Error('expected a throw, but the call returned')
}

/** Calls a member past its declared signature — the arity and extra-argument cases. */
const callLoose = (target: object, member: string, ...args: unknown[]): unknown => {
  const fn = (target as Record<string, unknown>)[member] as (...rest: unknown[]) => unknown
  return fn.call(target, ...args)
}

describe('addComponent', () => {
  let server: FakeServer
  let entity: MC.Entity

  beforeEach(() => {
    server = createServer()
    entity = createEntity(server, { typeId: 'minecraft:sheep' })
  })

  it('attaches a component to a live entity and returns it', () => {
    const component = addComponent(entity, 'minecraft:health', 20)
    expect(entity.getComponent('minecraft:health')).toBe(component)
  })

  it('accepts the bare form and stores the canonical prefixed id', () => {
    const component = addComponent(entity, 'health', 20)
    expect(component.typeId).toBe('minecraft:health')
    expect(entity.getComponent('minecraft:health')).toBe(component)
  })

  it('hands back the exact component type, with no cast', () => {
    // `effectiveMax` is on EntityHealthComponent alone: this line is the assertion.
    const effectiveMax: number = addComponent(entity, 'minecraft:health', 20).effectiveMax
    expect(effectiveMax).toBe(20)
  })

  it('attaches a non-attribute component with no state', () => {
    const component = addComponent(entity, 'minecraft:tameable')
    expect(component.typeId).toBe('minecraft:tameable')
    expect(entity.hasComponent('minecraft:tameable')).toBe(true)
  })

  it('attaches every one of the 68 declared component ids', () => {
    expect(ALL_COMPONENT_IDS).toHaveLength(68)
    for (const id of ALL_COMPONENT_IDS) {
      const own = createEntity(server, { typeId: 'minecraft:sheep' })
      const component = addComponent(own, id)
      expect(component.typeId).toBe(id)
      expect(component.isValid).toBe(true)
    }
  })

  it('rejects the state argument on a non-attribute id', () => {
    const error = throws(() => addComponent(entity, 'minecraft:tameable', 20))
    expect(error).toBeInstanceOf(InvalidArgumentError)
    expect(error.name).toBe('InvalidArgumentError')
  })

  it('attaches nothing when the state argument is rejected', () => {
    throws(() => addComponent(entity, 'minecraft:tameable', 20))
    expect(entity.hasComponent('minecraft:tameable')).toBe(false)
    expect(entity.getComponents()).toEqual([])
  })

  it('rejects the state argument on a bare non-attribute id', () => {
    expect(() => addComponent(entity, 'tameable', 20)).toThrow(InvalidArgumentError)
  })

  it('rejects an id the declarations do not carry, naming it', () => {
    const unknownId = 'minecraft:not_a_component' as EntityComponentId
    const error = throws(() => addComponent(entity, unknownId))
    expect(error).toBeInstanceOf(InvalidArgumentError)
    expect(error.message).toContain('minecraft:not_a_component')
    expect(entity.getComponents()).toEqual([])
  })

  it('rejects an id already attached, naming it, and leaves the held component alone', () => {
    const held = addComponent(entity, 'minecraft:health', 20)
    const error = throws(() => addComponent(entity, 'minecraft:health', [0, 8]))
    expect(error).toBeInstanceOf(InvalidArgumentError)
    expect(error.message).toContain('minecraft:health')
    expect(held.currentValue).toBe(20)
    expect(held.effectiveMax).toBe(20)
    expect(entity.getComponent('minecraft:health')).toBe(held)
  })

  it('accepts the state argument on each of the seven attribute ids', () => {
    for (const id of ATTRIBUTE_COMPONENT_IDS) {
      const own = createEntity(server, { typeId: 'minecraft:sheep' })
      const component = addComponent(own, id, [0, 8])
      expect(component.effectiveMin).toBe(0)
      expect(component.effectiveMax).toBe(8)
      expect(component.currentValue).toBe(8)
    }
  })

  it('accepts an attribute id with no state at all', () => {
    const component = addComponent(entity, 'minecraft:health')
    expect(() => component.currentValue).toThrow(UnsetValueError)
    expect(() => component.defaultValue).toThrow(UnsetValueError)
    expect(() => component.effectiveMin).toThrow(UnsetValueError)
    expect(() => component.effectiveMax).toThrow(UnsetValueError)
  })

  it('stores a partial record verbatim', () => {
    const component = addComponent(entity, 'minecraft:health', { currentValue: 3, effectiveMax: 8 })
    expect(component.currentValue).toBe(3)
    expect(component.effectiveMax).toBe(8)
    expect(() => component.defaultValue).toThrow(UnsetValueError)
    expect(() => component.effectiveMin).toThrow(UnsetValueError)
  })

  it('the number shorthand is exactly the record it abbreviates', () => {
    const component = addComponent(entity, 'minecraft:health', 20)
    expect(component.currentValue).toBe(20)
    expect(component.effectiveMin).toBe(0)
    expect(component.effectiveMax).toBe(20)
    expect(() => component.defaultValue).toThrow(UnsetValueError)
  })

  it('the [min, max] shorthand is exactly the record it abbreviates', () => {
    const component = addComponent(entity, 'minecraft:health', [2, 10])
    expect(component.effectiveMin).toBe(2)
    expect(component.effectiveMax).toBe(10)
    expect(component.currentValue).toBe(10)
    expect(() => component.defaultValue).toThrow(UnsetValueError)
  })

  it('throws InvalidEntityError on an invalidated entity', () => {
    invalidate(entity)
    const error = throws(() => addComponent(entity, 'minecraft:health', 20))
    expect(error).toBeInstanceOf(InvalidEntityError)
  })
})

describe('removeComponent', () => {
  let server: FakeServer
  let entity: MC.Entity

  beforeEach(() => {
    server = createServer()
    entity = createEntity(server, { typeId: 'minecraft:sheep' })
  })

  it('detaches an attached component and returns true', () => {
    addComponent(entity, 'minecraft:health', 20)
    expect(removeComponent(entity, 'minecraft:health')).toBe(true)
    expect(entity.getComponent('minecraft:health')).toBeUndefined()
  })

  it('returns false for a component that was never attached', () => {
    expect(removeComponent(entity, 'minecraft:health')).toBe(false)
    expect(entity.getComponents()).toEqual([])
  })

  it('accepts the bare form', () => {
    addComponent(entity, 'minecraft:health', 20)
    expect(removeComponent(entity, 'health')).toBe(true)
  })

  it('returns false on a second removal', () => {
    addComponent(entity, 'minecraft:health', 20)
    expect(removeComponent(entity, 'minecraft:health')).toBe(true)
    expect(removeComponent(entity, 'minecraft:health')).toBe(false)
  })

  it('drops the component from getComponents()', () => {
    addComponent(entity, 'minecraft:health', 20)
    addComponent(entity, 'minecraft:tameable')
    removeComponent(entity, 'minecraft:health')
    expect(entity.getComponents().map((component) => component.typeId)).toEqual(['minecraft:tameable'])
  })

  it('turns the detached reference invalid while typeId stays readable', () => {
    const held = addComponent(entity, 'minecraft:health', 20)
    removeComponent(entity, 'minecraft:health')
    expect(held.isValid).toBe(false)
    expect(held.typeId).toBe('minecraft:health')
  })

  it("a detached attribute component's value getters throw the invalid-owner shape", () => {
    const held = addComponent(entity, 'minecraft:health', 20)
    removeComponent(entity, 'minecraft:health')
    const error = throws(() => held.currentValue)
    expect(error.constructor).toBe(Error)
    expect(error).not.toBeInstanceOf(InvalidEntityError)
    expect(error.message).toBe("Failed to get property 'current'.")
  })

  it('a detached attribute component throws InvalidEntityError where an invalid owner would', () => {
    const held = addComponent(entity, 'minecraft:health', 20)
    removeComponent(entity, 'minecraft:health')
    expect(throws(() => held.setCurrentValue(1))).toBeInstanceOf(InvalidEntityError)
    expect(throws(() => held.entity)).toBeInstanceOf(InvalidEntityError)
  })

  it('a detached attribute component throws the plain Error shapes on its resets', () => {
    const held = addComponent(entity, 'minecraft:health', 20)
    removeComponent(entity, 'minecraft:health')
    const error = throws(() => {
      held.resetToMinValue()
    })
    expect(error.constructor).toBe(Error)
    expect(error.message).toBe("Failed to call function 'resetToMinValue'.")
  })

  it('a detached non-attribute component behaves as one on an invalid owner', () => {
    const held = addComponent(entity, 'minecraft:color')
    removeComponent(entity, 'minecraft:color')
    expect(held.isValid).toBe(false)
    expect(held.typeId).toBe('minecraft:color')
    expect(throws(() => held.entity)).toBeInstanceOf(InvalidEntityError)
    // The guard beats NotImplementedError on a detached reference too.
    expect(throws(() => held.value)).toBeInstanceOf(InvalidEntityError)
  })

  it('throws InvalidEntityError on an invalidated entity', () => {
    addComponent(entity, 'minecraft:health', 20)
    invalidate(entity)
    const error = throws(() => removeComponent(entity, 'minecraft:health'))
    expect(error).toBeInstanceOf(InvalidEntityError)
  })
})

describe('entity.getComponent / getComponents / hasComponent', () => {
  let server: FakeServer
  let entity: MC.Entity

  beforeEach(() => {
    server = createServer()
    entity = createEntity(server, { typeId: 'minecraft:sheep' })
  })

  it('returns undefined for a component that is not attached', () => {
    expect(entity.getComponent('minecraft:health')).toBeUndefined()
  })

  it('accepts the bare form', () => {
    addComponent(entity, 'minecraft:health', 20)
    expect(entity.getComponent('health')).toBe(entity.getComponent('minecraft:health'))
  })

  it('returns a stable reference across calls', () => {
    addComponent(entity, 'minecraft:health', 20)
    expect(entity.getComponent('minecraft:health')).toBe(entity.getComponent('minecraft:health'))
  })

  it('getComponents() is empty on a freshly created entity', () => {
    // Divergence: in the engine a fresh entity always carries at least one component.
    expect(entity.getComponents()).toEqual([])
  })

  it('getComponents() returns attached components in attachment order', () => {
    addComponent(entity, 'minecraft:health', 20)
    addComponent(entity, 'minecraft:tameable')
    addComponent(entity, 'minecraft:movement', 0.25)
    expect(entity.getComponents().map((component) => component.typeId)).toEqual([
      'minecraft:health',
      'minecraft:tameable',
      'minecraft:movement',
    ])
  })

  it('hasComponent is true for an attached id in either form', () => {
    addComponent(entity, 'minecraft:health', 20)
    expect(entity.hasComponent('minecraft:health')).toBe(true)
    expect(entity.hasComponent('health')).toBe(true)
  })

  it('hasComponent is false for one not attached', () => {
    expect(entity.hasComponent('minecraft:health')).toBe(false)
  })

  it('getComponent with no arguments throws TypeError first', () => {
    const error = throws(() => callLoose(entity, 'getComponent'))
    expect(error).toBeInstanceOf(TypeError)
    expect(error.message).toBe('Incorrect number of arguments to function. Expected 1, received 0')
  })

  it('arity beats the validity guard', () => {
    invalidate(entity)
    const error = throws(() => callLoose(entity, 'getComponent'))
    expect(error).toBeInstanceOf(TypeError)
    expect(error).not.toBeInstanceOf(InvalidEntityError)
  })

  it('getComponent on an invalidated entity throws InvalidEntityError', () => {
    invalidate(entity)
    const error = throws(() => entity.getComponent('minecraft:health'))
    expect(error).toBeInstanceOf(InvalidEntityError)
    expect(error.message).toBe(
      "Failed to call function 'getComponent' due to Entity being invalid (has the Entity been removed?).",
    )
    expect((error as InvalidEntityError).id).toBe(entity.id)
    expect((error as InvalidEntityError).type).toBe('minecraft:sheep')
  })

  it('refuses a surplus argument', () => {
    addComponent(entity, 'minecraft:health', 20)
    expect(() => callLoose(entity, 'getComponent', 'minecraft:health', 'extra')).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 1, received 2'),
    )
  })
})

describe('attribute component values', () => {
  let server: FakeServer
  let entity: MC.Entity

  beforeEach(() => {
    server = createServer()
    entity = createEntity(server, { typeId: 'minecraft:sheep' })
  })

  it('holds the four supplied numbers', () => {
    const component = addComponent(entity, 'minecraft:health', {
      currentValue: 5,
      defaultValue: 6,
      effectiveMin: 1,
      effectiveMax: 8,
    })
    expect(component.currentValue).toBe(5)
    expect(component.defaultValue).toBe(6)
    expect(component.effectiveMin).toBe(1)
    expect(component.effectiveMax).toBe(8)
  })

  it('currentValue unsupplied throws UnsetValueError', () => {
    const component = addComponent(entity, 'minecraft:health', { effectiveMax: 8 })
    const error = throws(() => component.currentValue)
    expect(error).toBeInstanceOf(UnsetValueError)
    expect((error as UnsetValueError).member).toContain('currentValue')
  })

  it('defaultValue unsupplied throws UnsetValueError', () => {
    const component = addComponent(entity, 'minecraft:health', { effectiveMax: 8 })
    const error = throws(() => component.defaultValue)
    expect(error).toBeInstanceOf(UnsetValueError)
    expect((error as UnsetValueError).member).toContain('defaultValue')
  })

  it('effectiveMin unsupplied throws UnsetValueError', () => {
    const component = addComponent(entity, 'minecraft:health', { effectiveMax: 8 })
    const error = throws(() => component.effectiveMin)
    expect(error).toBeInstanceOf(UnsetValueError)
    expect((error as UnsetValueError).member).toContain('effectiveMin')
  })

  it('effectiveMax unsupplied throws UnsetValueError', () => {
    const component = addComponent(entity, 'minecraft:health', { currentValue: 8 })
    const error = throws(() => component.effectiveMax)
    expect(error).toBeInstanceOf(UnsetValueError)
    expect((error as UnsetValueError).member).toContain('effectiveMax')
  })

  it('the seven attribute components all behave alike', () => {
    for (const id of ATTRIBUTE_COMPONENT_IDS) {
      const own = createEntity(server, { typeId: 'minecraft:sheep' })
      const component = addComponent(own, id, [0, 8])
      expect(component.effectiveMin).toBe(0)
      expect(component.effectiveMax).toBe(8)
      expect(component.setCurrentValue(4)).toBe(true)
      expect(component.currentValue).toBe(4)
    }
  })

  it('typeId reports the canonical id', () => {
    expect(addComponent(entity, 'health', 20).typeId).toBe('minecraft:health')
  })

  it('isValid is true on a live owner', () => {
    expect(addComponent(entity, 'minecraft:health', 20).isValid).toBe(true)
  })

  it('entity returns the owning entity', () => {
    expect(addComponent(entity, 'minecraft:health', 20).entity).toBe(entity)
  })
})

describe('setCurrentValue', () => {
  let server: FakeServer
  let entity: MC.Entity

  beforeEach(() => {
    server = createServer()
    entity = createEntity(server, { typeId: 'minecraft:sheep' })
  })

  it('writes the value and returns true', () => {
    const health = addComponent(entity, 'minecraft:health', [0, 8])
    expect(health.setCurrentValue(3)).toBe(true)
    expect(health.currentValue).toBe(3)
  })

  it('accepts a value exactly at effectiveMax', () => {
    const health = addComponent(entity, 'minecraft:health', [0, 8])
    expect(health.setCurrentValue(8)).toBe(true)
  })

  it('accepts a value exactly at effectiveMin', () => {
    const health = addComponent(entity, 'minecraft:health', [0, 8])
    expect(health.setCurrentValue(0)).toBe(true)
  })

  it('throws ArgumentOutOfBoundsError above the max, with the engine message', () => {
    const health = addComponent(entity, 'minecraft:health', [0, 8])
    const error = throws(() => health.setCurrentValue(1008))
    expect(error).toBeInstanceOf(ArgumentOutOfBoundsError)
    expect(error.name).toBe('ArgumentOutOfBoundsError')
    expect(error.message).toBe(
      'Unsupported or out of bounds value passed to function argument [0]: value, Value: 1008, Argument bounds: [0, 8]',
    )
  })

  it('throws ArgumentOutOfBoundsError below the min, with the engine message', () => {
    const health = addComponent(entity, 'minecraft:health', [0, 8])
    const error = throws(() => health.setCurrentValue(-1000))
    expect(error).toBeInstanceOf(ArgumentOutOfBoundsError)
    expect(error.message).toBe(
      'Unsupported or out of bounds value passed to function argument [0]: value, Value: -1000, Argument bounds: [0, 8]',
    )
  })

  it('a rejected write changes nothing', () => {
    const records = recordEvents(server)
    const health = addComponent(entity, 'minecraft:health', [0, 8])
    throws(() => health.setCurrentValue(1008))
    expect(health.currentValue).toBe(8)
    expect(records).toEqual([])
  })

  it('throws UnsetValueError when effectiveMin was never supplied', () => {
    const health = addComponent(entity, 'minecraft:health', { currentValue: 5, effectiveMax: 8 })
    const error = throws(() => health.setCurrentValue(4))
    expect(error).toBeInstanceOf(UnsetValueError)
    expect((error as UnsetValueError).member).toContain('effectiveMin')
  })

  it('throws UnsetValueError when effectiveMax was never supplied', () => {
    const health = addComponent(entity, 'minecraft:health', { currentValue: 5, effectiveMin: 0 })
    const error = throws(() => health.setCurrentValue(4))
    expect(error).toBeInstanceOf(UnsetValueError)
    expect((error as UnsetValueError).member).toContain('effectiveMax')
  })

  it('with no arguments throws TypeError first', () => {
    const health = addComponent(entity, 'minecraft:health', [0, 8])
    const error = throws(() => callLoose(health, 'setCurrentValue'))
    expect(error).toBeInstanceOf(TypeError)
    expect(error.message).toBe('Incorrect number of arguments to function. Expected 1, received 0')
  })

  it('a non-health attribute write fires nothing', () => {
    const records = recordEvents(server)
    const movement = addComponent(entity, 'minecraft:movement', [0, 8])
    movement.setCurrentValue(3)
    expect(records).toEqual([])
  })
})

describe('the three resets', () => {
  let server: FakeServer
  let entity: MC.Entity

  beforeEach(() => {
    server = createServer()
    entity = createEntity(server, { typeId: 'minecraft:sheep' })
  })

  it('resetToDefaultValue sets currentValue to defaultValue', () => {
    const health = addComponent(entity, 'minecraft:health', {
      currentValue: 3,
      defaultValue: 6,
      effectiveMin: 0,
      effectiveMax: 8,
    })
    health.resetToDefaultValue()
    expect(health.currentValue).toBe(6)
  })

  it('resetToMaxValue sets currentValue to effectiveMax', () => {
    const health = addComponent(entity, 'minecraft:health', { currentValue: 3, effectiveMin: 0, effectiveMax: 8 })
    health.resetToMaxValue()
    expect(health.currentValue).toBe(8)
  })

  it('resetToMinValue sets currentValue to effectiveMin exactly', () => {
    const health = addComponent(entity, 'minecraft:health', [0, 8])
    health.resetToMinValue()
    expect(health.currentValue).toBe(0)
  })

  it('resetToDefaultValue throws UnsetValueError with no default', () => {
    const health = addComponent(entity, 'minecraft:health', [0, 8])
    const error = throws(() => {
      health.resetToDefaultValue()
    })
    expect(error).toBeInstanceOf(UnsetValueError)
    expect((error as UnsetValueError).member).toContain('defaultValue')
    expect(health.currentValue).toBe(8)
  })

  it('resetToMaxValue throws UnsetValueError with no max', () => {
    const health = addComponent(entity, 'minecraft:health', { currentValue: 3 })
    const error = throws(() => {
      health.resetToMaxValue()
    })
    expect(error).toBeInstanceOf(UnsetValueError)
    expect((error as UnsetValueError).member).toContain('effectiveMax')
  })

  it('resetToMinValue throws UnsetValueError with no min', () => {
    const health = addComponent(entity, 'minecraft:health', { currentValue: 3 })
    const error = throws(() => {
      health.resetToMinValue()
    })
    expect(error).toBeInstanceOf(UnsetValueError)
    expect((error as UnsetValueError).member).toContain('effectiveMin')
  })

  it('a reset ignores the bounds check', () => {
    const health = addComponent(entity, 'minecraft:health', {
      currentValue: 3,
      defaultValue: 99,
      effectiveMin: 0,
      effectiveMax: 8,
    })
    health.resetToDefaultValue()
    expect(health.currentValue).toBe(99)
  })

  it('the resets return undefined', () => {
    const health = addComponent(entity, 'minecraft:health', {
      currentValue: 3,
      defaultValue: 6,
      effectiveMin: 0,
      effectiveMax: 8,
    })
    expect(callLoose(health, 'resetToDefaultValue')).toBeUndefined()
    expect(callLoose(health, 'resetToMaxValue')).toBeUndefined()
    expect(callLoose(health, 'resetToMinValue')).toBeUndefined()
  })

  it('resets on a non-health attribute fire nothing', () => {
    const records = recordEvents(server)
    const hunger = addComponent(entity, 'minecraft:player.hunger', [0, 20])
    hunger.resetToMinValue()
    expect(records).toEqual([])
  })
})

describe('the health-write cascade', () => {
  let server: FakeServer
  let entity: MC.Entity
  let records: Recorded[]

  beforeEach(() => {
    server = createServer()
    entity = createEntity(server, { typeId: 'minecraft:sheep' })
    records = recordEvents(server)
  })

  it('setCurrentValue fires entityHealthChanged and never entityHurt', () => {
    addComponent(entity, 'minecraft:health', [0, 8]).setCurrentValue(3)
    expect(delivered(records)).toEqual(['entityHealthChanged'])
    const changed = only(records, 'entityHealthChanged')
    expect(changed.entity).toBe(entity)
    expect(changed.oldValue).toBe(8)
    expect(changed.newValue).toBe(3)
  })

  it('resetToMaxValue fires entityHealthChanged', () => {
    addComponent(entity, 'minecraft:health', {
      currentValue: 3,
      effectiveMin: 0,
      effectiveMax: 8,
    }).resetToMaxValue()
    expect(delivered(records)).toEqual(['entityHealthChanged'])
    expect(only(records, 'entityHealthChanged').oldValue).toBe(3)
    expect(only(records, 'entityHealthChanged').newValue).toBe(8)
  })

  it('resetToMinValue fires entityHealthChanged then entityDie with cause override', () => {
    addComponent(entity, 'minecraft:health', [0, 8]).resetToMinValue()
    expect(delivered(records)).toEqual(['entityHealthChanged', 'entityDie'])
    expect(only(records, 'entityHealthChanged').oldValue).toBe(8)
    expect(only(records, 'entityHealthChanged').newValue).toBe(0)
    const die = only(records, 'entityDie')
    expect(die.damageSource.cause).toBe(cause('override'))
    expect(die.deadEntity).toBe(entity)
  })

  it('resetToDefaultValue onto the minimum also dies with cause override', () => {
    addComponent(entity, 'minecraft:health', {
      currentValue: 8,
      defaultValue: 0,
      effectiveMin: 0,
      effectiveMax: 8,
    }).resetToDefaultValue()
    expect(delivered(records)).toEqual(['entityHealthChanged', 'entityDie'])
    expect(only(records, 'entityDie').damageSource.cause).toBe(cause('override'))
  })

  it('setCurrentValue onto the minimum dies with cause override and still returns true', () => {
    expect(addComponent(entity, 'minecraft:health', [0, 8]).setCurrentValue(0)).toBe(true)
    expect(delivered(records)).toEqual(['entityHealthChanged', 'entityDie'])
    expect(only(records, 'entityDie').damageSource.cause).toBe(cause('override'))
  })

  it('a write one above the minimum does not die', () => {
    addComponent(entity, 'minecraft:health', [0, 8]).setCurrentValue(1)
    expect(delivered(records)).toEqual(['entityHealthChanged'])
    expect(only(records, 'entityHealthChanged').newValue).toBe(1)
  })

  it('the minimum boundary holds on a non-zero minimum', () => {
    const health = addComponent(entity, 'minecraft:health', [2, 10])
    health.setCurrentValue(3)
    expect(delivered(records)).toEqual(['entityHealthChanged'])
    health.setCurrentValue(2)
    expect(delivered(records)).toEqual(['entityHealthChanged', 'entityHealthChanged', 'entityDie'])
  })

  it('fires no entityHurt on any component write', () => {
    const health = addComponent(entity, 'minecraft:health', {
      currentValue: 8,
      defaultValue: 4,
      effectiveMin: 0,
      effectiveMax: 8,
    })
    health.setCurrentValue(3)
    health.resetToMaxValue()
    health.resetToDefaultValue()
    health.resetToMinValue()
    expect(delivered(records).filter((signal) => signal === 'entityHurt')).toEqual([])
  })

  it('settles death from the value written, not from what a handler did after', () => {
    const health = addComponent(entity, 'minecraft:health', [0, 8])
    let healed = false
    server.world.afterEvents.entityHealthChanged.subscribe((payload) => {
      if (payload.newValue === 0 && !healed) {
        healed = true
        health.setCurrentValue(8)
      }
    })
    health.resetToMinValue()
    expect(delivered(records)).toEqual(['entityHealthChanged', 'entityHealthChanged', 'entityDie'])
    expect(health.currentValue).toBe(8)
  })

  it('a write that changes nothing still fires entityHealthChanged', () => {
    addComponent(entity, 'minecraft:health', [0, 8]).setCurrentValue(8)
    expect(delivered(records)).toEqual(['entityHealthChanged'])
    const changed = only(records, 'entityHealthChanged')
    expect(changed.oldValue).toBe(8)
    expect(changed.newValue).toBe(8)
  })
})

describe('the other 61 components', () => {
  let server: FakeServer
  let entity: MC.Entity

  beforeEach(() => {
    server = createServer()
    entity = createEntity(server, { typeId: 'minecraft:sheep' })
  })

  it('attaches and reports its canonical typeId', () => {
    expect(OTHER_COMPONENT_IDS).toHaveLength(61)
    for (const id of OTHER_COMPONENT_IDS) {
      const own = createEntity(server, { typeId: 'minecraft:sheep' })
      expect(addComponent(own, id).typeId).toBe(id)
    }
  })

  it('isValid is true on a live owner', () => {
    for (const id of OTHER_COMPONENT_IDS) {
      const own = createEntity(server, { typeId: 'minecraft:sheep' })
      expect(addComponent(own, id).isValid).toBe(true)
    }
  })

  it('entity returns the owner', () => {
    expect(addComponent(entity, 'minecraft:tameable').entity).toBe(entity)
  })

  it('isValid follows the owner', () => {
    const tameable = addComponent(entity, 'minecraft:tameable')
    invalidate(entity)
    expect(tameable.isValid).toBe(false)
  })

  it('an unmodelled property throws NotImplementedError', () => {
    const color = addComponent(entity, 'minecraft:color')
    const error = throws(() => color.value)
    expect(error).toBeInstanceOf(NotImplementedError)
    expect((error as NotImplementedError).member).toBe('EntityColorComponent.value')
  })

  it('an unmodelled method throws NotImplementedError', () => {
    const family = addComponent(entity, 'minecraft:type_family')
    const error = throws(() => family.getTypeFamilies())
    expect(error).toBeInstanceOf(NotImplementedError)
    expect((error as NotImplementedError).member).toBe('EntityTypeFamilyComponent.getTypeFamilies')
  })

  it('an unmodelled member declared T | undefined still throws', () => {
    const tameable = addComponent(entity, 'minecraft:tameable')
    const error = throws(() => tameable.tamedToPlayerId)
    expect(error).toBeInstanceOf(NotImplementedError)
    expect((error as NotImplementedError).member).toBe('EntityTameableComponent.tamedToPlayerId')
  })

  it('the validity guard beats NotImplementedError', () => {
    const color = addComponent(entity, 'minecraft:color')
    invalidate(entity)
    const error = throws(() => color.value)
    expect(error).toBeInstanceOf(InvalidEntityError)
    expect(error).not.toBeInstanceOf(NotImplementedError)
  })
})

describe('the guard table on an invalid owner', () => {
  let server: FakeServer
  let entity: MC.Entity
  let health: MC.EntityHealthComponent

  beforeEach(() => {
    server = createServer()
    entity = createEntity(server, { typeId: 'minecraft:sheep' })
    health = addComponent(entity, 'minecraft:health', [0, 8])
    invalidate(entity)
  })

  it('isValid stays readable and reads false', () => {
    expect(health.isValid).toBe(false)
  })

  it('typeId stays readable', () => {
    expect(health.typeId).toBe('minecraft:health')
  })

  it("currentValue throws a plain Error naming 'current'", () => {
    const error = throws(() => health.currentValue)
    expect(error.constructor).toBe(Error)
    expect(error).not.toBeInstanceOf(InvalidEntityError)
    expect(error.message).toBe("Failed to get property 'current'.")
  })

  it("defaultValue throws a plain Error naming 'value'", () => {
    const error = throws(() => health.defaultValue)
    expect(error.constructor).toBe(Error)
    expect(error.message).toBe("Failed to get property 'value'.")
  })

  it("effectiveMax throws a plain Error naming 'effectiveMaxValue'", () => {
    const error = throws(() => health.effectiveMax)
    expect(error.constructor).toBe(Error)
    expect(error.message).toBe("Failed to get property 'effectiveMaxValue'.")
  })

  it("effectiveMin throws a plain Error naming 'effectiveMinValue'", () => {
    const error = throws(() => health.effectiveMin)
    expect(error.constructor).toBe(Error)
    expect(error.message).toBe("Failed to get property 'effectiveMinValue'.")
  })

  it('resetToDefaultValue throws a plain Error', () => {
    const error = throws(() => {
      health.resetToDefaultValue()
    })
    expect(error.constructor).toBe(Error)
    expect(error.message).toBe("Failed to call function 'resetToDefaultValue'.")
  })

  it('resetToMaxValue throws a plain Error', () => {
    const error = throws(() => {
      health.resetToMaxValue()
    })
    expect(error.constructor).toBe(Error)
    expect(error.message).toBe("Failed to call function 'resetToMaxValue'.")
  })

  it('resetToMinValue throws a plain Error', () => {
    const error = throws(() => {
      health.resetToMinValue()
    })
    expect(error.constructor).toBe(Error)
    expect(error.message).toBe("Failed to call function 'resetToMinValue'.")
  })

  it("setCurrentValue throws InvalidEntityError naming 'setCurrent'", () => {
    const error = throws(() => health.setCurrentValue(1))
    expect(error).toBeInstanceOf(InvalidEntityError)
    expect(error.name).toBe('InvalidEntityError')
    expect(error.message).toBe(
      "Failed to set property 'setCurrent' due to Entity being invalid (has the Entity been removed?).",
    )
    expect((error as InvalidEntityError).id).toBe(entity.id)
    expect((error as InvalidEntityError).type).toBe('minecraft:sheep')
  })

  it('entity throws InvalidEntityError', () => {
    const error = throws(() => health.entity)
    expect(error).toBeInstanceOf(InvalidEntityError)
    expect(error.message).toBe(
      "Failed to get property 'entity' due to Entity being invalid (has the Entity been removed?).",
    )
  })

  it('setCurrentValue with no arguments throws TypeError on an invalid owner', () => {
    const error = throws(() => callLoose(health, 'setCurrentValue'))
    expect(error).toBeInstanceOf(TypeError)
    expect(error).not.toBeInstanceOf(InvalidEntityError)
  })

  it('remove() on the owner reaches the same table', () => {
    const other = createEntity(server, { typeId: 'minecraft:sheep' })
    const removed = addComponent(other, 'minecraft:health', [0, 8])
    other.remove()
    expect(removed.isValid).toBe(false)
    expect(removed.typeId).toBe('minecraft:health')
    expect(throws(() => removed.currentValue).message).toBe("Failed to get property 'current'.")
    expect(throws(() => removed.setCurrentValue(1))).toBeInstanceOf(InvalidEntityError)
  })
})

describe('instance scoping and read-order rules', () => {
  it('two bundles share no component state', () => {
    const first = createServer()
    const second = createServer()
    const firstEntity = createEntity(first, { typeId: 'minecraft:sheep' })
    const secondEntity = createEntity(second, { typeId: 'minecraft:sheep' })
    const secondRecords = recordEvents(second)

    addComponent(firstEntity, 'minecraft:health', [0, 8]).setCurrentValue(3)

    expect(secondEntity.getComponent('minecraft:health')).toBeUndefined()
    expect(secondRecords).toEqual([])
  })

  it('a getComponent read never fabricates', () => {
    const server = createServer()
    const entity = createEntity(server, { typeId: 'minecraft:sheep' })
    addComponent(entity, 'minecraft:health')
    const health = entity.getComponent('minecraft:health')
    expect(health).toBeDefined()
    expect(() => health?.currentValue).toThrow(UnsetValueError)
  })

  it('hasComponent with no arguments throws TypeError', () => {
    const server = createServer()
    const entity = createEntity(server, { typeId: 'minecraft:sheep' })
    const error = throws(() => callLoose(entity, 'hasComponent'))
    expect(error).toBeInstanceOf(TypeError)
    expect(error.message).toBe('Incorrect number of arguments to function. Expected 1, received 0')
  })

  it('getComponents() on an invalidated entity throws InvalidEntityError', () => {
    const server = createServer()
    const entity = createEntity(server, { typeId: 'minecraft:sheep' })
    invalidate(entity)
    const error = throws(() => entity.getComponents())
    expect(error).toBeInstanceOf(InvalidEntityError)
    expect(error.message).toBe(
      "Failed to call function 'getComponents' due to Entity being invalid (has the Entity been removed?).",
    )
  })
})
