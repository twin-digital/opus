/**
 * The bundle, the generated shape, and the arity check.
 *
 * The entity fakes here are built through the runtime seam rather than `createEntity`, because what
 * is under test is the generated surface itself — the emission rule, the arity check and the
 * delegation seam — and not the entity model that hangs behind it.
 */

import { describe, expect, it } from 'vitest'

import type * as MC from '@minecraft/server'

import { createServer } from './create-server.js'
import { createEntity } from './entity.js'
import { NotImplementedError } from './errors.js'
import { getHandlerErrors } from './events.js'
import { FAKE_CLASSES } from './generated/index.js'
import * as manifests from './generated/manifests.js'
import { withVanillaDimensions } from './presets.js'
import { construct } from './runtime/construct.js'
import { delegate, stateOf } from './runtime/member.js'
import { serverOf, type ServerState } from './runtime/state.js'
import { advanceTicks } from './scheduler.js'

type Fn = (...args: unknown[]) => unknown
type Bag = Record<string, unknown>
type Server = ReturnType<typeof createServer>

/** One faked class's manifest, read by name from the generated module. */
interface AnyManifest {
  readonly methods: readonly { readonly name: string; readonly minArity: number; readonly maxArity: number }[]
  readonly properties: readonly string[]
}

/** Calls that break arity or types on purpose go through here rather than a cast per line. */
const loosely = (value: object): Record<string, Fn> => value as unknown as Record<string, Fn>

const manifestFor = (className: string): AnyManifest => {
  const manifest = (manifests as unknown as Record<string, AnyManifest | undefined>)[`${className}Manifest`]
  if (!manifest) {
    throw new TypeError(`no manifest for ${className}`)
  }
  return manifest
}

const placeholders = (count: number): unknown[] => Array.from({ length: count }, () => 'minecraft:test')

const stateFor = (server: Server): ServerState => serverOf(server.world)

/** An entity fake built straight from the generated class, with no entity model behind it. */
const makeEntity = (server: Server, typeId = 'minecraft:sheep', id = '-42'): MC.Entity =>
  construct('Entity', {
    data: { server: stateFor(server), typeId, id },
    own: { typeId, id },
  }) as MC.Entity

const invalidateFake = (fake: object): void => {
  stateOf(fake).valid = false
}

const REGISTRY_NAMES = [
  'BiomeTypes',
  'BlockStates',
  'BlockTypes',
  'DimensionTypes',
  'EffectTypes',
  'EnchantmentTypes',
  'EntityTypes',
  'ItemTypes',
] as const

// ---------------------------------------------------------------------------
// The bundle
// ---------------------------------------------------------------------------

describe('createServer', () => {
  it('returns the ten names @minecraft/server exports', () => {
    expect(Object.keys(createServer()).sort()).toEqual([
      'BiomeTypes',
      'BlockStates',
      'BlockTypes',
      'DimensionTypes',
      'EffectTypes',
      'EnchantmentTypes',
      'EntityTypes',
      'ItemTypes',
      'system',
      'world',
    ])
  })

  it('hands back a world object', () => {
    const { world } = createServer()
    expect(typeof world).toBe('object')
    expect(world.constructor.name).toBe('FakeWorld')
  })

  it('hands back a system object', () => {
    const { system } = createServer()
    expect(typeof system).toBe('object')
    expect(system.constructor.name).toBe('FakeSystem')
  })

  it("carries the world's event-signal containers", () => {
    const { world } = createServer()
    expect(typeof world.afterEvents).toBe('object')
    expect(typeof world.beforeEvents).toBe('object')
  })

  it('carries a scoreboard', () => {
    expect(typeof createServer().world.scoreboard).toBe('object')
  })
})

// ---------------------------------------------------------------------------
// Populating nothing, and instance-scoped state
// ---------------------------------------------------------------------------

describe('createServer populates nothing', () => {
  it('registers no dimensions', () => {
    expect(() => createServer().world.getDimension('overworld')).toThrow(new Error("Dimension 'overworld' is invalid."))
  })

  it('has no players', () => {
    const { world } = createServer()
    expect(world.getAllPlayers()).toEqual([])
    expect(world.getPlayers()).toEqual([])
  })

  it('has no objectives', () => {
    expect(createServer().world.scoreboard.getObjectives()).toEqual([])
  })

  it('has no dynamic properties', () => {
    const { world } = createServer()
    expect(world.getDynamicPropertyIds()).toEqual([])
    expect(world.getDynamicProperty('anything')).toBeUndefined()
  })

  it('starts the tick counter at zero', () => {
    expect(createServer().system.currentTick).toBe(0)
  })

  it('records no handler errors', () => {
    expect(getHandlerErrors(createServer())).toEqual([])
  })
})

describe('instance-scoped state', () => {
  it('shares no dimensions between two bundles', () => {
    const a = createServer()
    const b = createServer()
    withVanillaDimensions(a)
    expect(a.world.getDimension('overworld').id).toBe('minecraft:overworld')
    expect(() => b.world.getDimension('overworld')).toThrow("Dimension 'overworld' is invalid.")
  })

  it('shares no entities between two bundles', () => {
    const a = createServer()
    const b = createServer()
    const entity = createEntity(a, { typeId: 'minecraft:sheep' })
    expect(a.world.getEntity(entity.id)).toBe(entity)
    expect(b.world.getEntity(entity.id)).toBeUndefined()
  })

  it('issues ids independently in each bundle', () => {
    expect(createEntity(createServer(), { typeId: 'minecraft:sheep' }).id).toBe('1')
    expect(createEntity(createServer(), { typeId: 'minecraft:cow' }).id).toBe('1')
  })

  it('shares no ticks between two bundles', () => {
    const a = createServer()
    const b = createServer()
    advanceTicks(a, 5)
    expect(a.system.currentTick).toBe(5)
    expect(b.system.currentTick).toBe(0)
  })

  it('shares no world dynamic properties between two bundles', () => {
    const a = createServer()
    const b = createServer()
    a.world.setDynamicProperty('key', 'value')
    expect(a.world.getDynamicProperty('key')).toBe('value')
    expect(b.world.getDynamicProperty('key')).toBeUndefined()
  })

  it('hands out the same world and scoreboard on every read', () => {
    const server = createServer()
    expect(server.world).toBe(server.world)
    expect(server.world.scoreboard).toBe(server.world.scoreboard)
  })
})

// ---------------------------------------------------------------------------
// The eight registry classes
// ---------------------------------------------------------------------------

describe('registry classes', () => {
  it('are classes, not object literals', () => {
    const server = createServer()
    for (const name of REGISTRY_NAMES) {
      const registry: unknown = (server as unknown as Bag)[name]
      expect(typeof registry).toBe('function')
      expect('prototype' in (registry as object)).toBe(true)
    }
  })

  it('throw NotImplementedError from every declared member', () => {
    const server = createServer()
    let reached = 0
    for (const name of REGISTRY_NAMES) {
      const registry = (server as unknown as Bag)[name] as object
      const manifest = manifestFor(name)
      for (const method of manifest.methods) {
        reached++
        expect(() => loosely(registry)[method.name].apply(registry, placeholders(method.minArity))).toThrow(
          NotImplementedError,
        )
      }
      for (const property of manifest.properties) {
        reached++
        expect(() => (registry as Bag)[property]).toThrow(NotImplementedError)
      }
    }
    expect(reached).toBeGreaterThan(0)
  })

  it('name the member they did not model', () => {
    const server = createServer()
    let caught: unknown
    try {
      server.BiomeTypes.get('minecraft:plains')
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(NotImplementedError)
    expect((caught as NotImplementedError).member).toBe('BiomeTypes.get')
    expect((caught as Error).message).toBe(
      'BiomeTypes.get is declared by @minecraft/server but is not modelled by this library.',
    )
  })

  it('check arity before throwing NotImplementedError', () => {
    const server = createServer()
    expect(() => loosely(server.BiomeTypes).get()).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 1, received 0'),
    )
  })

  it('are the same class objects for every bundle', () => {
    expect(createServer().BiomeTypes).toBe(createServer().BiomeTypes)
  })

  it('leave DimensionTypes untouched when the dimension preset runs', () => {
    const server = createServer()
    withVanillaDimensions(server)
    expect(() => server.DimensionTypes.getAll()).toThrow(NotImplementedError)
  })
})

// ---------------------------------------------------------------------------
// The generated shape
// ---------------------------------------------------------------------------

describe('generated shape', () => {
  it('puts a declared but unmodelled member on the prototype', () => {
    expect('teleport' in makeEntity(createServer())).toBe(true)
  })

  it('answers false for a name the API does not declare', () => {
    expect('notAMember' in makeEntity(createServer())).toBe(false)
  })

  it('answers true for a guarded property name', () => {
    expect('nameTag' in makeEntity(createServer())).toBe(true)
  })

  it('answers the same structural reads on an invalidated entity', () => {
    const entity = makeEntity(createServer())
    invalidateFake(entity)
    expect('teleport' in entity).toBe(true)
    expect('nameTag' in entity).toBe(true)
    expect('notAMember' in entity).toBe(false)
    expect(typeof entity.teleport).toBe('function')
    expect(typeof (entity as unknown as Bag).notAMember).toBe('undefined')
  })

  it('reads exactly two own properties through Object.keys, in the engine order', () => {
    expect(Object.keys(makeEntity(createServer()))).toEqual(['typeId', 'id'])
  })

  it('reads exactly two own properties through getOwnPropertyNames, in the engine order', () => {
    expect(Object.getOwnPropertyNames(makeEntity(createServer()))).toEqual(['typeId', 'id'])
  })

  it('copies exactly two properties through spread', () => {
    // eslint-disable-next-line @typescript-eslint/no-misused-spread -- spreading a fake is the case under test
    const copy = { ...makeEntity(createServer()) }
    expect(Object.keys(copy)).toEqual(['typeId', 'id'])
    expect(copy).toEqual({ typeId: 'minecraft:sheep', id: '-42' })
  })

  it('serialises exactly two properties through JSON.stringify, in the engine order', () => {
    expect(JSON.stringify(makeEntity(createServer()))).toBe('{"typeId":"minecraft:sheep","id":"-42"}')
  })

  it('serialises the same two properties on an invalidated entity', () => {
    const entity = makeEntity(createServer())
    invalidateFake(entity)
    expect(JSON.stringify(entity)).toBe('{"typeId":"minecraft:sheep","id":"-42"}')
  })

  it('reaches 62 members through for-in', () => {
    let count = 0
    for (const _name in makeEntity(createServer())) {
      count++
    }
    expect(count).toBe(62)
  })

  it('reaches 62 members through for-in on an invalidated entity', () => {
    const entity = makeEntity(createServer())
    invalidateFake(entity)
    let count = 0
    for (const _name in entity) {
      count++
    }
    expect(count).toBe(62)
  })

  it('keeps methods off the instance', () => {
    const entity = makeEntity(createServer())
    const own = Object.getOwnPropertyNames(entity)
    expect(own).not.toContain('teleport')
    expect(own).not.toContain('addTag')
    const prototype = Object.getPrototypeOf(entity) as object
    expect(Object.getOwnPropertyNames(prototype)).toEqual(expect.arrayContaining(['teleport', 'addTag']))
  })

  it('defines a prototype accessor enumerable and configurable', () => {
    const prototype = Object.getPrototypeOf(makeEntity(createServer())) as object
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'nameTag')
    expect(descriptor?.enumerable).toBe(true)
    expect(descriptor?.configurable).toBe(true)
  })

  it('defines every prototype member of Entity enumerable', () => {
    const prototype = Object.getPrototypeOf(makeEntity(createServer())) as object
    const names = Object.getOwnPropertyNames(prototype).filter((name) => name !== 'constructor')
    expect(names).toHaveLength(60)
    for (const name of names) {
      expect(Object.getOwnPropertyDescriptor(prototype, name)?.enumerable).toBe(true)
    }
  })

  it('carries every member the declarations give Entity', () => {
    const entity = makeEntity(createServer())
    const prototype = Object.getPrototypeOf(entity) as object
    const emitted = new Set([
      ...Object.getOwnPropertyNames(entity),
      ...Object.getOwnPropertyNames(prototype).filter((name) => name !== 'constructor'),
    ])
    const manifest = manifestFor('Entity')
    expect(manifest.properties).toHaveLength(16)
    expect(manifest.methods).toHaveLength(46)
    for (const name of [...manifest.properties, ...manifest.methods.map((method) => method.name)]) {
      expect(emitted.has(name)).toBe(true)
    }
    expect(emitted.size).toBe(62)
  })

  it('uses no Proxy', async () => {
    const { types } = await import('node:util')
    expect(types.isProxy(makeEntity(createServer()))).toBe(false)
  })

  it('gives every faked class a constructor', () => {
    expect(manifests.FAKED_CLASSES).toHaveLength(165)
    for (const name of manifests.FAKED_CLASSES) {
      const FakeClass: unknown = (FAKE_CLASSES as unknown as Bag)[name]
      expect(typeof FakeClass).toBe('function')
      expect('prototype' in (FakeClass as object)).toBe(true)
    }
  })

  it('defines every prototype member of every faked class enumerable', () => {
    const nonEnumerable: string[] = []
    for (const name of manifests.FAKED_CLASSES) {
      const prototype = ((FAKE_CLASSES as unknown as Bag)[name] as { prototype: object }).prototype
      for (const member of Object.getOwnPropertyNames(prototype)) {
        if (member === 'constructor') {
          continue
        }
        if (Object.getOwnPropertyDescriptor(prototype, member)?.enumerable !== true) {
          nonEnumerable.push(`${name}.${member}`)
        }
      }
    }
    expect(nonEnumerable).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// A spy library, wrapped by assignment
// ---------------------------------------------------------------------------

describe('spy libraries', () => {
  it('finds a manual wrap on the next call', () => {
    const entity = makeEntity(createServer())
    const calls: unknown[][] = []
    const original = entity.addTag.bind(entity)
    loosely(entity).addTag = (...args: unknown[]): unknown => {
      calls.push(args)
      return original(...(args as [string]))
    }
    expect(entity.addTag('x')).toBe(true)
    expect(calls).toEqual([['x']])
    expect(entity.hasTag('x')).toBe(true)
  })

  it('keeps a wrap in front of an unmodelled member', () => {
    const entity = makeEntity(createServer())
    let entered = 0
    const original = entity.teleport.bind(entity)
    loosely(entity).teleport = (...args: unknown[]): void => {
      entered++
      original(...(args as [MC.Vector3]))
    }
    expect(() => {
      entity.teleport({ x: 0, y: 0, z: 0 })
    }).toThrow(NotImplementedError)
    expect(entered).toBe(1)
  })

  it('returns the prototype member when the wrap is removed', () => {
    const entity = makeEntity(createServer())
    loosely(entity).addTag = () => true
    expect(Object.keys(entity)).toHaveLength(3)
    delete loosely(entity).addTag
    const prototype = Object.getPrototypeOf(entity) as Bag
    expect(entity.addTag).toBe(prototype.addTag)
    expect(Object.keys(entity)).toEqual(['typeId', 'id'])
  })

  it('preserves the arity check behind a wrap', () => {
    const entity = makeEntity(createServer())
    const original = entity.addTag.bind(entity)
    loosely(entity).addTag = (...args: unknown[]): unknown => original(...(args as [string]))
    expect(() => loosely(entity).addTag()).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 1, received 0'),
    )
  })
})

// ---------------------------------------------------------------------------
// The arity check
// ---------------------------------------------------------------------------

describe('arity', () => {
  it('reports both bounds when they differ', () => {
    expect(() => loosely(makeEntity(createServer())).addEffect()).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 2-3, received 0'),
    )
  })

  it('reports one number when the bounds agree', () => {
    expect(() => loosely(makeEntity(createServer())).addTag()).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 1, received 0'),
    )
  })

  it('reports the number of arguments received', () => {
    expect(() => loosely(makeEntity(createServer())).addEffect('minecraft:speed')).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 2-3, received 1'),
    )
  })

  it('throws TypeError and no library error class', () => {
    let caught: unknown
    try {
      loosely(makeEntity(createServer())).addTag()
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(TypeError)
    expect(caught).not.toBeInstanceOf(NotImplementedError)
  })

  it('enforces the minimum only', () => {
    const entity = makeEntity(createServer())
    expect(() => entity.addEffect('minecraft:speed', 10)).not.toThrow(TypeError)
  })

  it('ignores extra arguments', () => {
    const entity = makeEntity(createServer())
    expect(loosely(entity).addTag('a', 'b', 'c')).toBe(true)
    expect(entity.hasTag('a')).toBe(true)
  })

  it('ignores extra arguments on a member declared with a range', () => {
    const entity = makeEntity(createServer())
    let caught: unknown
    try {
      loosely(entity).addEffect('minecraft:speed', 10, {}, 'extra')
    } catch (error) {
      caught = error
    }
    expect(caught).not.toBeInstanceOf(TypeError)
  })

  it('runs ahead of the validity guard', async () => {
    const { InvalidEntityError } = await import('./errors.js')
    const entity = makeEntity(createServer())
    invalidateFake(entity)
    expect(() => loosely(entity).addTag()).toThrow(TypeError)
    expect(() => entity.addTag('x')).toThrow(InvalidEntityError)
  })

  it('runs ahead of the validity guard on a member declared with a range', async () => {
    const { InvalidEntityError } = await import('./errors.js')
    const entity = makeEntity(createServer())
    invalidateFake(entity)
    expect(() => loosely(entity).addEffect()).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 2-3, received 0'),
    )
    expect(() => entity.addEffect('minecraft:speed', 10)).toThrow(InvalidEntityError)
  })

  it('runs ahead of NotImplementedError', () => {
    const entity = makeEntity(createServer())
    expect(() => loosely(entity).teleport()).toThrow(TypeError)
    expect(() => {
      entity.teleport({ x: 0, y: 0, z: 0 })
    }).toThrow(NotImplementedError)
  })

  it('checks nothing on a member declaring no required parameter', () => {
    const entity = makeEntity(createServer())
    expect(() => entity.getTags()).not.toThrow(TypeError)
    expect(() => loosely(entity).getTags('junk')).not.toThrow(TypeError)
  })

  it('counts arguments rather than defined arguments', () => {
    const entity = makeEntity(createServer())
    expect(() => loosely(entity).addEffect('minecraft:speed', undefined)).not.toThrow(TypeError)
  })

  it("matches the declared minimum for every one of Entity's methods", () => {
    const entity = makeEntity(createServer())
    const wrong: string[] = []
    for (const { name, minArity, maxArity } of manifestFor('Entity').methods) {
      if (minArity === 0) {
        continue
      }
      const expected = minArity === maxArity ? String(minArity) : `${String(minArity)}-${String(maxArity)}`
      const message = `Incorrect number of arguments to function. Expected ${expected}, received ${String(minArity - 1)}`
      try {
        loosely(entity)[name].apply(entity, placeholders(minArity - 1))
        wrong.push(`${name}: did not throw`)
      } catch (error) {
        if (!(error instanceof TypeError) || error.message !== message) {
          wrong.push(`${name}: ${(error as Error).message}`)
        }
      }
    }
    expect(wrong).toEqual([])
  })

  it('declares no overloaded member on any faked class', () => {
    const duplicated: string[] = []
    for (const className of manifests.FAKED_CLASSES) {
      const seen = new Set<string>()
      for (const { name } of manifestFor(className).methods) {
        if (seen.has(name)) {
          duplicated.push(`${className}.${name}`)
        }
        seen.add(name)
      }
    }
    expect(duplicated).toEqual([])
  })

  it('declares no minimum above its maximum', () => {
    const bad: string[] = []
    for (const className of manifests.FAKED_CLASSES) {
      for (const { name, minArity, maxArity } of manifestFor(className).methods) {
        if (minArity > maxArity || minArity < 0 || !Number.isInteger(minArity) || !Number.isInteger(maxArity)) {
          bad.push(`${className}.${name}`)
        }
      }
    }
    expect(bad).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The whole generated surface
// ---------------------------------------------------------------------------

/** What one swept member did: the value it returned, or the error it threw. */
interface Outcome {
  readonly returned?: unknown
  readonly error?: unknown
}

/** One member to sweep: its name, whether it is called, and the arguments it needs. */
interface SweptMember {
  readonly name: string
  readonly isMethod: boolean
  readonly args: unknown[]
}

const membersOf = (className: string): SweptMember[] => {
  const manifest = manifestFor(className)
  return [
    ...manifest.properties.map((name) => ({ name, isMethod: false, args: [] })),
    ...manifest.methods.map((method) => ({
      name: method.name,
      isMethod: true,
      args: placeholders(method.minArity),
    })),
  ]
}

const run = (target: object, member: SweptMember): Outcome => {
  try {
    return member.isMethod ?
        { returned: loosely(target)[member.name].apply(target, member.args) }
      : { returned: (target as Bag)[member.name] }
  } catch (error) {
    return { error }
  }
}

/**
 * Every declared member of every faked class, called at its declared minimum arity. The generator
 * is one program whose defects reproduce across all of them, so this walks the whole surface rather
 * than a sample: a member answering `undefined` with no behaviour registered behind it never
 * reached the delegation seam.
 */
describe('the whole generated surface', () => {
  const server = createServer()
  const state = stateFor(server)

  /** The instance to call members on, and the class object the static-only registries keep them on. */
  const targetsFor = (className: string): { instance: object; statics: object } => ({
    instance: construct(className, { data: { server: state }, own: { typeId: 'minecraft:sheep', id: '1' } }),
    statics: (FAKE_CLASSES as unknown as Bag)[className] as object,
  })

  it('answers every declared member without ever reading undefined off nothing', () => {
    const fabricated: string[] = []
    let swept = 0

    for (const className of manifests.FAKED_CLASSES) {
      const { instance, statics } = targetsFor(className)
      for (const member of membersOf(className)) {
        const target = member.name in instance ? instance : statics
        swept++
        const outcome = run(target, member)
        if (outcome.error !== undefined || outcome.returned !== undefined) {
          continue
        }
        // An `undefined` is only honest if a registered behaviour answered with it.
        try {
          delegate(target, className, member.name, member.args)
        } catch (error) {
          if (error instanceof NotImplementedError) {
            fabricated.push(`${className}.${member.name}`)
          }
        }
      }
    }

    expect(swept).toBeGreaterThanOrEqual(1000)
    expect(fabricated).toEqual([])
  })

  it('names the class and member on every NotImplementedError it throws', () => {
    const misnamed: string[] = []
    for (const className of manifests.FAKED_CLASSES) {
      const { instance, statics } = targetsFor(className)
      for (const member of membersOf(className)) {
        const target = member.name in instance ? instance : statics
        const { error } = run(target, member)
        if (error instanceof NotImplementedError && error.member !== `${className}.${member.name}`) {
          misnamed.push(`${className}.${member.name} named ${error.member}`)
        }
      }
    }
    expect(misnamed).toEqual([])
  })

  it('reaches the members standing in for blocks, items, containers and custom commands', () => {
    const entity = makeEntity(server)
    // Items and blocks are declared on members of faked classes rather than faked in their own right.
    expect(() => loosely(entity).addItem('minecraft:test')).toThrow(NotImplementedError)
    expect(() => entity.getBlockStandingOn()).toThrow(NotImplementedError)
    const inventory = construct('EntityInventoryComponent', { data: { server: state } })
    expect(() => (inventory as unknown as MC.EntityInventoryComponent).container).toThrow(NotImplementedError)
    // Custom commands are registered through the startup before-event, which exists and throws.
    const startup = construct('StartupBeforeEventSignal', { data: { server: state } })
    expect(typeof (startup as unknown as MC.StartupBeforeEventSignal).subscribe).toBe('function')
  })
})
