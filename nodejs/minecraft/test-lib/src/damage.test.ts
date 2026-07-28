/**
 * `entity.applyDamage` — its cascade, payloads, admission boolean, causes and quirks — and
 * `entity.kill()`'s health-bearing branch. The health-less branch of `kill()` is entity-model's.
 */

import type * as MC from '@minecraft/server'
import { beforeEach, describe, expect, it } from 'vitest'

import { addComponent, removeComponent } from './components.js'
import { createEntity, invalidate } from './entity.js'
import { createServer, type FakeServer } from './create-server.js'
import { InvalidEntityError, UnsetValueError } from './errors.js'

/** `EntityDamageCause` is types-only at runtime, so a cause is written as its string value. */
const cause = (value: string): MC.EntityDamageCause => value as MC.EntityDamageCause

/** The payload each recorded signal delivers. */
interface PayloadBySignal {
  entityHurtBefore: MC.EntityHurtBeforeEvent
  entityHurt: MC.EntityHurtAfterEvent
  entityHealthChanged: MC.EntityHealthChangedAfterEvent
  entityDie: MC.EntityDieAfterEvent
}

/** One delivered event, tagged with the signal that delivered it. */
type Recorded = {
  [K in keyof PayloadBySignal]: { readonly signal: K; readonly payload: PayloadBySignal[K] }
}[keyof PayloadBySignal]

/** Subscribes to the whole damage cascade, before-event included, in delivery order. */
const recordEvents = (server: FakeServer): Recorded[] => {
  const records: Recorded[] = []
  server.world.beforeEvents.entityHurt.subscribe((payload) => {
    records.push({ signal: 'entityHurtBefore', payload })
  })
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

/** The after-events delivered, in order — the cascade without the before-event. */
const afterEvents = (records: readonly Recorded[]): string[] =>
  delivered(records).filter((signal) => signal !== 'entityHurtBefore')

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

/** Calls a member past its declared signature — the arity cases. */
const callLoose = (target: object, member: string, ...args: unknown[]): unknown => {
  const fn = (target as Record<string, unknown>)[member] as (...rest: unknown[]) => unknown
  return fn.call(target, ...args)
}

describe('entity.applyDamage', () => {
  let server: FakeServer
  let entity: MC.Entity
  let health: MC.EntityHealthComponent
  let records: Recorded[]

  beforeEach(() => {
    server = createServer()
    entity = createEntity(server, { typeId: 'minecraft:sheep' })
    health = addComponent(entity, 'minecraft:health', [0, 8])
    records = recordEvents(server)
  })

  it('subtracts the amount from currentValue', () => {
    entity.applyDamage(2)
    expect(health.currentValue).toBe(6)
  })

  it('fires entityHurt then entityHealthChanged on a non-lethal hit', () => {
    entity.applyDamage(2)
    expect(afterEvents(records)).toEqual(['entityHurt', 'entityHealthChanged'])
  })

  it('fires entityHurt, entityHealthChanged, entityDie on a killing hit', () => {
    entity.applyDamage(2)
    records.length = 0
    entity.applyDamage(98)
    expect(afterEvents(records)).toEqual(['entityHurt', 'entityHealthChanged', 'entityDie'])
  })

  it('raises the entityHurt before-event ahead of the write', () => {
    let healthInsideHandler: number | undefined
    let damageInsideHandler: number | undefined
    server.world.beforeEvents.entityHurt.subscribe((payload) => {
      healthInsideHandler = health.currentValue
      damageInsideHandler = payload.damage
    })
    entity.applyDamage(2)
    expect(healthInsideHandler).toBe(8)
    expect(damageInsideHandler).toBe(2)
    expect(delivered(records)[0]).toBe('entityHurtBefore')
  })

  it('writes health before the cascade, so a handler observes post-write state', () => {
    let healthInHandler: number | undefined
    server.world.afterEvents.entityHurt.subscribe(() => {
      healthInHandler = health.currentValue
    })
    entity.applyDamage(2)
    expect(healthInHandler).toBe(6)
  })

  it('entityHurt.hurtEntity is the damaged entity', () => {
    entity.applyDamage(2)
    expect(only(records, 'entityHurt').hurtEntity).toBe(entity)
  })

  it('entityHealthChanged carries the old and new values', () => {
    entity.applyDamage(2)
    const changed = only(records, 'entityHealthChanged')
    expect(changed.entity).toBe(entity)
    expect(changed.oldValue).toBe(8)
    expect(changed.newValue).toBe(6)
  })

  it('entityDie.deadEntity is the entity', () => {
    entity.applyDamage(8)
    expect(only(records, 'entityDie').deadEntity).toBe(entity)
  })

  it('does not clamp health at the minimum', () => {
    entity.applyDamage(100)
    expect(health.currentValue).toBe(-92)
    expect(only(records, 'entityHealthChanged').newValue).toBe(-92)
  })

  it('entityHurt.damage carries the requested amount past remaining health', () => {
    entity.applyDamage(100)
    expect(only(records, 'entityHurt').damage).toBe(100)
  })

  it('does not round the damage', () => {
    expect(entity.applyDamage(0.5)).toBe(true)
    expect(health.currentValue).toBe(7.5)
    expect(only(records, 'entityHurt').damage).toBe(0.5)
    expect(only(records, 'entityHealthChanged').newValue).toBe(7.5)
  })

  it('returns true for a positive amount on a health-bearing entity', () => {
    expect(entity.applyDamage(2)).toBe(true)
  })

  it('returns false for amount 0 and fires nothing at all', () => {
    expect(entity.applyDamage(0)).toBe(false)
    expect(health.currentValue).toBe(8)
    expect(records).toEqual([])
  })

  it('returns false for a negative amount and fires nothing at all', () => {
    expect(entity.applyDamage(-1)).toBe(false)
    expect(health.currentValue).toBe(8)
    expect(records).toEqual([])
  })

  it('puts the admission boundary at zero, not one', () => {
    expect(entity.applyDamage(0)).toBe(false)
    expect(entity.applyDamage(0.5)).toBe(true)
  })

  it('settles admission before reading any value', () => {
    const other = createEntity(server, { typeId: 'minecraft:sheep' })
    addComponent(other, 'minecraft:health')
    expect(other.applyDamage(0)).toBe(false)
  })

  it('returns false and fires nothing with no health component', () => {
    const projectile = createEntity(server, { typeId: 'minecraft:arrow' })
    expect(projectile.applyDamage(4)).toBe(false)
    expect(records).toEqual([])
    expect(projectile.isValid).toBe(true)
  })

  it('the no-health no-op holds on the options form too', () => {
    const projectile = createEntity(server, { typeId: 'minecraft:arrow' })
    expect(projectile.applyDamage(4, { cause: cause('lava') })).toBe(false)
    expect(records).toEqual([])
  })

  it('reports cause none with no options', () => {
    entity.applyDamage(1)
    expect(only(records, 'entityHurt').damageSource.cause).toBe(cause('none'))
  })

  it('uses the cause given by the plain options form', () => {
    entity.applyDamage(2, { cause: cause('lava') })
    expect(only(records, 'entityHurt').damageSource.cause).toBe(cause('lava'))
  })

  it('reports cause projectile for the projectile options form', () => {
    const arrow = createEntity(server, { typeId: 'minecraft:arrow' })
    entity.applyDamage(1, { damagingProjectile: arrow })
    expect(only(records, 'entityHurt').damageSource.cause).toBe(cause('projectile'))
  })

  it('applies the requested amount on the projectile form', () => {
    // Divergence: the engine adjusts projectile damage by velocity.
    const arrow = createEntity(server, { typeId: 'minecraft:arrow' })
    entity.applyDamage(1, { damagingProjectile: arrow })
    expect(health.currentValue).toBe(7)
    expect(only(records, 'entityHurt').damage).toBe(1)
  })

  it('carries damagingEntity onto entityHurt.damageSource', () => {
    const attacker = createEntity(server, { typeId: 'minecraft:wolf' })
    entity.applyDamage(2, { cause: cause('entityAttack'), damagingEntity: attacker })
    expect(only(records, 'entityHurt').damageSource.damagingEntity).toBe(attacker)
  })

  it('carries damagingProjectile onto entityHurt.damageSource', () => {
    const arrow = createEntity(server, { typeId: 'minecraft:arrow' })
    entity.applyDamage(1, { damagingProjectile: arrow })
    expect(only(records, 'entityHurt').damageSource.damagingProjectile).toBe(arrow)
  })

  it('carries the same source onto the death payload', () => {
    const attacker = createEntity(server, { typeId: 'minecraft:wolf' })
    entity.applyDamage(8, { cause: cause('entityAttack'), damagingEntity: attacker })
    const die = only(records, 'entityDie')
    expect(die.damageSource.cause).toBe(cause('entityAttack'))
    expect(die.damageSource.damagingEntity).toBe(attacker)
  })

  it('is fatal on reaching effectiveMin exactly', () => {
    entity.applyDamage(8)
    expect(health.currentValue).toBe(0)
    expect(afterEvents(records)).toContain('entityDie')
  })

  it('survives one point above the minimum', () => {
    entity.applyDamage(7)
    expect(health.currentValue).toBe(1)
    expect(afterEvents(records)).not.toContain('entityDie')
  })

  it('takes the boundary from effectiveMin, not zero', () => {
    const other = createEntity(server, { typeId: 'minecraft:cow' })
    const bounded = addComponent(other, 'minecraft:health', [2, 10])
    other.applyDamage(7)
    expect(bounded.currentValue).toBe(3)
    expect(afterEvents(records)).not.toContain('entityDie')
    other.applyDamage(1)
    expect(bounded.currentValue).toBe(2)
    expect(afterEvents(records)).toContain('entityDie')
  })

  it("uses the damage's own cause on death, never override", () => {
    entity.applyDamage(8, { cause: cause('lava') })
    expect(only(records, 'entityDie').damageSource.cause).toBe(cause('lava'))
  })

  it('skips the bounds check on the damage path', () => {
    expect(entity.applyDamage(100)).toBe(true)
    expect(health.currentValue).toBe(-92)
  })

  it('has no invulnerability window', () => {
    // Divergence: the engine absorbs the second hit.
    expect(entity.applyDamage(2)).toBe(true)
    expect(entity.applyDamage(2)).toBe(true)
    expect(health.currentValue).toBe(4)
    expect(afterEvents(records)).toEqual(['entityHurt', 'entityHealthChanged', 'entityHurt', 'entityHealthChanged'])
  })

  it('returns true with nothing lost when the before-event is cancelled', () => {
    server.world.beforeEvents.entityHurt.subscribe((payload) => {
      payload.cancel = true
    })
    expect(entity.applyDamage(4)).toBe(true)
    expect(health.currentValue).toBe(8)
    expect(afterEvents(records)).toEqual([])
  })

  describe('the before-event damage field', () => {
    it('honours a handler lowering damage', () => {
      server.world.beforeEvents.entityHurt.subscribe((payload) => {
        payload.damage = 1
      })
      entity.applyDamage(4)
      expect(health.currentValue).toBe(7)
      expect(only(records, 'entityHurt').damage).toBe(1)
    })

    it('honours a handler raising damage, to the point of killing', () => {
      server.world.beforeEvents.entityHurt.subscribe((payload) => {
        payload.damage = 8
      })
      entity.applyDamage(1, { cause: cause('lava') })
      expect(health.currentValue).toBe(0)
      expect(only(records, 'entityDie').damageSource.cause).toBe(cause('lava'))
    })

    it('still returns true when a handler writes damage to 0', () => {
      server.world.beforeEvents.entityHurt.subscribe((payload) => {
        payload.damage = 0
      })
      expect(entity.applyDamage(4)).toBe(true)
      expect(health.currentValue).toBe(8)
      expect(afterEvents(records)).toEqual(['entityHurt', 'entityHealthChanged'])
      expect(only(records, 'entityHurt').damage).toBe(0)
      expect(only(records, 'entityHealthChanged').oldValue).toBe(8)
      expect(only(records, 'entityHealthChanged').newValue).toBe(8)
    })
  })

  describe('when a handler acts during the before-event', () => {
    it('writes nothing and fires nothing when the handler removed the entity', () => {
      server.world.beforeEvents.entityHurt.subscribe(() => {
        entity.remove()
      })
      expect(entity.applyDamage(4)).toBe(true)
      expect(afterEvents(records)).toEqual([])
    })

    it('writes nothing and fires nothing when the handler invalidated the entity', () => {
      server.world.beforeEvents.entityHurt.subscribe(() => {
        invalidate(entity)
      })
      expect(entity.applyDamage(4)).toBe(true)
      expect(afterEvents(records)).toEqual([])
    })

    it('writes nothing and fires nothing when the handler detached the health component', () => {
      server.world.beforeEvents.entityHurt.subscribe(() => {
        removeComponent(entity, 'minecraft:health')
      })
      expect(entity.applyDamage(4)).toBe(true)
      expect(afterEvents(records)).toEqual([])
      expect(entity.getComponent('minecraft:health')).toBeUndefined()
    })

    it('leaves a re-attached health component untouched', () => {
      server.world.beforeEvents.entityHurt.subscribe(() => {
        removeComponent(entity, 'minecraft:health')
        addComponent(entity, 'minecraft:health', [0, 8])
      })
      expect(entity.applyDamage(4)).toBe(true)
      expect(afterEvents(records)).toEqual([])
      expect(entity.getComponent('minecraft:health')?.currentValue).toBe(8)
    })
  })

  describe('unsupplied values and guards', () => {
    it('throws UnsetValueError when currentValue was never supplied', () => {
      const other = createEntity(server, { typeId: 'minecraft:sheep' })
      addComponent(other, 'minecraft:health', { effectiveMin: 0, effectiveMax: 8 })
      const error = throws(() => other.applyDamage(2))
      expect(error).toBeInstanceOf(UnsetValueError)
      expect((error as UnsetValueError).member).toContain('currentValue')
    })

    it('throws UnsetValueError when effectiveMin was never supplied', () => {
      const other = createEntity(server, { typeId: 'minecraft:sheep' })
      addComponent(other, 'minecraft:health', { currentValue: 8 })
      const error = throws(() => other.applyDamage(2))
      expect(error).toBeInstanceOf(UnsetValueError)
      expect((error as UnsetValueError).member).toContain('effectiveMin')
    })

    it('throws InvalidEntityError on an invalidated entity', () => {
      invalidate(entity)
      const error = throws(() => entity.applyDamage(2))
      expect(error).toBeInstanceOf(InvalidEntityError)
      expect(error.message).toBe(
        "Failed to call function 'applyDamage' due to Entity being invalid (has the Entity been removed?).",
      )
    })

    it('with no arguments throws TypeError first, valid or invalidated', () => {
      const first = throws(() => callLoose(entity, 'applyDamage'))
      expect(first).toBeInstanceOf(TypeError)
      expect(first.message).toBe('Incorrect number of arguments to function. Expected 1-2, received 0')

      invalidate(entity)
      const second = throws(() => callLoose(entity, 'applyDamage'))
      expect(second).toBeInstanceOf(TypeError)
      expect(second).not.toBeInstanceOf(InvalidEntityError)
    })
  })
})

describe('entity.kill', () => {
  describe('with a health component', () => {
    let server: FakeServer
    let entity: MC.Entity
    let health: MC.EntityHealthComponent
    let records: Recorded[]

    beforeEach(() => {
      server = createServer()
      entity = createEntity(server, { typeId: 'minecraft:sheep' })
      health = addComponent(entity, 'minecraft:health', [0, 8])
      records = recordEvents(server)
    })

    it('returns true', () => {
      expect(entity.kill()).toBe(true)
    })

    it('fires entityHurt, entityHealthChanged, entityDie in that order', () => {
      entity.kill()
      expect(afterEvents(records)).toEqual(['entityHurt', 'entityHealthChanged', 'entityDie'])
    })

    it('reports entityHurt.damage as the health lost, cause selfDestruct', () => {
      entity.kill()
      const hurt = only(records, 'entityHurt')
      expect(hurt.damage).toBe(8)
      expect(hurt.damageSource.cause).toBe(cause('selfDestruct'))
    })

    it('reports the health lost above a non-zero minimum', () => {
      const other = createEntity(server, { typeId: 'minecraft:cow' })
      addComponent(other, 'minecraft:health', [2, 10])
      other.kill()
      expect(only(records, 'entityHurt').damage).toBe(8)
    })

    it('sets health to exactly effectiveMin', () => {
      entity.kill()
      expect(health.currentValue).toBe(0)
      const changed = only(records, 'entityHealthChanged')
      expect(changed.oldValue).toBe(8)
      expect(changed.newValue).toBe(0)
    })

    it('fires entityDie with cause selfDestruct', () => {
      entity.kill()
      const die = only(records, 'entityDie')
      expect(die.damageSource.cause).toBe(cause('selfDestruct'))
      expect(die.deadEntity).toBe(entity)
    })

    it('a second kill() returns true and fires nothing', () => {
      entity.kill()
      records.length = 0
      expect(entity.kill()).toBe(true)
      expect(records).toEqual([])
    })

    it('leaves the reference valid', () => {
      entity.kill()
      expect(entity.isValid).toBe(true)
      expect(entity.getComponent('minecraft:health')).toBe(health)
    })

    it('raises no before-event', () => {
      entity.kill()
      expect(delivered(records)).not.toContain('entityHurtBefore')
    })

    it('writes health before the cascade, so a handler observes post-write state', () => {
      let healthInHurtHandler: number | undefined
      let healthInChangedHandler: number | undefined
      server.world.afterEvents.entityHurt.subscribe(() => {
        healthInHurtHandler = health.currentValue
      })
      server.world.afterEvents.entityHealthChanged.subscribe(() => {
        healthInChangedHandler = health.currentValue
      })
      entity.kill()
      expect(healthInHurtHandler).toBe(0)
      expect(healthInChangedHandler).toBe(0)
      expect(only(records, 'entityHurt').damage).toBe(8)
    })

    it('throws UnsetValueError when the health values are unset', () => {
      const other = createEntity(server, { typeId: 'minecraft:sheep' })
      addComponent(other, 'minecraft:health')
      const error = throws(() => other.kill())
      expect(error).toBeInstanceOf(UnsetValueError)
      expect((error as UnsetValueError).member).toContain('currentValue')
    })
  })
})
