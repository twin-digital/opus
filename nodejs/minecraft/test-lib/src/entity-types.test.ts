/**
 * The `EntityTypes` type catalog: registration, lookup, the `EntityType` shape, and the spawn path
 * that resolves through it.
 */

import type * as MC from '@minecraft/server'
import { describe, expect, it } from 'vitest'

import { createServer, type FakeServer } from './create-server.js'
import { createEntity, createPlayer } from './entity.js'
import { registerEntityType } from './entity-types.js'
import { InvalidArgumentError } from './errors.js'
import { withVanillaDimensions } from './presets.js'

type Fn = (...args: unknown[]) => unknown

/** Calls that break arity or argument types on purpose go through here rather than a cast per line. */
const loosely = (value: object): Record<string, Fn> => value as unknown as Record<string, Fn>

const setup = (): { server: FakeServer; overworld: MC.Dimension } => {
  const server = createServer()
  withVanillaDimensions(server)
  return { server, overworld: server.world.getDimension('overworld') }
}

// ---------------------------------------------------------------------------
// The catalog belongs to the server
// ---------------------------------------------------------------------------

describe('the type catalog', () => {
  it('starts empty', () => {
    expect(createServer().EntityTypes.getAll()).toEqual([])
  })

  it('answers a lookup whenever a test makes one — the fakes have no early phase', () => {
    // The engine refuses every catalog read during early execution; nothing here reproduces that.
    const server = createServer()
    expect(server.EntityTypes.get('minecraft:sheep')).toBeUndefined()
    registerEntityType(server, 'minecraft:sheep')
    expect(server.EntityTypes.get('minecraft:sheep')?.id).toBe('minecraft:sheep')
  })

  it('is one object per server, so two servers share nothing', () => {
    const a = createServer()
    const b = createServer()
    registerEntityType(a, 'mypack:guard')
    expect(a.EntityTypes.get('mypack:guard')).toBeDefined()
    expect(b.EntityTypes.get('mypack:guard')).toBeUndefined()
    expect(b.EntityTypes.getAll()).toEqual([])
  })

  it('is a different class object on each server', () => {
    expect(createServer().EntityTypes).not.toBe(createServer().EntityTypes)
  })

  it('holds no state at module scope: a fresh server is empty however many came before', () => {
    registerEntityType(createServer(), 'mypack:leftover')
    expect(createServer().EntityTypes.getAll()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('registerEntityType', () => {
  it('registers the type and returns it', () => {
    const server = createServer()
    const type = registerEntityType(server, 'mypack:guard')
    expect(server.EntityTypes.get('mypack:guard')).toBe(type)
  })

  it('normalizes a bare id on entry and reports the canonical prefixed form', () => {
    const server = createServer()
    expect(registerEntityType(server, 'sheep').id).toBe('minecraft:sheep')
    expect(server.EntityTypes.get('minecraft:sheep')?.id).toBe('minecraft:sheep')
  })

  it('refuses a duplicate rather than replacing the entry a test already holds', () => {
    const server = createServer()
    const first = registerEntityType(server, 'mypack:guard')
    expect(() => registerEntityType(server, 'mypack:guard')).toThrow(InvalidArgumentError)
    expect(server.EntityTypes.get('mypack:guard')).toBe(first)
  })

  it('reads the bare and prefixed spellings as the same registration', () => {
    const server = createServer()
    registerEntityType(server, 'minecraft:sheep')
    expect(() => registerEntityType(server, 'sheep')).toThrow(InvalidArgumentError)
  })

  it('leaves both branches arrangeable from the start', () => {
    const server = createServer()
    registerEntityType(server, 'mypack:guard')
    expect(server.EntityTypes.get('mypack:guard')).toBeDefined()
    expect(server.EntityTypes.get('mypack:absent')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// The EntityType shape
// ---------------------------------------------------------------------------

describe('an EntityType', () => {
  it('carries id and localizationKey and nothing else, both own value properties', () => {
    const type = registerEntityType(createServer(), 'minecraft:sheep')
    expect(Object.keys(type).sort()).toEqual(['id', 'localizationKey'])
    for (const member of ['id', 'localizationKey']) {
      const descriptor = Object.getOwnPropertyDescriptor(type, member)
      expect(descriptor?.get).toBeUndefined()
      expect(typeof descriptor?.value).toBe('string')
    }
  })

  it('derives the key from a vanilla id with the namespace stripped', () => {
    expect(registerEntityType(createServer(), 'minecraft:sheep').localizationKey).toBe('entity.sheep.name')
  })

  it('derives the key from a pack-defined id with the namespace kept', () => {
    expect(registerEntityType(createServer(), 'mctest:probe_dummy').localizationKey).toBe(
      'entity.mctest:probe_dummy.name',
    )
  })

  it('reads back a supplied key instead of the derived one', () => {
    expect(registerEntityType(createServer(), 'mypack:guard', 'entity.custom.name').localizationKey).toBe(
      'entity.custom.name',
    )
  })

  it('is one object the catalog keeps, not a value rebuilt per call', () => {
    const server = createServer()
    registerEntityType(server, 'minecraft:sheep')
    expect(server.EntityTypes.get('minecraft:sheep')).toBe(server.EntityTypes.get('minecraft:sheep'))
  })
})

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

describe('EntityTypes.get', () => {
  it('resolves a bare identifier as minecraft:<id> and nothing else', () => {
    const server = createServer()
    registerEntityType(server, 'minecraft:sheep')
    expect(server.EntityTypes.get('sheep')).toBe(server.EntityTypes.get('minecraft:sheep'))
  })

  it('does not answer a pack-defined type by its bare name', () => {
    const server = createServer()
    registerEntityType(server, 'mctest:probe_dummy')
    expect(server.EntityTypes.get('probe_dummy')).toBeUndefined()
  })

  it('returns undefined for every miss rather than throwing', () => {
    const server = createServer()
    registerEntityType(server, 'minecraft:sheep')
    for (const identifier of ['mctest:nothing_registers_this', 'minecraft:nothing_registers_this', '', 'minecraft:']) {
      expect(server.EntityTypes.get(identifier), identifier).toBeUndefined()
    }
  })

  it('matches exactly — whitespace and case differences miss', () => {
    const server = createServer()
    registerEntityType(server, 'minecraft:sheep')
    expect(server.EntityTypes.get(' minecraft:sheep ')).toBeUndefined()
    expect(server.EntityTypes.get('minecraft:Sheep')).toBeUndefined()
  })

  it('checks arity in the engine wording', () => {
    const { EntityTypes } = createServer()
    expect(() => loosely(EntityTypes).get()).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 1, received 0'),
    )
    expect(() => loosely(EntityTypes).get('a', 'b')).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 1, received 2'),
    )
    expect(() => loosely(EntityTypes).getAll('a')).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 0, received 1'),
    )
  })

  it('splits a wrong-typed argument four ways, as the engine does', () => {
    const { EntityTypes } = createServer()
    const get =
      (value: unknown): (() => unknown) =>
      (): unknown =>
        loosely(EntityTypes).get(value)

    for (const value of [undefined, null]) {
      expect(get(value)).toThrow(new InvalidArgumentError('Invalid type passed to argument [0]. Expected type: string'))
    }
    for (const value of [1, true, Symbol('s'), ['a'], (): void => undefined]) {
      expect(get(value), typeof value).toThrow(
        new TypeError('Native type conversion failed. Function argument [0] expected type: string'),
      )
    }
    expect(get({})).toThrow(
      new TypeError('Object did not have a native handle. Function argument [0] expected type: string'),
    )
    expect(get(new String('minecraft:sheep'))).toThrow(
      new TypeError('Object has an invalid native handle. Function argument [0] expected type: string'),
    )
  })
})

describe('EntityTypes.getAll', () => {
  it('reports in registration order', () => {
    const server = createServer()
    registerEntityType(server, 'mypack:c')
    registerEntityType(server, 'mypack:a')
    registerEntityType(server, 'mypack:b')
    expect(server.EntityTypes.getAll().map((type) => type.id)).toEqual(['mypack:c', 'mypack:a', 'mypack:b'])
  })

  it('hands back a fresh array each call over the same entry objects', () => {
    const server = createServer()
    registerEntityType(server, 'minecraft:sheep')
    const first = server.EntityTypes.getAll()
    const second = server.EntityTypes.getAll()
    expect(first).not.toBe(second)
    expect(first[0]).toBe(second[0])
    expect(first[0]).toBe(server.EntityTypes.get('minecraft:sheep'))
  })
})

// ---------------------------------------------------------------------------
// What the catalog gates
// ---------------------------------------------------------------------------

describe('dimension.spawnEntity', () => {
  it('resolves through the catalog and spawns a registered type', () => {
    const { server, overworld } = setup()
    registerEntityType(server, 'minecraft:sheep')
    expect(overworld.spawnEntity('minecraft:sheep', { x: 0, y: 0, z: 0 }).typeId).toBe('minecraft:sheep')
  })

  it('throws InvalidArgumentError naming the identifier where nothing registers it', () => {
    const { overworld } = setup()
    expect(() => overworld.spawnEntity('mctest:absent', { x: 0, y: 0, z: 0 })).toThrow(
      new InvalidArgumentError("Invalid value passed to argument [0]. 'mctest:absent' is not a valid entity type."),
    )
  })

  it('names the minecraft namespace in the error a bare identifier earns', () => {
    const { overworld } = setup()
    expect(() => overworld.spawnEntity('probe_dummy', { x: 0, y: 0, z: 0 })).toThrow(
      new InvalidArgumentError(
        "Invalid value passed to argument [0]. 'minecraft:probe_dummy' is not a valid entity type.",
      ),
    )
  })

  it('accepts an EntityType wherever it accepts an id, reading its id and nothing else', () => {
    const { server, overworld } = setup()
    const type = registerEntityType(server, 'mypack:guard')
    expect(overworld.spawnEntity(type, { x: 0, y: 0, z: 0 }).typeId).toBe('mypack:guard')
  })

  it('refuses an EntityType whose id this server does not register', () => {
    const { overworld } = setup()
    const foreign = registerEntityType(createServer(), 'mypack:guard')
    expect(() => overworld.spawnEntity(foreign, { x: 0, y: 0, z: 0 })).toThrow(InvalidArgumentError)
  })

  it('agrees with the lookup on the same identifier', () => {
    const { server, overworld } = setup()
    registerEntityType(server, 'minecraft:sheep')
    for (const identifier of ['minecraft:sheep', 'sheep', 'mctest:absent', 'probe_dummy']) {
      const found = server.EntityTypes.get(identifier) !== undefined
      let spawned = true
      try {
        overworld.spawnEntity(identifier, { x: 0, y: 0, z: 0 })
      } catch {
        spawned = false
      }
      expect(spawned, identifier).toBe(found)
    }
  })
})

describe('the library-only creation paths', () => {
  it('do not consult the catalog: the engine declares no function at all for them', () => {
    const server = createServer()
    expect(createEntity(server, { typeId: 'mctest:absent' }).typeId).toBe('mctest:absent')
    expect(createPlayer(server, { name: 'Bob' }).typeId).toBe('minecraft:player')
  })

  it('take a typeId string, not an EntityType', () => {
    const server = createServer()
    const type = registerEntityType(server, 'mypack:guard')
    // @ts-expect-error createEntity stays string-only; spawnEntity is the surface that takes a type
    expect(() => createEntity(server, { typeId: type })).not.toThrow(InvalidArgumentError)
  })
})
