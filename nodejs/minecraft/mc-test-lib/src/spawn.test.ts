import { describe, expect, it } from 'vitest'

import { createWorld, NotImplementedError, spawnFake } from './index.js'

describe('spawnFake', () => {
  // SP1: a bare spawn stages nothing — absence reads exactly as the engine reports it.
  it('spawns a bare entity with no components or effects', () => {
    const world = createWorld()
    const entity = spawnFake(world, { typeId: 'zombie' })

    expect(entity.getComponent('minecraft:health')).toBeUndefined()
    expect(entity.hasComponent('minecraft:health')).toBe(false)
    expect(entity.getComponents()).toHaveLength(0)
    expect(entity.getEffects()).toHaveLength(0)
    expect(entity.getTags()).toHaveLength(0)
  })

  // SP2: typeId canonicalizes on entry.
  it('canonicalizes typeId', () => {
    const world = createWorld()
    expect(spawnFake(world, { typeId: 'zombie' }).typeId).toBe('minecraft:zombie')
    expect(spawnFake(world, { typeId: 'minecraft:zombie' }).typeId).toBe('minecraft:zombie')
  })

  // SP3: unique opaque ids; spec.id overrides; duplicates are staging errors.
  it('assigns unique opaque ids, overridable in the spec', () => {
    const world = createWorld()
    const first = spawnFake(world, { typeId: 'zombie' })
    const second = spawnFake(world, { typeId: 'zombie' })

    expect(typeof first.id).toBe('string')
    expect(first.id.length).toBeGreaterThan(0)
    expect(second.id).not.toBe(first.id)

    const custom = spawnFake(world, { typeId: 'zombie', id: 'my-id' })
    expect(custom.id).toBe('my-id')
    expect(() => spawnFake(world, { typeId: 'zombie', id: 'my-id' })).toThrow(TypeError)
  })

  // SP4: nameTag defaults to '' — the engine's value for an unnamed entity.
  it('defaults nameTag to the empty string and accepts writes', () => {
    const world = createWorld()
    const entity = spawnFake(world, { typeId: 'zombie' })
    expect(entity.nameTag).toBe('')

    const named = spawnFake(world, { typeId: 'zombie', nameTag: 'Bob' })
    expect(named.nameTag).toBe('Bob')

    named.nameTag = 'Alice'
    expect(world.getEntity(named.id)?.nameTag).toBe('Alice')
  })

  // SP5: state the engine could not lack stays loud until staged.
  it('throws NotImplementedError naming unstaged location and dimension', () => {
    const world = createWorld()
    const bare = spawnFake(world, { typeId: 'zombie' })

    expect(() => bare.location).toThrow(NotImplementedError)
    expect(() => bare.location).toThrow(/location/)
    expect(() => bare.dimension).toThrow(NotImplementedError)
    expect(() => bare.dimension).toThrow(/dimension/)

    const staged = spawnFake(world, {
      typeId: 'zombie',
      location: { x: 1, y: 2, z: 3 },
      dimension: 'overworld',
    })
    expect(staged.location).toEqual({ x: 1, y: 2, z: 3 })
    expect(staged.dimension).toBe(world.getDimension('overworld'))
  })

  // SP6: the staged attribute value set reads back exactly; nothing is derived.
  it('reads a staged health component back exactly as written', () => {
    const world = createWorld()
    const entity = spawnFake(world, {
      typeId: 'zombie',
      components: { 'minecraft:health': { current: 7, default: 10, min: 0, max: 30 } },
    })

    const health = entity.getComponent('minecraft:health')
    expect(health?.currentValue).toBe(7)
    expect(health?.defaultValue).toBe(10)
    expect(health?.effectiveMin).toBe(0)
    expect(health?.effectiveMax).toBe(30)
  })

  // SP7: staging errors throw TypeError.
  it('rejects contradictory or impossible staging', () => {
    const world = createWorld()
    expect(() =>
      spawnFake(world, {
        typeId: 'zombie',
        components: {
          health: { current: 20, default: 20, min: 0, max: 20 },
          'minecraft:health': { current: 10, default: 10, min: 0, max: 10 },
        },
      }),
    ).toThrow(TypeError)

    expect(() => spawnFake(world, { typeId: 'zombie', dimension: 'myns:void' })).toThrow(TypeError)
  })

  // SP8: any attribute-shaped id stages with the same surface.
  it('stages non-health attribute components', () => {
    const world = createWorld()
    const entity = spawnFake(world, {
      typeId: 'zombie',
      components: { 'minecraft:movement': { current: 0.23, default: 0.23, min: 0, max: 1 } },
    })

    const movement = entity.getComponent('minecraft:movement')
    expect(movement?.currentValue).toBe(0.23)
    expect(movement?.typeId).toBe('minecraft:movement')
  })
})
