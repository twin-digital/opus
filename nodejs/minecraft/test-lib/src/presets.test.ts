/**
 * Dimension registration and `getDimension` resolution, and the four presets a caller opts into.
 *
 * These reach the fakes the way a test would: through the free functions the entry point exports.
 */

import { describe, expect, it } from 'vitest'

import type * as MC from '@minecraft/server'

import { createServer } from './create-server.js'
import { createEntity, createPlayer, invalidate } from './entity.js'
import { registerEntityType } from './entity-types.js'
import { InvalidEntityError, UnsetValueError } from './errors.js'
import { VANILLA_ENTITY_TYPE_IDS } from './generated/vanilla.js'
import { asSpawnedEntity, withVanillaDimensions, withVanillaEntityTypes, withVanillaWorld } from './presets.js'
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

  it('touches only the server it was given', () => {
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
// withVanillaEntityTypes and withVanillaWorld
// ---------------------------------------------------------------------------

describe('withVanillaEntityTypes', () => {
  // The shipped list is committed, and the count is written out here rather than derived, so a
  // @minecraft/vanilla-data content bump fails this before it can ride the non-major auto-merge.
  // Regenerate, read the diff of which ids moved, and move this number with it.
  it('ships 128 ids, every one prefixed and issued once', () => {
    expect(VANILLA_ENTITY_TYPE_IDS).toHaveLength(128)
    expect(VANILLA_ENTITY_TYPE_IDS.filter((id) => !id.startsWith('minecraft:'))).toEqual([])
    expect(new Set(VANILLA_ENTITY_TYPE_IDS).size).toBe(VANILLA_ENTITY_TYPE_IDS.length)
  })

  it('registers the ids @minecraft/vanilla-data carries, in that source order', () => {
    const server = createServer()
    withVanillaEntityTypes(server)
    expect(server.EntityTypes.getAll().map((type) => type.id)).toEqual([...VANILLA_ENTITY_TYPE_IDS])
  })

  it('registers nothing outside that list', () => {
    const server = createServer()
    withVanillaEntityTypes(server)
    expect(server.EntityTypes.get('mctest:probe_dummy')).toBeUndefined()
  })

  it('skips an id the test registered itself, keeping the type that test holds', () => {
    const server = createServer()
    const mine = registerEntityType(server, 'minecraft:sheep', 'entity.mine.name')
    expect(() => {
      withVanillaEntityTypes(server)
    }).not.toThrow()
    expect(server.EntityTypes.get('minecraft:sheep')).toBe(mine)
    expect(server.EntityTypes.getAll()).toHaveLength(VANILLA_ENTITY_TYPE_IDS.length)
  })

  it('composes with itself', () => {
    const server = createServer()
    withVanillaEntityTypes(server)
    withVanillaEntityTypes(server)
    expect(server.EntityTypes.getAll()).toHaveLength(VANILLA_ENTITY_TYPE_IDS.length)
  })

  it('touches only the server it was given', () => {
    const a = createServer()
    const b = createServer()
    withVanillaEntityTypes(a)
    expect(b.EntityTypes.getAll()).toEqual([])
  })
})

describe('withVanillaWorld', () => {
  it('supplies the dimensions and the entity types', () => {
    const server = createServer()
    withVanillaWorld(server)
    expect(server.world.getDimension('overworld').id).toBe('minecraft:overworld')
    expect(server.EntityTypes.get('minecraft:sheep')).toBeDefined()
  })

  it('supplies those two and nothing else', () => {
    const server = createServer()
    withVanillaWorld(server)
    expect(server.world.getAllPlayers()).toEqual([])
    expect(server.world.getDynamicPropertyIds()).toEqual([])
    expect(server.world.scoreboard.getObjectives()).toEqual([])
    expect(server.system.currentTick).toBe(0)
  })

  it('composes with the two presets it is made of', () => {
    const server = createServer()
    withVanillaDimensions(server)
    withVanillaEntityTypes(server)
    expect(() => {
      withVanillaWorld(server)
    }).not.toThrow()
    expect(server.EntityTypes.getAll()).toHaveLength(VANILLA_ENTITY_TYPE_IDS.length)
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
