/**
 * Dimension registration and `getDimension` resolution, and the two presets a caller opts into.
 *
 * These reach the fakes the way a test would: through the free functions the entry point exports.
 */

import { describe, expect, it } from 'vitest'

import type * as MC from '@minecraft/server'

import { createServer } from './create-server.js'
import { createEntity, createPlayer, invalidate } from './entity.js'
import { InvalidEntityError, UnsetValueError } from './errors.js'
import { asSpawnedEntity, withVanillaDimensions } from './presets.js'
import { serverOf } from './runtime/state.js'
import { registerDimension } from './world.js'

type Server = ReturnType<typeof createServer>

const CUSTOM = {
  id: 'x:custom',
  aliases: ['x:custom', 'custom'],
  heightRange: { min: 0, max: 16 },
  localizationKey: 'dimension.custom',
} as const

const withCustom = (): Server => {
  const server = createServer()
  registerDimension(serverOf(server.world), CUSTOM)
  return server
}

const vanilla = (): Server => {
  const server = createServer()
  withVanillaDimensions(server)
  return server
}

// ---------------------------------------------------------------------------
// Dimension registration and getDimension
// ---------------------------------------------------------------------------

describe('registerDimension', () => {
  it('resolves a dimension under every alias it was registered with', () => {
    const { world } = withCustom()
    expect(world.getDimension('x:custom')).toBe(world.getDimension('custom'))
  })

  it('reports the canonical id whichever alias was asked for', () => {
    const { world } = withCustom()
    expect(world.getDimension('custom').id).toBe('x:custom')
  })

  it('carries the height range it was given', () => {
    expect(withCustom().world.getDimension('custom').heightRange).toEqual({ min: 0, max: 16 })
  })

  it('carries the localization key it was given', () => {
    expect(withCustom().world.getDimension('custom').localizationKey).toBe('dimension.custom')
  })

  it('registers nothing unasked', () => {
    const { world } = withCustom()
    for (const id of ['overworld', 'minecraft:overworld', 'nether', 'the_end']) {
      expect(() => world.getDimension(id)).toThrow(`Dimension '${id}' is invalid.`)
    }
  })

  it('does not canonicalize an unregistered id', () => {
    const server = createServer()
    registerDimension(serverOf(server.world), { ...CUSTOM, aliases: ['x:custom'] })
    expect(() => server.world.getDimension('custom')).toThrow("Dimension 'custom' is invalid.")
  })
})

describe('getDimension', () => {
  it('throws a plain Error for an unknown id', () => {
    let caught: unknown
    try {
      createServer().world.getDimension('mctest:nope')
    } catch (error) {
      caught = error
    }
    expect((caught as Error).constructor).toBe(Error)
    expect((caught as Error).name).toBe('Error')
    expect(caught).not.toBeInstanceOf(InvalidEntityError)
    expect((caught as Error).message).toBe("Dimension 'mctest:nope' is invalid.")
  })

  it('throws for an unknown id on a world the preset was applied to', () => {
    expect(() => vanilla().world.getDimension('mctest2:nope')).toThrow("Dimension 'mctest2:nope' is invalid.")
  })

  it('is arity-checked', () => {
    const { world } = createServer()
    const loosely = world as unknown as Record<string, () => unknown>
    expect(() => loosely.getDimension()).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 1, received 0'),
    )
  })

  it('returns the same object for either spelling of one dimension', () => {
    const { world } = vanilla()
    expect(world.getDimension('overworld')).toBe(world.getDimension('minecraft:overworld'))
  })
})

// ---------------------------------------------------------------------------
// withVanillaDimensions
// ---------------------------------------------------------------------------

describe('withVanillaDimensions', () => {
  it('resolves overworld from the bare id', () => {
    expect(vanilla().world.getDimension('overworld').id).toBe('minecraft:overworld')
  })

  it('resolves nether from the bare id', () => {
    expect(vanilla().world.getDimension('nether').id).toBe('minecraft:nether')
  })

  it('resolves the_end from the bare id', () => {
    expect(vanilla().world.getDimension('the_end').id).toBe('minecraft:the_end')
  })

  it('resolves each prefixed form', () => {
    const { world } = vanilla()
    for (const id of ['minecraft:overworld', 'minecraft:nether', 'minecraft:the_end']) {
      expect(world.getDimension(id).id).toBe(id)
    }
  })

  it('resolves the spaced alias "the end"', () => {
    const { world } = vanilla()
    expect(world.getDimension('the end')).toBe(world.getDimension('the_end'))
  })

  it('gives the overworld a −64..320 height range', () => {
    expect(vanilla().world.getDimension('overworld').heightRange).toEqual({ min: -64, max: 320 })
  })

  it('gives the nether a 0..128 height range', () => {
    expect(vanilla().world.getDimension('nether').heightRange).toEqual({ min: 0, max: 128 })
  })

  it('gives the end a 0..256 height range', () => {
    expect(vanilla().world.getDimension('the_end').heightRange).toEqual({ min: 0, max: 256 })
  })

  it('gives each dimension its localization key', () => {
    const { world } = vanilla()
    expect(world.getDimension('overworld').localizationKey).toBe('dimension.dimensionName0')
    expect(world.getDimension('nether').localizationKey).toBe('dimension.dimensionName1')
    expect(world.getDimension('the_end').localizationKey).toBe('dimension.dimensionName2')
  })

  it('registers exactly the seven ids observed', () => {
    const { world } = vanilla()
    for (const id of [
      'overworld',
      'nether',
      'the_end',
      'minecraft:overworld',
      'minecraft:nether',
      'minecraft:the_end',
      'the end',
    ]) {
      expect(world.getDimension(id)).toBeDefined()
    }
    for (const id of ['end', 'the_nether', 'minecraft:the end', 'Overworld']) {
      expect(() => world.getDimension(id)).toThrow(`Dimension '${id}' is invalid.`)
    }
  })

  it('leaves the dimensions empty of entities', () => {
    expect(vanilla().world.getDimension('overworld').getEntities()).toEqual([])
  })

  it('is idempotent', () => {
    const server = vanilla()
    const before = server.world.getDimension('overworld')
    withVanillaDimensions(server)
    expect(server.world.getDimension('overworld')).toBe(before)
  })

  it('touches only the bundle it was given', () => {
    const a = createServer()
    const b = createServer()
    withVanillaDimensions(a)
    expect(() => b.world.getDimension('overworld')).toThrow("Dimension 'overworld' is invalid.")
  })

  it('supplies no per-type vanilla data', () => {
    const server = vanilla()
    const entity = createEntity(server, {
      typeId: 'minecraft:sheep',
      dimension: server.world.getDimension('overworld'),
    })
    expect(entity.getComponents()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// asSpawnedEntity
// ---------------------------------------------------------------------------

describe('asSpawnedEntity', () => {
  const spawned = (typeId = 'minecraft:sheep'): MC.Entity => {
    const entity = createEntity(createServer(), { typeId })
    asSpawnedEntity(entity)
    return entity
  }

  it('sets nameTag to the empty string', () => {
    expect(spawned().nameTag).toBe('')
  })

  it('sets rotation to zero', () => {
    expect(spawned().getRotation()).toEqual({ x: 0, y: 0 })
  })

  it('sets velocity to zero', () => {
    expect(spawned().getVelocity()).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('throws UnsetValueError for those reads before it is applied', () => {
    const entity = createEntity(createServer(), { typeId: 'minecraft:sheep' })
    expect(() => entity.nameTag).toThrow(UnsetValueError)
    expect(() => entity.getRotation()).toThrow(UnsetValueError)
    expect(() => entity.getVelocity()).toThrow(UnsetValueError)
  })

  it('applies the same zeros to minecraft:xp_orb', () => {
    const orb = spawned('minecraft:xp_orb')
    expect(orb.getRotation()).toEqual({ x: 0, y: 0 })
    expect(orb.getVelocity()).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('applies to every entity type alike', () => {
    for (const typeId of [
      'minecraft:sheep',
      'minecraft:cow',
      'minecraft:chicken',
      'minecraft:zombie',
      'minecraft:armor_stand',
      'minecraft:xp_orb',
      'minecraft:arrow',
      'minecraft:boat',
    ]) {
      const entity = spawned(typeId)
      expect(entity.nameTag).toBe('')
      expect(entity.getRotation()).toEqual({ x: 0, y: 0 })
      expect(entity.getVelocity()).toEqual({ x: 0, y: 0, z: 0 })
    }
  })

  it('applies to a player', () => {
    const player = createPlayer(createServer(), { name: 'Bob' })
    asSpawnedEntity(player)
    expect(player.nameTag).toBe('')
    expect(player.getRotation()).toEqual({ x: 0, y: 0 })
    expect(player.getVelocity()).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('supplies no location', () => {
    expect(() => spawned().location).toThrow(UnsetValueError)
  })

  it('supplies no components', () => {
    expect(spawned().getComponents()).toEqual([])
  })

  it('does not overwrite a value the caller supplied', () => {
    const entity = createEntity(createServer(), { typeId: 'minecraft:sheep' })
    entity.nameTag = 'Bob'
    asSpawnedEntity(entity)
    expect(entity.nameTag).toBe('Bob')
  })

  it('composes with withVanillaDimensions', () => {
    const server = vanilla()
    const overworld = server.world.getDimension('overworld')
    const entity = createEntity(server, { typeId: 'minecraft:sheep', dimension: overworld })
    asSpawnedEntity(entity)
    expect(entity.nameTag).toBe('')
    expect(entity.dimension).toBe(overworld)
  })

  it('throws InvalidEntityError on an invalidated entity', () => {
    const entity = createEntity(createServer(), { typeId: 'minecraft:sheep' })
    invalidate(entity)
    expect(() => {
      asSpawnedEntity(entity)
    }).toThrow(InvalidEntityError)
  })

  it('mutates and returns nothing', () => {
    const entity = createEntity(createServer(), { typeId: 'minecraft:sheep' })
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression -- the void return is the claim
    expect(asSpawnedEntity(entity)).toBeUndefined()
    expect(entity.nameTag).toBe('')
  })
})
