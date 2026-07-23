import { describe, expect, it } from 'vitest'

import { createWorld, invalidate, livingMob, NotImplementedError, spawnFake } from './index.js'

describe('tags', () => {
  // EN1: real semantics against the record; every handle observes the same tag set.
  it('behaves per the documented tag contract', () => {
    const world = createWorld()
    const entity = spawnFake(world, { typeId: 'minecraft:zombie' })

    expect(entity.hasTag('guarded')).toBe(false)
    expect(entity.addTag('guarded')).toBe(true)
    expect(entity.addTag('guarded')).toBe(false)
    expect(entity.hasTag('guarded')).toBe(true)
    expect(entity.getTags()).toEqual(['guarded'])

    const other = world.getEntity(entity.id)
    expect(other?.hasTag('guarded')).toBe(true)

    expect(entity.removeTag('guarded')).toBe(true)
    expect(entity.removeTag('guarded')).toBe(false)
    expect(other?.hasTag('guarded')).toBe(false)
  })
})

describe('components', () => {
  // EN2: both id forms reach the same staged component; every other id answers absence.
  it('accepts bare and prefixed ids and answers absence for any id', () => {
    const world = createWorld()
    const entity = spawnFake(world, { ...livingMob, typeId: 'minecraft:zombie' })

    expect(entity.getComponent('health')).toBeDefined()
    expect(entity.getComponent('minecraft:health')).toBe(entity.getComponent('health'))
    expect(entity.hasComponent('health')).toBe(true)
    expect(entity.hasComponent('minecraft:health')).toBe(true)

    expect(entity.getComponent('minecraft:variant')).toBeUndefined()
    expect(entity.hasComponent('minecraft:variant')).toBe(false)
    expect(entity.getComponent('myns:custom')).toBeUndefined()
    expect(entity.hasComponent('myns:custom')).toBe(false)
  })

  // EN3: the handle is a real component surface pointing back at its owner.
  it('vends a component handle with the real surface', () => {
    const world = createWorld()
    const entity = spawnFake(world, { ...livingMob, typeId: 'minecraft:zombie' })

    const health = entity.getComponent('minecraft:health')
    expect(health?.typeId).toBe('minecraft:health')
    expect(health?.isValid).toBe(true)
    expect(health?.entity).toBe(entity)
  })

  // EN4: getComponents returns exactly the staged set.
  it('lists exactly the staged components', () => {
    const world = createWorld()
    const entity = spawnFake(world, {
      typeId: 'minecraft:zombie',
      components: {
        'minecraft:health': { current: 20, default: 20, min: 0, max: 20 },
        'minecraft:movement': { current: 0.23, default: 0.23, min: 0, max: 1 },
      },
    })

    const components = entity.getComponents()
    expect(components).toHaveLength(2)
    expect(components.map((component) => component.typeId).sort()).toEqual(['minecraft:health', 'minecraft:movement'])
  })
})

describe('unbuilt members', () => {
  // EN5: guarded stubs on a valid entity throw NotImplementedError naming the member.
  it('throws NotImplementedError on a valid entity', () => {
    const world = createWorld()
    const entity = spawnFake(world, { typeId: 'minecraft:zombie' })

    expect(() => entity.isClimbing).toThrow(NotImplementedError)
    expect(() => entity.isClimbing).toThrow(/isClimbing/)
    expect(() => {
      entity.teleport({ x: 0, y: 0, z: 0 })
    }).toThrow(NotImplementedError)
    expect(() => entity.getDynamicProperty('key')).toThrow(NotImplementedError)
  })

  // EN6: the unguarded pair never throws InvalidEntityError, valid or not.
  it('throws NotImplementedError for isSneaking and scoreboardIdentity regardless of validity', () => {
    const world = createWorld()
    const entity = spawnFake(world, { typeId: 'minecraft:zombie' })

    expect(() => entity.isSneaking).toThrow(NotImplementedError)
    expect(() => entity.scoreboardIdentity).toThrow(NotImplementedError)

    invalidate(entity)
    expect(() => entity.isSneaking).toThrow(NotImplementedError)
    expect(() => entity.scoreboardIdentity).toThrow(NotImplementedError)
  })
})
