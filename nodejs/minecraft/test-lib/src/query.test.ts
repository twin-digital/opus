import type * as MC from '@minecraft/server'
import { describe, expect, it } from 'vitest'

import { createServer, type FakeServer } from './create-server.js'
import { createEntity, createPlayer, invalidate } from './entity.js'
import { InvalidEntityError, NotImplementedError, UnsetValueError } from './errors.js'
import { withVanillaDimensions } from './presets.js'
import { matchesQuery } from './query.js'

/** A server with the vanilla dimensions on it, and the overworld a test puts entities in. */
const setup = (): { server: FakeServer; world: MC.World; overworld: MC.Dimension } => {
  const server = createServer()
  withVanillaDimensions(server)
  return { server, world: server.world, overworld: server.world.getDimension('overworld') }
}

/** Asserts a call throws that class with exactly that message, and hands the error back. */
const expectThrown = <E extends Error>(act: () => unknown, ctor: new (...args: never[]) => E, message: string): E => {
  let thrown: unknown
  try {
    act()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBeInstanceOf(ctor)
  expect((thrown as Error).message).toBe(message)
  return thrown as E
}

const unsetMessage = (member: string): string =>
  `${member} was never supplied. Set it when creating the fake, or supply it before reading.`

const notImplementedMessage = (member: string): string =>
  `${member} is declared by @minecraft/server but is not modelled by this library.`

const invalidMessage = (shape: 'get property' | 'set property' | 'call function', name: string): string =>
  `Failed to ${shape} '${name}' due to Entity being invalid (has the Entity been removed?).`

const SHEEP = 'minecraft:sheep'
const COW = 'minecraft:cow'

/** A sheep in the overworld, named and tagged as the case needs. */
const sheep = (
  server: FakeServer,
  dimension: MC.Dimension,
  options: { nameTag?: string; tags?: string[]; typeId?: string } = {},
): MC.Entity => {
  const entity = createEntity(server, { typeId: options.typeId ?? SHEEP, dimension })
  if (options.nameTag !== undefined) {
    entity.nameTag = options.nameTag
  }
  for (const tag of options.tags ?? []) {
    entity.addTag(tag)
  }
  return entity
}

describe('matchesQuery - the honoured six', () => {
  it('matches everything when no options are given', () => {
    const { server, overworld } = setup()
    const entity = sheep(server, overworld)
    expect(matchesQuery(entity, undefined)).toBe(true)
    expect(overworld.getEntities()).toEqual([entity])
  })

  it('matches everything for an empty options object', () => {
    const { server, overworld } = setup()
    expect(sheep(server, overworld).matches({})).toBe(true)
  })

  it('keeps an entity whose typeId equals type', () => {
    const { server, overworld } = setup()
    expect(sheep(server, overworld).matches({ type: SHEEP })).toBe(true)
    expect(sheep(server, overworld, { typeId: COW }).matches({ type: SHEEP })).toBe(false)
  })

  it('normalizes a bare type against the canonical typeId it stored', () => {
    const { server, overworld } = setup()
    const entity = sheep(server, overworld)
    expect(entity.matches({ type: 'sheep' })).toBe(true)
    expect(entity.matches({ type: 'cow' })).toBe(false)
    expect(overworld.getEntities({ type: 'sheep' })).toEqual([entity])
  })

  it('normalizes a bare excludeTypes entry', () => {
    const { server, overworld } = setup()
    const dropped = sheep(server, overworld)
    const kept = sheep(server, overworld, { typeId: COW })
    expect(dropped.matches({ excludeTypes: ['sheep'] })).toBe(false)
    expect(overworld.getEntities({ excludeTypes: ['sheep'] })).toEqual([kept])
  })

  it('matches a prefixed type against an entity created with the bare form', () => {
    const { server, overworld } = setup()
    const entity = createEntity(server, { typeId: 'sheep', dimension: overworld })
    expect(entity.matches({ type: SHEEP })).toBe(true)
  })

  it('compares name and tags verbatim, with no id normalization', () => {
    const { server, overworld } = setup()
    const entity = sheep(server, overworld, { nameTag: 'sheep', tags: ['sheep'] })
    expect(entity.matches({ name: 'sheep' })).toBe(true)
    expect(entity.matches({ name: SHEEP })).toBe(false)
    expect(entity.matches({ tags: ['sheep'] })).toBe(true)
    expect(entity.matches({ tags: [SHEEP] })).toBe(false)
  })

  it('drops an entity whose typeId is listed in excludeTypes', () => {
    const { server, overworld } = setup()
    expect(sheep(server, overworld).matches({ excludeTypes: [SHEEP] })).toBe(false)
    expect(sheep(server, overworld, { typeId: COW }).matches({ excludeTypes: [SHEEP] })).toBe(true)
  })

  it('keeps an entity whose nameTag equals name', () => {
    const { server, overworld } = setup()
    const entity = sheep(server, overworld, { nameTag: 'Bessie' })
    expect(entity.matches({ name: 'Bessie' })).toBe(true)
    expect(entity.matches({ name: 'Other' })).toBe(false)
  })

  it('drops an entity whose nameTag is listed in excludeNames', () => {
    const { server, overworld } = setup()
    expect(sheep(server, overworld, { nameTag: 'Bessie' }).matches({ excludeNames: ['Bessie'] })).toBe(false)
    expect(sheep(server, overworld, { nameTag: 'Daisy' }).matches({ excludeNames: ['Bessie'] })).toBe(true)
  })

  it('requires every tag listed in tags', () => {
    const { server, overworld } = setup()
    const entity = sheep(server, overworld, { tags: ['a', 'b'] })
    expect(entity.matches({ tags: ['a'] })).toBe(true)
    expect(entity.matches({ tags: ['a', 'b'] })).toBe(true)
    expect(entity.matches({ tags: ['a', 'c'] })).toBe(false)
  })

  it('drops an entity carrying any tag listed in excludeTags', () => {
    const { server, overworld } = setup()
    const entity = sheep(server, overworld, { tags: ['a', 'b'] })
    expect(entity.matches({ excludeTags: ['c'] })).toBe(true)
    expect(entity.matches({ excludeTags: ['b', 'c'] })).toBe(false)
  })

  it('matches an empty tags array', () => {
    const { server, overworld } = setup()
    expect(sheep(server, overworld).matches({ tags: [] })).toBe(true)
    expect(sheep(server, overworld, { tags: ['a'] }).matches({ tags: [] })).toBe(true)
  })

  it('intersects fields given together', () => {
    const { server, overworld } = setup()
    expect(sheep(server, overworld, { tags: ['a'] }).matches({ type: SHEEP, tags: ['a'] })).toBe(true)
    expect(sheep(server, overworld).matches({ type: SHEEP, tags: ['a'] })).toBe(false)
    expect(sheep(server, overworld, { typeId: COW, tags: ['a'] }).matches({ type: SHEEP, tags: ['a'] })).toBe(false)
  })

  it('lets an exclude field override its counterpart', () => {
    const { server, overworld } = setup()
    expect(sheep(server, overworld).matches({ type: SHEEP, excludeTypes: [SHEEP] })).toBe(false)
  })

  it('throws UnsetValueError for a name query against an entity with no nameTag', () => {
    const { server, overworld } = setup()
    const entity = sheep(server, overworld)
    expectThrown(() => entity.matches({ name: 'Bessie' }), UnsetValueError, unsetMessage('Entity.nameTag'))
  })

  it('throws UnsetValueError for an excludeNames query against an entity with no nameTag', () => {
    const { server, overworld } = setup()
    const entity = sheep(server, overworld)
    expectThrown(() => entity.matches({ excludeNames: ['Bessie'] }), UnsetValueError, unsetMessage('Entity.nameTag'))
  })

  it('reads no field a query does not name', () => {
    const { server, overworld } = setup()
    // nameTag, location and dimension are all unset: a matcher touching any of them would throw.
    const entity = createEntity(server, { typeId: SHEEP })
    expect(entity.matches({ type: SHEEP })).toBe(true)
    expect(sheep(server, overworld).matches({ type: COW })).toBe(false)
  })
})

describe('entity.matches', () => {
  it('answers the same as the lookup filter', () => {
    const { server, overworld } = setup()
    const match = sheep(server, overworld, { tags: ['a'] })
    const other = sheep(server, overworld, { typeId: COW, tags: ['a'] })
    const options: MC.EntityQueryOptions = { type: SHEEP, tags: ['a'] }
    expect(overworld.getEntities(options)).toEqual([match])
    expect(match.matches(options)).toBe(true)
    expect(other.matches(options)).toBe(false)
  })

  it('throws the same NotImplementedError on an unhonoured field', () => {
    const { server, overworld } = setup()
    expectThrown(
      () => sheep(server, overworld).matches({ closest: 1 }),
      NotImplementedError,
      notImplementedMessage('EntityQueryOptions.closest'),
    )
  })

  it('checks arity', () => {
    const { server, overworld } = setup()
    const entity = sheep(server, overworld)
    expectThrown(
      () => (Reflect.get(entity, 'matches') as (...args: unknown[]) => unknown).call(entity),
      TypeError,
      'Incorrect number of arguments to function. Expected 1, received 0',
    )
  })

  it('throws InvalidEntityError on an invalidated entity', () => {
    const { server, overworld } = setup()
    const entity = sheep(server, overworld)
    invalidate(entity)
    expectThrown(() => entity.matches({ closest: 1 }), InvalidEntityError, invalidMessage('call function', 'matches'))
  })
})

/** The eighteen fields this cycle does not honour, each with a value that names it. */
const UNHONOURED: [string, MC.EntityQueryOptions][] = [
  ['closest', { closest: 1 }],
  ['farthest', { farthest: 1 }],
  ['location', { location: { x: 0, y: 0, z: 0 } }],
  ['maxDistance', { maxDistance: 10 }],
  ['minDistance', { minDistance: 1 }],
  ['volume', { volume: { x: 1, y: 1, z: 1 } }],
  ['families', { families: ['mob'] }],
  ['excludeFamilies', { excludeFamilies: ['mob'] }],
  ['gameMode', { gameMode: 'Survival' as MC.GameMode }],
  ['excludeGameModes', { excludeGameModes: ['Survival' as MC.GameMode] }],
  ['minLevel', { minLevel: 1 }],
  ['maxLevel', { maxLevel: 30 }],
  ['minHorizontalRotation', { minHorizontalRotation: 0 }],
  ['maxHorizontalRotation', { maxHorizontalRotation: 90 }],
  ['minVerticalRotation', { minVerticalRotation: 0 }],
  ['maxVerticalRotation', { maxVerticalRotation: 90 }],
  ['propertyOptions', { propertyOptions: [{ propertyId: 'p' }] }],
  ['scoreOptions', { scoreOptions: [{ objective: 'o' }] }],
]

describe('matchesQuery - the eighteen unhonoured fields', () => {
  it.each(UNHONOURED)('throws NotImplementedError naming %s', (field, options) => {
    const { server, overworld } = setup()
    const entity = sheep(server, overworld)
    const error = expectThrown(
      () => entity.matches(options),
      NotImplementedError,
      notImplementedMessage(`EntityQueryOptions.${field}`),
    )
    expect(error.member).toBe(`EntityQueryOptions.${field}`)
  })

  it('throws even when the honoured fields already rule the entity out', () => {
    const { server, overworld } = setup()
    expectThrown(
      () => sheep(server, overworld).matches({ type: COW, closest: 1 }),
      NotImplementedError,
      notImplementedMessage('EntityQueryOptions.closest'),
    )
  })

  it('ignores an unhonoured field explicitly set to undefined', () => {
    const { server, overworld } = setup()
    expect(sheep(server, overworld).matches({ type: SHEEP, closest: undefined })).toBe(true)
  })

  it('names one field deterministically when several are unhonoured', () => {
    const { server, overworld } = setup()
    expectThrown(
      () => sheep(server, overworld).matches({ volume: { x: 1, y: 1, z: 1 }, closest: 1 }),
      NotImplementedError,
      notImplementedMessage('EntityQueryOptions.closest'),
    )
  })

  it('scans the query own fields ahead of the filter fields it inherits', () => {
    const { server, overworld } = setup()
    expectThrown(
      () => sheep(server, overworld).matches({ families: ['mob'], closest: 1 }),
      NotImplementedError,
      notImplementedMessage('EntityQueryOptions.closest'),
    )
  })

  it('throws through dimension.getEntities', () => {
    const { server, overworld } = setup()
    sheep(server, overworld)
    expectThrown(
      () => overworld.getEntities({ closest: 1 }),
      NotImplementedError,
      notImplementedMessage('EntityQueryOptions.closest'),
    )
  })

  it('throws through dimension.getPlayers', () => {
    const { server, overworld } = setup()
    createPlayer(server, { dimension: overworld })
    expectThrown(
      () => overworld.getPlayers({ gameMode: 'Survival' as MC.GameMode }),
      NotImplementedError,
      notImplementedMessage('EntityQueryOptions.gameMode'),
    )
  })

  it('throws through world.getPlayers', () => {
    const { server, world } = setup()
    createPlayer(server)
    expectThrown(
      () => world.getPlayers({ location: { x: 0, y: 0, z: 0 } }),
      NotImplementedError,
      notImplementedMessage('EntityQueryOptions.location'),
    )
  })

  it('throws before any entity is considered', () => {
    const { overworld } = setup()
    expectThrown(
      () => overworld.getEntities({ closest: 1 }),
      NotImplementedError,
      notImplementedMessage('EntityQueryOptions.closest'),
    )
  })
})

describe('lookups with honoured options', () => {
  it('filters dimension.getEntities by type, in creation order', () => {
    const { server, overworld } = setup()
    const first = sheep(server, overworld)
    sheep(server, overworld, { typeId: COW })
    const second = sheep(server, overworld)
    expect(overworld.getEntities({ type: SHEEP })).toEqual([first, second])
  })

  it('filters dimension.getPlayers by excludeNames', () => {
    const { server, overworld } = setup()
    const dropped = createPlayer(server, { dimension: overworld, name: 'Alex' })
    const kept = createPlayer(server, { dimension: overworld, name: 'Steve' })
    dropped.nameTag = 'Alex'
    kept.nameTag = 'Steve'
    expect(overworld.getPlayers({ excludeNames: ['Alex'] })).toEqual([kept])
  })

  it('filters world.getPlayers by tags', () => {
    const { server, world } = setup()
    const tagged = createPlayer(server)
    createPlayer(server)
    tagged.addTag('a')
    expect(world.getPlayers({ tags: ['a'] })).toEqual([tagged])
  })

  it('reads no nameTag from the unfiltered world.getAllPlayers', () => {
    const { server, world } = setup()
    const named = createPlayer(server, { name: 'Alex' })
    const unnamed = createPlayer(server)
    named.nameTag = 'Alex'
    // The second player has no nameTag: an unfiltered lookup must not read one.
    expect(world.getAllPlayers()).toEqual([named, unnamed])
  })

  it('never returns a removed entity from a filtered lookup', () => {
    const { server, overworld } = setup()
    const entity = sheep(server, overworld)
    entity.remove()
    expect(overworld.getEntities({ type: SHEEP })).toEqual([])
  })

  it('still lists an entity invalidate left registered', () => {
    const { server, overworld } = setup()
    const entity = sheep(server, overworld)
    invalidate(entity)
    expect(overworld.getEntities()).toEqual([entity])
  })

  it('propagates InvalidEntityError out of a filtered lookup over an invalidated entity', () => {
    const { server, overworld } = setup()
    const entity = sheep(server, overworld, { nameTag: 'Bessie' })
    invalidate(entity)
    expectThrown(
      () => overworld.getEntities({ name: 'Bessie' }),
      InvalidEntityError,
      invalidMessage('set property', 'nameTag'),
    )
  })
})
