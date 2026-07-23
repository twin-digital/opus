import { describe, expect, it } from 'vitest'

import { createWorld, invalidate, InvalidEntityError, livingMob, spawnFake } from './index.js'

describe('invalidate', () => {
  // IV1: the stale-reference shape, produced mid-test on handles the test already holds.
  it('turns held handles stale per the declared per-member guards', () => {
    const world = createWorld()
    const entity = spawnFake(world, {
      ...livingMob,
      typeId: 'minecraft:zombie',
      nameTag: 'Bob',
      location: { x: 0, y: 64, z: 0 },
      dimension: 'overworld',
    })

    invalidate(entity)

    expect(entity.isValid).toBe(false)
    expect(entity.id).toBeDefined()
    expect(entity.typeId).toBe('minecraft:zombie')
    expect(entity.nameTag).toBe('Bob')

    expect(() => entity.applyDamage(1)).toThrow(InvalidEntityError)
    expect(() => entity.getComponent('minecraft:health')).toThrow(InvalidEntityError)
    expect(() => entity.hasTag('any')).toThrow(InvalidEntityError)
    expect(() => entity.addEffect('speed', 100)).toThrow(InvalidEntityError)
    expect(() => entity.kill()).toThrow(InvalidEntityError)
    expect(() => {
      entity.remove()
    }).toThrow(InvalidEntityError)
    expect(() => entity.location).toThrow(InvalidEntityError)
    expect(() => entity.dimension).toThrow(InvalidEntityError)
    expect(() => entity.getEffects()).toThrow(InvalidEntityError)
    expect(() => entity.getTags()).toThrow(InvalidEntityError)
  })

  it('throws errors carrying the invalid entity id and type', () => {
    const world = createWorld()
    const entity = spawnFake(world, { typeId: 'zombie', id: 'the-id' })
    invalidate(entity)

    let caught: unknown
    try {
      entity.getTags()
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(InvalidEntityError)
    expect((caught as InvalidEntityError).id).toBe('the-id')
    expect((caught as InvalidEntityError).type).toBe('minecraft:zombie')
  })

  // IV2: on an invalid entity, even unbuilt guarded members throw the guard's error.
  it('guards run before not-implemented stubs', () => {
    const world = createWorld()
    const entity = spawnFake(world, { typeId: 'minecraft:zombie' })
    invalidate(entity)

    expect(() => entity.isClimbing).toThrow(InvalidEntityError)
    expect(() => {
      entity.teleport({ x: 0, y: 0, z: 0 })
    }).toThrow(InvalidEntityError)
    expect(() => entity.getDynamicProperty('key')).toThrow(InvalidEntityError)
  })

  // IV3: idempotence.
  it('is a no-op on an already-invalid entity', () => {
    const world = createWorld()
    const first = spawnFake(world, { typeId: 'minecraft:zombie' })
    invalidate(first)
    expect(() => {
      invalidate(first)
    }).not.toThrow()

    const second = spawnFake(world, { typeId: 'minecraft:zombie' })
    second.remove()
    expect(() => {
      invalidate(second)
    }).not.toThrow()
    expect(second.isValid).toBe(false)
  })

  // IV4: no re-fetch required — the held reference itself is stale.
  it('applies to references held before the invalidation', () => {
    const world = createWorld()
    const entity = spawnFake(world, { ...livingMob, typeId: 'minecraft:zombie' })
    const held = world.getEntity(entity.id)

    invalidate(entity)
    expect(held?.isValid).toBe(false)
    expect(() => held?.hasTag('any')).toThrow(InvalidEntityError)
  })
})
