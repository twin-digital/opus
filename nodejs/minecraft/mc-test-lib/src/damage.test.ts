import type { Entity, World } from '@minecraft/server'
import { describe, expect, it } from 'vitest'

import { createWorld, EntityDamageCause, invalidate, livingMob, spawnFake } from './index.js'

const spawnMob = (world: World): Entity => spawnFake(world, { ...livingMob, typeId: 'minecraft:zombie' })

/** Subscribes all three damage-path signals, recording labeled entries in call order. */
const recordEvents = (world: World): string[] => {
  const seen: string[] = []
  world.afterEvents.entityHurt.subscribe((event) => {
    seen.push(`hurt:${event.damage}:${event.damageSource.cause}`)
  })
  world.afterEvents.entityHealthChanged.subscribe((event) => {
    seen.push(`health:${event.oldValue}->${event.newValue}`)
  })
  world.afterEvents.entityDie.subscribe((event) => {
    seen.push(`die:${event.damageSource.cause}`)
  })
  return seen
}

describe('applyDamage', () => {
  // DM1: behaviour, not recording — assert the resulting state.
  it('lowers health and returns true', () => {
    const entity = spawnMob(createWorld())
    expect(entity.applyDamage(5)).toBe(true)
    expect(entity.getComponent('minecraft:health')?.currentValue).toBe(15)
  })

  // DM2: clamped at the effective minimum.
  it('clamps at the effective minimum', () => {
    const entity = spawnMob(createWorld())
    expect(entity.applyDamage(50)).toBe(true)
    expect(entity.getComponent('minecraft:health')?.currentValue).toBe(0)
  })

  // DM3: the documented "takes any damage" contract — false, and nothing fires.
  it('returns false and fires nothing when no damage is taken', () => {
    const world = createWorld()
    const seen = recordEvents(world)

    const healthy = spawnMob(world)
    expect(healthy.applyDamage(0)).toBe(false)
    expect(healthy.applyDamage(-5)).toBe(false)
    expect(healthy.getComponent('minecraft:health')?.currentValue).toBe(20)

    const bare = spawnFake(world, { typeId: 'minecraft:zombie' })
    expect(bare.applyDamage(5)).toBe(false)
    expect(seen).toEqual([])

    const dead = spawnMob(world)
    dead.applyDamage(20)
    seen.length = 0
    expect(dead.applyDamage(5)).toBe(false)
    expect(seen).toEqual([])
  })

  // DM4 + DM5: fixed dispatch order with post-write state visible to handlers.
  it('dispatches hurt, then healthChanged, then die, synchronously after the write', () => {
    const world = createWorld()
    const seen = recordEvents(world)
    const entity = spawnMob(world)

    world.afterEvents.entityHurt.subscribe(() => {
      seen.push(`observed:${entity.getComponent('minecraft:health')?.currentValue ?? NaN}`)
    })

    entity.applyDamage(5)
    expect(seen).toEqual(['hurt:5:none', 'observed:15', 'health:20->15'])

    seen.length = 0
    entity.applyDamage(15)
    expect(seen).toEqual(['hurt:15:none', 'observed:0', 'health:15->0', 'die:none'])
  })

  // DM5: payload identities.
  it('carries the entity handles in the payloads', () => {
    const world = createWorld()
    const entity = spawnMob(world)
    const hurtEntities: Entity[] = []
    const deadEntities: Entity[] = []
    world.afterEvents.entityHurt.subscribe((event) => hurtEntities.push(event.hurtEntity))
    world.afterEvents.entityDie.subscribe((event) => deadEntities.push(event.deadEntity))

    entity.applyDamage(20)
    expect(hurtEntities).toHaveLength(1)
    expect(hurtEntities[0]).toBe(entity)
    expect(deadEntities).toHaveLength(1)
    expect(deadEntities[0]).toBe(entity)
  })

  // DM6: damageSource carries the caller's options; cause defaults to none.
  it('builds damageSource from the caller options', () => {
    const world = createWorld()
    const entity = spawnMob(world)
    const attacker = spawnMob(world)
    const arrow = spawnFake(world, { typeId: 'minecraft:arrow' })

    const sources: { cause: string; damagingEntity?: Entity; damagingProjectile?: Entity }[] = []
    world.afterEvents.entityHurt.subscribe((event) => sources.push(event.damageSource))

    entity.applyDamage(1)
    entity.applyDamage(1, { cause: EntityDamageCause.fire, damagingEntity: attacker })
    entity.applyDamage(1, { damagingProjectile: arrow, damagingEntity: attacker })

    // Handle fields are asserted by identity: FakeEntity keeps its state in private fields,
    // so toEqual would treat any two handles as equal.
    expect(sources[0]?.cause).toBe('none')
    expect(sources[0]?.damagingEntity).toBeUndefined()
    expect(sources[0]?.damagingProjectile).toBeUndefined()
    expect(sources[1]?.cause).toBe('fire')
    expect(sources[1]?.damagingEntity).toBe(attacker)
    expect(sources[1]?.damagingProjectile).toBeUndefined()
    expect(sources[2]?.cause).toBe('none')
    expect(sources[2]?.damagingEntity).toBe(attacker)
    expect(sources[2]?.damagingProjectile).toBe(arrow)
  })

  // DM9: a behaving death does not invalidate.
  it('leaves the reference valid after a lethal hit', () => {
    const world = createWorld()
    const entity = spawnMob(world)
    entity.applyDamage(20)

    expect(entity.isValid).toBe(true)
    expect(entity.id).toBeDefined()
    expect(entity.getComponent('minecraft:health')?.currentValue).toBe(0)
    expect(world.getEntity(entity.id)).toBe(entity)
  })
})

describe('health writes', () => {
  // DM7: entityHealthChanged is keyed to the change, not the path.
  it('fires entityHealthChanged for every changing write and only those', () => {
    const world = createWorld()
    const seen = recordEvents(world)
    const entity = spawnFake(world, {
      typeId: 'minecraft:zombie',
      components: { 'minecraft:health': { current: 10, default: 15, min: 0, max: 20 } },
    })
    const health = entity.getComponent('minecraft:health')

    expect(health?.setCurrentValue(12)).toBe(true)
    health?.resetToDefaultValue()
    health?.resetToMaxValue()
    health?.resetToMaxValue()
    expect(seen).toEqual(['health:10->12', 'health:12->15', 'health:15->20'])
  })

  // DM8: reaching the minimum through the component is a death.
  it('fires the death cascade when a component write reaches the minimum', () => {
    const world = createWorld()
    const seen = recordEvents(world)
    const entity = spawnMob(world)

    entity.getComponent('minecraft:health')?.setCurrentValue(0)
    expect(seen).toEqual(['health:20->0', 'die:none'])

    seen.length = 0
    const second = spawnMob(world)
    second.getComponent('minecraft:health')?.resetToMinValue()
    expect(seen).toEqual(['health:20->0', 'die:none'])
  })

  // DM12: only health drives the health events.
  it('fires nothing for non-health attribute writes', () => {
    const world = createWorld()
    const seen = recordEvents(world)
    const entity = spawnFake(world, {
      typeId: 'minecraft:zombie',
      components: { 'minecraft:movement': { current: 0.5, default: 0.5, min: 0, max: 1 } },
    })

    expect(entity.getComponent('minecraft:movement')?.setCurrentValue(0)).toBe(true)
    expect(seen).toEqual([])
  })
})

describe('kill and remove', () => {
  // DM10
  it('kill drives the death cascade without entityHurt and leaves the reference valid', () => {
    const world = createWorld()
    const seen = recordEvents(world)
    const entity = spawnMob(world)

    expect(entity.kill()).toBe(true)
    expect(seen).toEqual(['health:20->0', 'die:none'])
    expect(entity.isValid).toBe(true)

    seen.length = 0
    expect(entity.kill()).toBe(true)
    expect(seen).toEqual([])

    const bare = spawnFake(world, { typeId: 'minecraft:zombie' })
    expect(bare.kill()).toBe(true)
    expect(seen).toEqual([])
  })

  // DM11
  it('remove invalidates without a death event', () => {
    const world = createWorld()
    const seen = recordEvents(world)
    const entity = spawnMob(world)

    entity.remove()
    expect(seen).toEqual([])
    expect(entity.isValid).toBe(false)
    expect(world.getEntity(entity.id)).toBeUndefined()
  })
})

describe('reentrant dispatch', () => {
  // DM13: the cascade of a write is determined at write time.
  it('interleaves a healing handler without losing the original cascade', () => {
    const world = createWorld()
    const seen = recordEvents(world)
    const entity = spawnMob(world)

    world.afterEvents.entityHurt.subscribe(() => {
      entity.getComponent('minecraft:health')?.resetToMaxValue()
    })

    entity.applyDamage(5)
    expect(seen).toEqual(['hurt:5:none', 'health:15->20', 'health:20->15'])
    expect(entity.getComponent('minecraft:health')?.currentValue).toBe(20)

    seen.length = 0
    entity.applyDamage(20)
    expect(seen).toEqual(['hurt:20:none', 'health:0->20', 'health:20->0', 'die:none'])
    expect(entity.getComponent('minecraft:health')?.currentValue).toBe(20)
  })
})

describe('invalidation fires nothing', () => {
  // IV5 lives here with the other event assertions.
  it('invalidate calls no subscriber', () => {
    const world = createWorld()
    const seen = recordEvents(world)
    const entity = spawnMob(world)
    invalidate(entity)
    expect(seen).toEqual([])
  })
})
