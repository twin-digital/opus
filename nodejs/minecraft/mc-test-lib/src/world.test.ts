import { describe, expect, it } from 'vitest'

import { createWorld, invalidate, livingMob, NotImplementedError, spawnFake } from './index.js'

describe('createWorld', () => {
  // WD1: the three vanilla dimensions exist; bare and prefixed lookups share a handle.
  it('carries the three vanilla dimensions', () => {
    const world = createWorld()
    expect(world.getDimension('minecraft:overworld')).toBeDefined()
    expect(world.getDimension('minecraft:nether')).toBeDefined()
    expect(world.getDimension('minecraft:the_end')).toBeDefined()
  })

  it('returns the same handle for bare and prefixed dimension ids', () => {
    const world = createWorld()
    expect(world.getDimension('overworld')).toBe(world.getDimension('minecraft:overworld'))
    expect(world.getDimension('the_end')).toBe(world.getDimension('minecraft:the_end'))
  })

  // WD2: the real API documents a throw for unknown ids but names no class.
  it('throws NotImplementedError for a non-vanilla dimension id', () => {
    const world = createWorld()
    expect(() => world.getDimension('myns:custom')).toThrow(NotImplementedError)
  })

  // WD3: isolation is object lifetime — worlds share nothing.
  it('shares nothing between worlds', () => {
    const first = createWorld()
    const second = createWorld()
    const entity = spawnFake(first, { typeId: 'minecraft:zombie', dimension: 'overworld' })

    expect(second.getEntity(entity.id)).toBeUndefined()
    expect(second.getDimension('overworld').getEntities()).toHaveLength(0)
    expect(first.getDimension('overworld').getEntities()).toContain(entity)
  })
})

describe('world.getEntity', () => {
  // WD4
  it('returns the spawned handle by id, undefined for unknown ids', () => {
    const world = createWorld()
    const entity = spawnFake(world, { typeId: 'minecraft:zombie' })
    expect(world.getEntity(entity.id)).toBe(entity)
    expect(world.getEntity('no-such-id')).toBeUndefined()
  })

  it('returns undefined once the entity is invalidated', () => {
    const world = createWorld()
    const entity = spawnFake(world, { typeId: 'minecraft:zombie' })
    invalidate(entity)
    expect(world.getEntity(entity.id)).toBeUndefined()
  })
})

describe('dimension.getEntities', () => {
  // WD5: membership follows the staged dimension and validity.
  it('reflects staged dimension membership', () => {
    const world = createWorld()
    const overworld = world.getDimension('overworld')
    const nether = world.getDimension('nether')

    const staged = spawnFake(world, { typeId: 'minecraft:zombie', dimension: 'overworld' })
    const unstaged = spawnFake(world, { typeId: 'minecraft:zombie' })

    expect(overworld.getEntities()).toContain(staged)
    expect(overworld.getEntities()).not.toContain(unstaged)
    expect(nether.getEntities()).toHaveLength(0)

    invalidate(staged)
    expect(overworld.getEntities()).not.toContain(staged)
  })

  // WD6: query options are unmodeled — any argument, even {}, throws.
  it('throws NotImplementedError for any options argument', () => {
    const world = createWorld()
    const overworld = world.getDimension('overworld')
    expect(() => overworld.getEntities({ type: 'minecraft:zombie' })).toThrow(NotImplementedError)
    expect(() => overworld.getEntities({})).toThrow(NotImplementedError)
    expect(() => overworld.getEntities(undefined)).not.toThrow()
  })
})

describe('unbuilt surface', () => {
  // WD7: stubs throw NotImplementedError naming the member.
  it('throws NotImplementedError naming the member', () => {
    const world = createWorld()
    expect(() => world.beforeEvents).toThrow(/World\.beforeEvents/)
    expect(() => world.beforeEvents).toThrow(NotImplementedError)
    expect(() => world.scoreboard).toThrow(NotImplementedError)
    expect(() => world.getAllPlayers()).toThrow(NotImplementedError)
    expect(() => world.afterEvents.entitySpawn).toThrow(NotImplementedError)
  })

  // WD8: dimension identity is by handle, not id.
  it('stubs dimension.id', () => {
    const world = createWorld()
    expect(() => world.getDimension('overworld').id).toThrow(NotImplementedError)
  })
})

describe('spawn requires no defaults', () => {
  it('spawns with a base only when explicitly merged', () => {
    const world = createWorld()
    const entity = spawnFake(world, { ...livingMob, typeId: 'minecraft:zombie' })
    expect(entity.getComponent('minecraft:health')?.currentValue).toBe(20)
  })
})
