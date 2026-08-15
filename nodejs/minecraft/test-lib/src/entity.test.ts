import type * as MC from '@minecraft/server'
import { describe, expect, it } from 'vitest'

import { addComponent } from './components.js'
import { EntityManifest } from './generated/manifests.js'
import { createServer, type FakeServer } from './create-server.js'
import { createEntity, createPlayer, getTriggeredEvents, invalidate } from './entity.js'
import { InvalidArgumentError, InvalidEntityError, NotImplementedError, UnsetValueError } from './errors.js'
import { withVanillaWorld } from './presets.js'
import { advanceTicks } from './scheduler.js'

/** A server with the vanilla dimensions on it, and the overworld a test puts entities in. */
const setup = (): { server: FakeServer; world: MC.World; overworld: MC.Dimension } => {
  const server = createServer()
  withVanillaWorld(server)
  return { server, world: server.world, overworld: server.world.getDimension('overworld') }
}

/** Records the payloads a signal delivers, in delivery order. */
const collect = <P>(signal: { subscribe: (callback: (payload: P) => void, ...rest: never[]) => unknown }): P[] => {
  const seen: P[] = []
  signal.subscribe((payload) => seen.push(payload))
  return seen
}

/** Calls a member through its untyped shape: for arity checks, and for reading a void return. */
const callBare = (target: object, member: string, ...args: unknown[]): unknown =>
  (Reflect.get(target, member) as (...rest: unknown[]) => unknown).call(target, ...args)

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
const ORIGIN: MC.Vector3 = { x: 0, y: 0, z: 0 }

describe('createEntity', () => {
  it('returns an entity carrying the requested typeId', () => {
    const { server } = setup()
    expect(createEntity(server, { typeId: SHEEP }).typeId).toBe(SHEEP)
  })

  it('registers the entity with that server world', () => {
    const { server, world } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    expect(world.getEntity(entity.id)).toBe(entity)
  })

  it('assigns ids sequentially from 1 when none is given', () => {
    const { server } = setup()
    const ids = [1, 2, 3].map(() => createEntity(server, { typeId: SHEEP }).id)
    expect(ids).toEqual(['1', '2', '3'])
    expect(typeof ids[0]).toBe('string')
  })

  it('never reissues an id after an entity is removed', () => {
    const { server } = setup()
    const first = [1, 2, 3].map(() => createEntity(server, { typeId: SHEEP }))
    for (const entity of first) {
      entity.remove()
    }
    const second = [1, 2, 3].map(() => createEntity(server, { typeId: SHEEP }).id)
    expect(first.map((entity) => entity.id)).toEqual(['1', '2', '3'])
    expect(second).toEqual(['4', '5', '6'])
  })

  it('skips an id already in use when assigning', () => {
    const { server, world } = setup()
    const given = createEntity(server, { typeId: SHEEP, id: '1' })
    const assigned = createEntity(server, { typeId: SHEEP })
    expect(assigned.id).toBe('2')
    expect(world.getEntity('1')).toBe(given)
    expect(world.getEntity(assigned.id)).toBe(assigned)
  })

  it('refuses a caller-supplied id another live entity already holds', () => {
    const { server, world } = setup()
    const first = createEntity(server, { typeId: SHEEP, id: '7' })
    expectThrown(
      () => createEntity(server, { typeId: COW, id: '7' }),
      InvalidArgumentError,
      'Invalid value passed to argument [1]. An entity with id 7 is already registered with this world.',
    )
    expect(world.getEntity('7')).toBe(first)
  })

  it('refuses an id a removed entity holds, since ids are never reissued', () => {
    const { server } = setup()
    const removed = createEntity(server, { typeId: SHEEP, id: '7' })
    removed.remove()
    expect(() => createEntity(server, { typeId: SHEEP, id: '7' })).toThrow(InvalidArgumentError)
  })

  it('numbers ids per server', () => {
    const first = setup()
    const second = setup()
    const one = createEntity(first.server, { typeId: SHEEP })
    const two = createEntity(second.server, { typeId: SHEEP })
    expect(one.id).toBe('1')
    expect(two.id).toBe('1')
    expect(second.world.getEntity('1')).toBe(two)
  })

  it('uses a caller-supplied id verbatim', () => {
    const { server, world } = setup()
    const entity = createEntity(server, { typeId: SHEEP, id: 'given' })
    expect(entity.id).toBe('given')
    expect(world.getEntity('given')).toBe(entity)
  })

  it('leaves the sequence untouched when the caller supplies an id', () => {
    const { server } = setup()
    createEntity(server, { typeId: SHEEP, id: 'given' })
    expect(createEntity(server, { typeId: SHEEP }).id).toBe('1')
  })

  it('registers an entity created with a dimension in that dimension listing', () => {
    const { server, world, overworld } = setup()
    const entity = createEntity(server, { typeId: SHEEP, dimension: overworld })
    expect(overworld.getEntities()).toEqual([entity])
    expect(world.getEntity(entity.id)).toBe(entity)
  })

  it('leaves an entity created with no dimension out of every dimension listing', () => {
    const { server, world, overworld } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    expect(overworld.getEntities()).toEqual([])
    expect(world.getEntity(entity.id)).toBe(entity)
  })

  it('lists entities in creation order', () => {
    const { server, overworld } = setup()
    const entities = [SHEEP, COW, SHEEP].map((typeId) => createEntity(server, { typeId, dimension: overworld }))
    expect(overworld.getEntities()).toEqual(entities)
  })

  it('reads back a supplied location exactly', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP, location: { x: 1.5, y: 64, z: -3.25 } })
    expect(entity.location).toEqual({ x: 1.5, y: 64, z: -3.25 })
  })

  it('reads back the supplied dimension', () => {
    const { server, overworld } = setup()
    expect(createEntity(server, { typeId: SHEEP, dimension: overworld }).dimension).toBe(overworld)
  })

  it('throws UnsetValueError for an unsupplied location', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    const error = expectThrown(() => entity.location, UnsetValueError, unsetMessage('Entity.location'))
    expect(error.member).toBe('Entity.location')
  })

  it('throws UnsetValueError for an unsupplied nameTag', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    expect(expectThrown(() => entity.nameTag, UnsetValueError, unsetMessage('Entity.nameTag')).member).toBe(
      'Entity.nameTag',
    )
  })

  it('throws UnsetValueError for an unsupplied dimension', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    expectThrown(() => entity.dimension, UnsetValueError, unsetMessage('Entity.dimension'))
  })

  it('throws UnsetValueError from getRotation when no rotation was supplied', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    expectThrown(() => entity.getRotation(), UnsetValueError, unsetMessage('Entity.getRotation'))
  })

  it('throws UnsetValueError from getVelocity when no velocity was supplied', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    expectThrown(() => entity.getVelocity(), UnsetValueError, unsetMessage('Entity.getVelocity'))
  })

  // Divergence: in the engine a fresh entity always arrives carrying at least one component.
  it('populates no components', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    expect(entity.getComponents()).toEqual([])
    expect(entity.getComponent('minecraft:health')).toBeUndefined()
  })

  it('populates no tags', () => {
    const { server } = setup()
    expect(createEntity(server, { typeId: SHEEP }).getTags()).toEqual([])
  })

  it('starts valid', () => {
    const { server } = setup()
    expect(createEntity(server, { typeId: SHEEP }).isValid).toBe(true)
  })

  it('normalizes a bare typeId to the prefixed form', () => {
    const { server } = setup()
    expect(createEntity(server, { typeId: 'sheep' }).typeId).toBe(SHEEP)
  })
})

describe('the components construction option', () => {
  it('adds exactly the components the map names, in the order it lists them', () => {
    const { server } = setup()
    const entity = createEntity(server, {
      typeId: SHEEP,
      components: { 'minecraft:health': [0, 8], 'minecraft:type_family': ['mob', 'sheep'] },
    })
    expect(entity.getComponents().map((component) => component.typeId)).toEqual([
      'minecraft:health',
      'minecraft:type_family',
    ])
  })

  it('adds each one exactly as addComponent would', () => {
    const { server } = setup()
    const entity = createEntity(server, {
      typeId: SHEEP,
      components: { 'minecraft:health': [0, 8], 'minecraft:type_family': ['mob'] },
    })
    const health = entity.getComponent('minecraft:health')
    expect(health?.effectiveMin).toBe(0)
    expect(health?.effectiveMax).toBe(8)
    expect(health?.currentValue).toBe(8)
    expect(entity.getComponent('minecraft:type_family')?.getTypeFamilies()).toEqual(['mob'])
  })

  it('accepts the bare form of an id and the shorthands of a state', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP, components: { health: 20 } })
    const health = entity.getComponent('minecraft:health')
    expect(health?.currentValue).toBe(20)
    expect(health?.effectiveMax).toBe(20)
  })

  it('attaches a component whose entry carries no state', () => {
    const { server } = setup()
    const entity = createEntity(server, {
      typeId: SHEEP,
      components: { 'minecraft:tameable': undefined, 'minecraft:health': undefined },
    })
    expect(entity.hasComponent('minecraft:tameable')).toBe(true)
    expectThrown(
      () => entity.getComponent('minecraft:health')?.currentValue,
      UnsetValueError,
      unsetMessage('EntityHealthComponent.currentValue'),
    )
  })

  it('populates nothing when the option is omitted or empty', () => {
    const { server } = setup()
    expect(createEntity(server, { typeId: SHEEP }).getComponents()).toEqual([])
    expect(createEntity(server, { typeId: SHEEP, components: {} }).getComponents()).toEqual([])
  })

  it('takes the same option on createPlayer', () => {
    const { server } = setup()
    const player = createPlayer(server, { name: 'Alex', components: { 'minecraft:type_family': ['player'] } })
    expect(player.getComponent('minecraft:type_family')?.getTypeFamilies()).toEqual(['player'])
  })

  it('leaves the entity registered and valid', () => {
    const { server, world } = setup()
    const entity = createEntity(server, { typeId: SHEEP, components: { 'minecraft:health': 20 } })
    expect(world.getEntity(entity.id)).toBe(entity)
    expect(entity.isValid).toBe(true)
  })
})

describe('createPlayer', () => {
  it('returns a player registered with the world', () => {
    const { server, world } = setup()
    const player = createPlayer(server)
    expect(world.getAllPlayers()).toEqual([player])
    expect(world.getEntity(player.id)).toBe(player)
  })

  it('defaults typeId to minecraft:player', () => {
    const { server } = setup()
    expect(createPlayer(server).typeId).toBe('minecraft:player')
  })

  it('reads back a supplied name', () => {
    const { server } = setup()
    expect(createPlayer(server, { name: 'Alex' }).name).toBe('Alex')
  })

  it('throws UnsetValueError for an unsupplied name', () => {
    const { server } = setup()
    const player = createPlayer(server)
    expect(expectThrown(() => player.name, UnsetValueError, unsetMessage('Player.name')).member).toBe('Player.name')
  })

  it('shares the id sequence with non-player entities', () => {
    const { server } = setup()
    expect(createEntity(server, { typeId: SHEEP }).id).toBe('1')
    expect(createPlayer(server).id).toBe('2')
  })

  it('lists a player in its dimension getPlayers and getEntities', () => {
    const { server, overworld } = setup()
    const player = createPlayer(server, { dimension: overworld })
    expect(overworld.getPlayers()).toEqual([player])
    expect(overworld.getEntities()).toEqual([player])
  })

  it('leaves non-player entities out of the player lookups', () => {
    const { server, world, overworld } = setup()
    createEntity(server, { typeId: SHEEP, dimension: overworld })
    const player = createPlayer(server, { dimension: overworld })
    expect(world.getAllPlayers()).toEqual([player])
    expect(world.getPlayers()).toEqual([player])
    expect(overworld.getPlayers()).toEqual([player])
  })

  it('keeps a player out of a dimension listing when none was supplied', () => {
    const { server, world, overworld } = setup()
    const player = createPlayer(server)
    expect(overworld.getPlayers()).toEqual([])
    expect(world.getAllPlayers()).toEqual([player])
  })
})

describe('entity tags', () => {
  it('stores a tag hasTag then reads', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    entity.addTag('boss')
    expect(entity.hasTag('boss')).toBe(true)
    expect(entity.getTags()).toEqual(['boss'])
  })

  it('returns true from addTag for a tag not already held', () => {
    const { server } = setup()
    expect(createEntity(server, { typeId: SHEEP }).addTag('boss')).toBe(true)
  })

  it('keeps one entry when the same tag is added twice', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    entity.addTag('boss')
    expect(entity.addTag('boss')).toBe(false)
    expect(entity.getTags()).toEqual(['boss'])
  })

  it('removes a held tag and reports it', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    entity.addTag('boss')
    expect(entity.removeTag('boss')).toBe(true)
    expect(entity.hasTag('boss')).toBe(false)
    expect(entity.getTags()).toEqual([])
  })

  it('returns false from removeTag for a tag not held', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    entity.addTag('boss')
    expect(entity.removeTag('nope')).toBe(false)
    expect(entity.getTags()).toEqual(['boss'])
  })

  it('answers hasTag false for an unknown tag', () => {
    const { server } = setup()
    expect(createEntity(server, { typeId: SHEEP }).hasTag('nope')).toBe(false)
  })

  it('returns tags in the order they were added', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    entity.addTag('a')
    entity.addTag('b')
    expect(entity.getTags()).toEqual(['a', 'b'])
  })

  it('hands out a copy from getTags', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    entity.addTag('a')
    entity.getTags().push('b')
    expect(entity.getTags()).toEqual(['a'])
  })

  it('keeps tags per entity', () => {
    const { server } = setup()
    const tagged = createEntity(server, { typeId: SHEEP })
    const other = createEntity(server, { typeId: SHEEP })
    tagged.addTag('a')
    expect(other.hasTag('a')).toBe(false)
    expect(other.getTags()).toEqual([])
  })

  it('checks arity before anything else on addTag', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    expectThrown(
      () => callBare(entity, 'addTag'),
      TypeError,
      'Incorrect number of arguments to function. Expected 1, received 0',
    )
  })

  it('throws InvalidEntityError from addTag on an invalidated entity', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    invalidate(entity)
    const error = expectThrown(
      () => entity.addTag('boss'),
      InvalidEntityError,
      invalidMessage('call function', 'addTag'),
    )
    expect(error.id).toBe(entity.id)
    expect(error.type).toBe(SHEEP)
  })

  it('reports arity ahead of invalidity', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    invalidate(entity)
    expectThrown(
      () => callBare(entity, 'addTag'),
      TypeError,
      'Incorrect number of arguments to function. Expected 1, received 0',
    )
  })
})

describe('dimension.spawnEntity', () => {
  it('creates an entity of the requested type and returns it', () => {
    const { overworld } = setup()
    expect(overworld.spawnEntity(SHEEP, ORIGIN).typeId).toBe(SHEEP)
  })

  // Divergence: the engine adjusts some placements — a boat lands 0.2 off on x and z.
  it('places it exactly where asked', () => {
    const { overworld } = setup()
    const entity = overworld.spawnEntity(SHEEP, { x: 0.5, y: 70, z: 0.5 })
    expect(entity.location).toEqual({ x: 0.5, y: 70, z: 0.5 })
  })

  it('accepts the bare id and reports the prefixed form', () => {
    const { overworld } = setup()
    expect(overworld.spawnEntity('sheep', ORIGIN).typeId).toBe(SHEEP)
  })

  it('registers the entity with the world and with that dimension', () => {
    const { world, server } = setup()
    const overworld = world.getDimension('overworld')
    const nether = world.getDimension('nether')
    const entity = overworld.spawnEntity(SHEEP, ORIGIN)
    expect(world.getEntity(entity.id)).toBe(entity)
    expect(overworld.getEntities()).toEqual([entity])
    expect(nether.getEntities()).toEqual([])
    expect(createEntity(server, { typeId: COW }).id).not.toBe(entity.id)
  })

  it('assigns an id from the server sequence', () => {
    const { server, overworld } = setup()
    expect(overworld.spawnEntity(SHEEP, ORIGIN).id).toBe('1')
    expect(createEntity(server, { typeId: SHEEP }).id).toBe('2')
  })

  it('fires the entitySpawn after-event with the spawned entity', () => {
    const { world, overworld } = setup()
    const seen: { entity: MC.Entity; valid: boolean; registered: boolean }[] = []
    world.afterEvents.entitySpawn.subscribe((payload) => {
      seen.push({
        entity: payload.entity,
        valid: payload.entity.isValid,
        registered: world.getEntity(payload.entity.id) === payload.entity,
      })
    })
    const entity = overworld.spawnEntity(SHEEP, ORIGIN)
    expect(seen).toEqual([{ entity, valid: true, registered: true }])
  })

  it('reports cause Spawned on the entitySpawn payload', () => {
    const { world, overworld } = setup()
    const spawns = collect(world.afterEvents.entitySpawn)
    overworld.spawnEntity(SHEEP, ORIGIN)
    expect(spawns.map((payload) => payload.cause)).toEqual(['Spawned'])
  })

  // Divergence: AI-driven mobs drift within a couple of dozen ticks in the engine.
  it('never moves the entity on its own', () => {
    const { server, overworld } = setup()
    const entity = overworld.spawnEntity(SHEEP, { x: 1, y: 2, z: 3 })
    advanceTicks(server, 20)
    expect(entity.location).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('checks arity', () => {
    const { overworld } = setup()
    expectThrown(
      () => callBare(overworld, 'spawnEntity', SHEEP),
      TypeError,
      'Incorrect number of arguments to function. Expected 2-3, received 1',
    )
  })
})

describe('entity.triggerEvent', () => {
  it('accepts the prefixed form and returns undefined', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    expect(callBare(entity, 'triggerEvent', 'minecraft:entity_born')).toBeUndefined()
  })

  it('records the call for getTriggeredEvents', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    entity.triggerEvent('minecraft:entity_born')
    expect(getTriggeredEvents(entity)).toEqual(['minecraft:entity_born'])
  })

  it('rejects a bare id with the engine message', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    expectThrown(
      () => {
        entity.triggerEvent('entity_born')
      },
      InvalidArgumentError,
      'Invalid value passed to argument [0]. The event entity_born does not exist on minecraft:sheep',
    )
  })

  it('records nothing for a rejected call', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    expect(() => {
      entity.triggerEvent('entity_born')
    }).toThrow(InvalidArgumentError)
    expect(getTriggeredEvents(entity)).toEqual([])
  })

  it('accepts a non-minecraft namespace', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    expect(callBare(entity, 'triggerEvent', 'mypack:my_event')).toBeUndefined()
    expect(getTriggeredEvents(entity)).toEqual(['mypack:my_event'])
  })

  it('records repeated calls in order, duplicates kept', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    entity.triggerEvent('minecraft:a')
    entity.triggerEvent('minecraft:b')
    entity.triggerEvent('minecraft:a')
    expect(getTriggeredEvents(entity)).toEqual(['minecraft:a', 'minecraft:b', 'minecraft:a'])
  })

  it('returns an empty log for an entity that triggered nothing', () => {
    const { server } = setup()
    expect(getTriggeredEvents(createEntity(server, { typeId: SHEEP }))).toEqual([])
  })

  it('keeps the log per entity', () => {
    const { server } = setup()
    const triggered = createEntity(server, { typeId: SHEEP })
    const other = createEntity(server, { typeId: SHEEP })
    triggered.triggerEvent('minecraft:a')
    expect(getTriggeredEvents(other)).toEqual([])
  })

  // Divergence: in the engine the event reshapes the entity.
  it('changes no state', () => {
    const { server, world, overworld } = setup()
    const entity = createEntity(server, { typeId: SHEEP, dimension: overworld, location: ORIGIN })
    entity.addTag('a')
    const spawns = collect(world.afterEvents.entitySpawn)
    const removals = collect(world.afterEvents.entityRemove)
    entity.triggerEvent('minecraft:entity_born')
    expect(entity.getTags()).toEqual(['a'])
    expect(entity.getComponents()).toEqual([])
    expect(entity.location).toEqual(ORIGIN)
    expect(entity.isValid).toBe(true)
    expect(spawns).toEqual([])
    expect(removals).toEqual([])
  })

  it('checks arity', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    expectThrown(
      () => callBare(entity, 'triggerEvent'),
      TypeError,
      'Incorrect number of arguments to function. Expected 1, received 0',
    )
  })

  it('throws InvalidEntityError on an invalidated entity', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    invalidate(entity)
    expectThrown(
      () => {
        entity.triggerEvent('minecraft:entity_born')
      },
      InvalidEntityError,
      invalidMessage('call function', 'triggerEvent'),
    )
  })
})

describe('entity.remove', () => {
  it('detaches the entity from the world registry', () => {
    const { server, world, overworld } = setup()
    const entity = createEntity(server, { typeId: SHEEP, dimension: overworld })
    const id = entity.id
    entity.remove()
    expect(world.getEntity(id)).toBeUndefined()
    expect(overworld.getEntities()).toEqual([])
  })

  it('drops a removed player from the player lookups', () => {
    const { server, world, overworld } = setup()
    const player = createPlayer(server, { dimension: overworld })
    player.remove()
    expect(world.getAllPlayers()).toEqual([])
    expect(world.getPlayers()).toEqual([])
    expect(overworld.getPlayers()).toEqual([])
  })

  it('invalidates the reference', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP, location: ORIGIN })
    entity.remove()
    expect(entity.isValid).toBe(false)
    expectThrown(() => entity.location, InvalidEntityError, invalidMessage('get property', 'location'))
  })

  it('raises the entityRemove before-event first, on a still-live entity', () => {
    const { server, world, overworld } = setup()
    const entity = createEntity(server, { typeId: SHEEP, dimension: overworld })
    const seen: { removedEntity: MC.Entity; valid: boolean; registered: boolean; tags: string[] }[] = []
    world.beforeEvents.entityRemove.subscribe((payload) => {
      seen.push({
        removedEntity: payload.removedEntity,
        valid: payload.removedEntity.isValid,
        registered: world.getEntity(payload.removedEntity.id) === payload.removedEntity,
        tags: payload.removedEntity.getTags(),
      })
    })
    entity.remove()
    expect(seen).toEqual([{ removedEntity: entity, valid: true, registered: true, tags: [] }])
  })

  it('raises the entityRemove after-event last, carrying only the two strings', () => {
    const { server, world } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    const id = entity.id
    const seen: { removedEntityId: string; typeId: string; hasEntity: boolean; gone: boolean; valid: boolean }[] = []
    world.afterEvents.entityRemove.subscribe((payload) => {
      seen.push({
        removedEntityId: payload.removedEntityId,
        typeId: payload.typeId,
        hasEntity: 'removedEntity' in payload,
        gone: world.getEntity(id) === undefined,
        valid: entity.isValid,
      })
    })
    entity.remove()
    expect(seen).toEqual([{ removedEntityId: id, typeId: SHEEP, hasEntity: false, gone: true, valid: false }])
  })

  it('runs the two events in order around one atomic detach', () => {
    const { server, world } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    const order: string[] = []
    world.beforeEvents.entityRemove.subscribe(() => order.push('before'))
    world.afterEvents.entityRemove.subscribe(() => order.push('after'))
    entity.remove()
    expect(order).toEqual(['before', 'after'])
  })

  it('never exposes a detached-but-valid entity, or the reverse', () => {
    const { server, world, overworld } = setup()
    const entity = createEntity(server, { typeId: SHEEP, dimension: overworld })
    const id = entity.id
    const states: { registered: boolean; valid: boolean }[] = []
    world.beforeEvents.entityRemove.subscribe(() => {
      states.push({ registered: world.getEntity(id) !== undefined, valid: entity.isValid })
    })
    world.afterEvents.entityRemove.subscribe(() => {
      states.push({ registered: world.getEntity(id) !== undefined, valid: entity.isValid })
    })
    entity.remove()
    expect(states).toEqual([
      { registered: true, valid: true },
      { registered: false, valid: false },
    ])
  })

  it('fires no death or damage event', () => {
    const { server, world } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    addComponent(entity, 'minecraft:health', 20)
    const deaths = collect(world.afterEvents.entityDie)
    const hurts = collect(world.afterEvents.entityHurt)
    const healthChanges = collect(world.afterEvents.entityHealthChanged)
    entity.remove()
    expect(deaths).toEqual([])
    expect(hurts).toEqual([])
    expect(healthChanges).toEqual([])
  })

  // The library raises entityRemove alone; the engine's observed five-event window is not reproduced.
  it('fires nothing else', () => {
    const { server, world } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    const spawns = collect(world.afterEvents.entitySpawn)
    const triggers = collect(world.afterEvents.dataDrivenEntityTrigger)
    const removals = collect(world.afterEvents.entityRemove)
    entity.remove()
    expect(spawns).toEqual([])
    expect(triggers).toEqual([])
    expect(removals).toHaveLength(1)
  })

  it('gives a handler no hold on the removal', () => {
    const { server, world } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    const id = entity.id
    world.beforeEvents.entityRemove.subscribe((payload) => {
      ;(payload as unknown as { cancel?: boolean }).cancel = true
    })
    entity.remove()
    expect(world.getEntity(id)).toBeUndefined()
    expect(entity.isValid).toBe(false)
  })

  it('leaves the four readable members readable after removal', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    const id = entity.id
    entity.remove()
    expect(entity.id).toBe(id)
    expect(entity.typeId).toBe(SHEEP)
    expect(entity.isValid).toBe(false)
    expect(entity.scoreboardIdentity).toBeUndefined()
  })

  it('throws InvalidEntityError on a second remove', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    entity.remove()
    expectThrown(
      () => {
        entity.remove()
      },
      InvalidEntityError,
      invalidMessage('call function', 'remove'),
    )
  })
})

describe('entity.kill on an entity with no health component', () => {
  it('returns true', () => {
    const { server } = setup()
    expect(createEntity(server, { typeId: SHEEP }).kill()).toBe(true)
  })

  it('fires entityDie with cause selfDestruct and nothing else', () => {
    const { server, world } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    const deaths = collect(world.afterEvents.entityDie)
    const hurts = collect(world.afterEvents.entityHurt)
    const healthChanges = collect(world.afterEvents.entityHealthChanged)
    entity.kill()
    expect(deaths).toHaveLength(1)
    expect(deaths[0]?.deadEntity).toBe(entity)
    expect(deaths[0]?.damageSource.cause).toBe('selfDestruct')
    expect(hurts).toEqual([])
    expect(healthChanges).toEqual([])
  })

  // The engine invalidates a health-less corpse within the call, so the fake does too.
  it('invalidates the reference', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP, location: ORIGIN })
    entity.kill()
    expect(entity.isValid).toBe(false)
    expect(() => entity.location).toThrow(InvalidEntityError)
    // The four readable members survive invalidation, as on any invalid reference.
    expect(entity.typeId).toBe(SHEEP)
  })

  // The engine delivers entityDie after kill() returned, by which time the arrow is already gone.
  it('invalidates before it raises entityDie, so the handler meets the dead reference', () => {
    const { server, world } = setup()
    const entity = createEntity(server, { typeId: SHEEP, location: ORIGIN })
    const seen: boolean[] = []
    world.afterEvents.entityDie.subscribe((event) => {
      seen.push(event.deadEntity.isValid)
    })

    entity.kill()

    expect(seen).toEqual([false])
  })

  it('leaves the entity registered', () => {
    const { server, world, overworld } = setup()
    const entity = createEntity(server, { typeId: SHEEP, dimension: overworld })
    entity.kill()
    expect(world.getEntity(entity.id)).toBe(entity)
    expect(overworld.getEntities()).toEqual([entity])
  })

  it('raises no entityRemove event', () => {
    const { server, world } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    const before = collect(world.beforeEvents.entityRemove)
    const after = collect(world.afterEvents.entityRemove)
    entity.kill()
    expect(before).toEqual([])
    expect(after).toEqual([])
  })
})

describe('invalidate', () => {
  it('invalidates without removing', () => {
    const { server, world, overworld } = setup()
    const entity = createEntity(server, { typeId: SHEEP, dimension: overworld })
    invalidate(entity)
    expect(entity.isValid).toBe(false)
    expect(world.getEntity(entity.id)).toBe(entity)
    expect(overworld.getEntities()).toEqual([entity])
  })

  it('raises no event', () => {
    const { server, world } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    const before = collect(world.beforeEvents.entityRemove)
    const after = collect(world.afterEvents.entityRemove)
    invalidate(entity)
    expect(before).toEqual([])
    expect(after).toEqual([])
  })

  it('leaves the four readable members readable', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    invalidate(entity)
    expect(entity.id).toBe('1')
    expect(entity.typeId).toBe(SHEEP)
    expect(entity.isValid).toBe(false)
    expect(entity.scoreboardIdentity).toBeUndefined()
  })

  it('throws InvalidEntityError on a property get', () => {
    const { server, overworld } = setup()
    const entity = createEntity(server, { typeId: SHEEP, dimension: overworld, location: ORIGIN })
    invalidate(entity)
    expectThrown(() => entity.location, InvalidEntityError, invalidMessage('get property', 'location'))
    expectThrown(() => entity.dimension, InvalidEntityError, invalidMessage('get property', 'dimension'))
    expectThrown(() => entity.isSneaking, InvalidEntityError, invalidMessage('get property', 'isSneaking'))
  })

  // The engine names the set shape even for a read of nameTag.
  it('names the set shape for nameTag, read or written', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    invalidate(entity)
    expectThrown(() => entity.nameTag, InvalidEntityError, invalidMessage('set property', 'nameTag'))
    expectThrown(
      () => {
        entity.nameTag = 'x'
      },
      InvalidEntityError,
      invalidMessage('set property', 'nameTag'),
    )
  })

  it('names the call shape for a method and for localizationKey', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    invalidate(entity)
    expectThrown(() => entity.getTags(), InvalidEntityError, invalidMessage('call function', 'getTags'))
    expectThrown(() => entity.localizationKey, InvalidEntityError, invalidMessage('call function', 'localizationKey'))
  })

  it('carries the entity identity on the error', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    const id = entity.id
    invalidate(entity)
    const error = expectThrown(() => entity.getTags(), InvalidEntityError, invalidMessage('call function', 'getTags'))
    expect(error.id).toBe(id)
    expect(error.type).toBe(SHEEP)
    expect(error.name).toBe('InvalidEntityError')
  })

  it('fires the guard at the call, not at the access', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    const captured = entity.getTags.bind(entity)
    invalidate(entity)
    expectThrown(() => captured(), InvalidEntityError, invalidMessage('call function', 'getTags'))
  })

  it('leaves a guarded method readable on an invalidated entity', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    invalidate(entity)
    expect(typeof entity.getTags).toBe('function')
  })

  it('is idempotent', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    invalidate(entity)
    invalidate(entity)
    expect(entity.isValid).toBe(false)
  })

  it('invalidates a player the same way', () => {
    const { server } = setup()
    const player = createPlayer(server, { name: 'Alex' })
    const id = player.id
    invalidate(player)
    expectThrown(() => player.name, InvalidEntityError, invalidMessage('get property', 'name'))
    expect(player.id).toBe(id)
  })

  it('leaves other entities alone', () => {
    const { server } = setup()
    const invalidated = createEntity(server, { typeId: SHEEP })
    const other = createEntity(server, { typeId: SHEEP })
    invalidate(invalidated)
    expect(other.isValid).toBe(true)
    expect(other.getTags()).toEqual([])
  })

  it('reads identically to a valid entity structurally', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    const shape = (subject: MC.Entity): Record<string, unknown> => ({
      teleport: 'teleport' in subject,
      nameTag: 'nameTag' in subject,
      notAMember: 'notAMember' in subject,
      teleportType: typeof subject.teleport,
    })
    const valid = shape(entity)
    invalidate(entity)
    expect(valid).toEqual({ teleport: true, nameTag: true, notAMember: false, teleportType: 'function' })
    expect(shape(entity)).toEqual(valid)
  })

  it('exposes exactly two own enumerable properties, valid or not', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    const shape = (subject: MC.Entity): Record<string, unknown> => {
      const walked: string[] = []
      for (const key in subject) {
        walked.push(key)
      }
      return {
        keys: Object.keys(subject),
        ownNames: Object.getOwnPropertyNames(subject),
        json: JSON.parse(JSON.stringify(subject)) as unknown,
        walked: walked.length,
      }
    }
    const valid = shape(entity)
    invalidate(entity)
    expect(valid).toEqual({
      keys: ['typeId', 'id'],
      ownNames: ['typeId', 'id'],
      json: { typeId: SHEEP, id: '1' },
      walked: EntityManifest.methods.length + EntityManifest.properties.length,
    })
    expect(shape(entity)).toEqual(valid)
  })
})

describe('unmodelled entity and dimension members', () => {
  it('throws NotImplementedError from a declared but unmodelled entity member', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    const error = expectThrown(
      () => {
        entity.teleport(ORIGIN)
      },
      NotImplementedError,
      notImplementedMessage('Entity.teleport'),
    )
    expect(error.member).toBe('Entity.teleport')
  })

  it('throws NotImplementedError from the other entity lookups', () => {
    const { server, overworld } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    expectThrown(
      () => overworld.getEntitiesAtBlockLocation(ORIGIN),
      NotImplementedError,
      notImplementedMessage('Dimension.getEntitiesAtBlockLocation'),
    )
    expectThrown(
      () => overworld.getEntitiesFromRay(ORIGIN, { x: 0, y: 1, z: 0 }),
      NotImplementedError,
      notImplementedMessage('Dimension.getEntitiesFromRay'),
    )
    expectThrown(
      () => entity.getEntitiesFromViewDirection(),
      NotImplementedError,
      notImplementedMessage('Entity.getEntitiesFromViewDirection'),
    )
  })

  it('throws NotImplementedError rather than undefined for an unmodelled member declared T or undefined', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    expectThrown(
      () => entity.getBlockFromViewDirection(),
      NotImplementedError,
      notImplementedMessage('Entity.getBlockFromViewDirection'),
    )
  })

  it('throws NotImplementedError from setRotation', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    expectThrown(
      () => {
        entity.setRotation({ x: 0, y: 0 })
      },
      NotImplementedError,
      notImplementedMessage('Entity.setRotation'),
    )
  })

  it('puts the guard ahead of NotImplementedError', () => {
    const { server } = setup()
    const entity = createEntity(server, { typeId: SHEEP })
    invalidate(entity)
    expectThrown(
      () => {
        entity.teleport(ORIGIN)
      },
      InvalidEntityError,
      invalidMessage('call function', 'teleport'),
    )
  })
})
