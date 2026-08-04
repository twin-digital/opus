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
import { addComponent } from './components.js'
import { createEntity, createPlayer, invalidate } from './entity.js'
import {
  ArgumentOutOfBoundsError,
  InvalidArgumentError,
  InvalidEntityError,
  NotImplementedError,
  UnsetValueError,
} from './errors.js'
import { getHandlerErrors } from './events.js'
import { FAKE_CLASSES } from './generated/index.js'
import * as manifests from './generated/manifests.js'
import type { EntityComponentId } from './ids.js'
import { withVanillaDimensions } from './presets.js'
import { construct } from './runtime/construct.js'
import { delegate, stateOf, type FakeState } from './runtime/member.js'
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

/** A registered entity: the shape under test is the generated class's, whatever built it. */
const makeEntity = (server: Server, typeId = 'minecraft:sheep', id = '-42'): MC.Entity =>
  createEntity(server, { typeId, id })

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
    expect(reached).toBe(16)
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
    invalidate(entity)
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
    invalidate(entity)
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
    invalidate(entity)
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
    expect(manifests.FAKED_CLASSES.length).toBe(Object.keys(FAKE_CLASSES).length)
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

  it('accepts a call between the two bounds', () => {
    const entity = makeEntity(createServer())
    expect(() => entity.addEffect('minecraft:speed', 10)).not.toThrow(TypeError)
  })

  it('rejects the first surplus argument, in the same message shape', () => {
    const entity = makeEntity(createServer())
    expect(() => loosely(entity).addTag('a', 'b')).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 1, received 2'),
    )
    expect(entity.hasTag('a')).toBe(false)
  })

  it('rejects a surplus argument past the maximum of a range', () => {
    const entity = makeEntity(createServer())
    expect(() => loosely(entity).addEffect('minecraft:speed', 10, {}, 'extra')).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 2-3, received 4'),
    )
    expect(() => loosely(entity).addEffect('minecraft:speed', 10, {}, 'extra', 'more')).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 2-3, received 5'),
    )
  })

  it('runs ahead of the validity guard', async () => {
    const { InvalidEntityError } = await import('./errors.js')
    const entity = makeEntity(createServer())
    invalidate(entity)
    expect(() => loosely(entity).addTag()).toThrow(TypeError)
    expect(() => entity.addTag('x')).toThrow(InvalidEntityError)
  })

  it('runs ahead of the validity guard on a member declared with a range', async () => {
    const { InvalidEntityError } = await import('./errors.js')
    const entity = makeEntity(createServer())
    invalidate(entity)
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

  it('throws on the first surplus argument to a zero-arity member', () => {
    const entity = makeEntity(createServer())
    expect(() => entity.getTags()).not.toThrow(TypeError)
    expect(() => loosely(entity).getTags('junk')).toThrow(
      new TypeError('Incorrect number of arguments to function. Expected 0, received 1'),
    )
  })

  it('rejects a surplus argument ahead of the validity guard', async () => {
    const { InvalidEntityError } = await import('./errors.js')
    const entity = makeEntity(createServer())
    invalidate(entity)
    expect(() => loosely(entity).getTags('junk')).toThrow(TypeError)
    expect(() => entity.getTags()).toThrow(InvalidEntityError)
  })

  it('counts arguments rather than defined arguments', () => {
    const entity = makeEntity(createServer())
    expect(() => loosely(entity).addEffect('minecraft:speed', undefined)).not.toThrow(TypeError)
  })

  /**
   * The 27 `Entity` methods the reflective sweep called with no arguments, and the `Expected` part
   * of the `TypeError` the engine answered with. Transcribed, not derived: this is where the
   * generator's own numbers meet the observation.
   */
  const OBSERVED_ARITY: readonly { member: string; expected: string }[] = [
    { member: 'addEffect', expected: '2-3' },
    { member: 'addItem', expected: '1' },
    { member: 'addTag', expected: '1' },
    { member: 'applyDamage', expected: '1-2' },
    { member: 'applyImpulse', expected: '1' },
    { member: 'applyKnockback', expected: '2' },
    { member: 'getComponent', expected: '1' },
    { member: 'getDynamicProperty', expected: '1' },
    { member: 'getEffect', expected: '1' },
    { member: 'getProperty', expected: '1' },
    { member: 'hasComponent', expected: '1' },
    { member: 'hasTag', expected: '1' },
    { member: 'lookAt', expected: '1' },
    { member: 'matches', expected: '1' },
    { member: 'playAnimation', expected: '1-2' },
    { member: 'removeEffect', expected: '1' },
    { member: 'removeTag', expected: '1' },
    { member: 'resetProperty', expected: '1' },
    { member: 'runCommand', expected: '1' },
    { member: 'setDynamicProperties', expected: '1' },
    { member: 'setDynamicProperty', expected: '1-2' },
    { member: 'setOnFire', expected: '1-2' },
    { member: 'setProperty', expected: '2' },
    { member: 'setRotation', expected: '1' },
    { member: 'teleport', expected: '1-2' },
    { member: 'triggerEvent', expected: '1' },
    { member: 'tryTeleport', expected: '1-2' },
  ]

  it('reports the bounds the engine reported, for the 27 methods it was observed on', () => {
    const entity = makeEntity(createServer())
    expect(OBSERVED_ARITY).toHaveLength(27)
    const wrong: string[] = []
    for (const { member, expected } of OBSERVED_ARITY) {
      const message = `Incorrect number of arguments to function. Expected ${expected}, received 0`
      try {
        loosely(entity)[member]()
        wrong.push(`${member}: did not throw`)
      } catch (error) {
        if (!(error instanceof TypeError) || error.message !== message) {
          wrong.push(`${member}: ${(error as Error).message}`)
        }
      }
    }
    expect(wrong).toEqual([])
  })

  it('derives those same bounds into the manifest', () => {
    const declared = new Map(
      manifestFor('Entity').methods.map(({ name, minArity, maxArity }) => [
        name,
        minArity === maxArity ? String(minArity) : `${String(minArity)}-${String(maxArity)}`,
      ]),
    )
    for (const { member, expected } of OBSERVED_ARITY) {
      expect(declared.get(member)).toBe(expected)
    }
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
  readonly threw: boolean
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
        { returned: loosely(target)[member.name].apply(target, member.args), threw: false }
      : { returned: (target as Bag)[member.name], threw: false }
  } catch (error) {
    return { threw: true, error }
  }
}

const ARITY_MESSAGE = /^Incorrect number of arguments to function\. Expected \d+(-\d+)?, received \d+$/
const GUARD_MESSAGE = /^Failed to (get property|call function) '.+'\.$/
const UNKNOWN_DIMENSION_MESSAGE = /^Dimension '.*' is invalid\.$/

/** The errors a member is allowed to answer with once a behaviour stands behind it. */
const isModelledFailure = (error: unknown): boolean => {
  if (
    error instanceof InvalidEntityError ||
    error instanceof ArgumentOutOfBoundsError ||
    error instanceof InvalidArgumentError ||
    error instanceof UnsetValueError ||
    error instanceof NotImplementedError
  ) {
    return true
  }
  if (error instanceof TypeError) {
    return ARITY_MESSAGE.test(error.message)
  }
  if (error instanceof Error && error.constructor === Error) {
    return GUARD_MESSAGE.test(error.message) || UNKNOWN_DIMENSION_MESSAGE.test(error.message)
  }
  return false
}

const describeOutcome = (outcome: Outcome): string =>
  outcome.threw ?
    `${(outcome.error as Error | undefined)?.constructor.name ?? typeof outcome.error}: ${String((outcome.error as Error | undefined)?.message)}`
  : `returned ${typeof outcome.returned}`

/**
 * Every declared member of every faked class, called at its declared minimum arity, on the real
 * objects a bundle hands out wherever one exists. The generator is one program whose defects
 * reproduce across all 1032 members, so every outcome is classified rather than sampled: a member
 * with no behaviour behind it must say so with `NotImplementedError`, and one with a behaviour must
 * answer or fail in a shape the library declares.
 */
describe('the whole generated surface', () => {
  /**
   * A factory per faked class, yielding the object a test would really hold. Anything a bundle
   * hands out is taken from the bundle — a stateless stand-in would let a behaviour read
   * `undefined` and pass — and anything a member can destroy is rebuilt for each member.
   */
  const factoriesOf = (server: ReturnType<typeof createServer>): Map<string, () => object> => {
    const state = stateFor(server)
    const factories = new Map<string, () => object>()
    const fixed = (instance: object) => (): object => instance

    const containers: Record<string, object> = {
      WorldAfterEvents: server.world.afterEvents,
      WorldBeforeEvents: server.world.beforeEvents,
      SystemAfterEvents: server.system.afterEvents,
      SystemBeforeEvents: server.system.beforeEvents,
    }
    factories.set('World', fixed(server.world))
    factories.set('System', fixed(server.system))
    factories.set('Scoreboard', fixed(server.world.scoreboard))
    for (const [name, container] of Object.entries(containers)) {
      factories.set(name, fixed(container))
    }
    for (const [containerName, signals] of Object.entries(manifests.SIGNAL_CLASS_BY_CONTAINER)) {
      const container = containers[containerName] as Bag | undefined
      for (const [signalName, className] of Object.entries(signals)) {
        const signal = container?.[signalName]
        if (typeof signal === 'object' && signal !== null) {
          factories.set(className, fixed(signal))
        }
      }
    }

    withVanillaDimensions(server)
    factories.set('Dimension', fixed(server.world.getDimension('overworld')))
    // `remove()` invalidates the entity it is called on, so each member gets a live one.
    factories.set('Entity', () => createEntity(server, { typeId: 'minecraft:sheep' }))
    factories.set('Player', () => createPlayer(server, { name: 'Bob' }))

    const attach = (componentId: string) => (): object => {
      const host = createEntity(server, { typeId: 'minecraft:cow' })
      return addComponent(host, componentId as EntityComponentId)
    }
    for (const [componentId, className] of Object.entries(manifests.COMPONENT_CLASS_BY_ID)) {
      factories.set(className, attach(componentId))
    }
    factories.set('ScreenDisplay', () => createPlayer(server, { name: 'Screen' }).onScreenDisplay)
    factories.set('ScoreboardObjective', () => {
      const id = `sweep-${String(state.entities.length)}-${String(Math.random())}`
      return server.world.scoreboard.addObjective(id, 'Sweep')
    })
    factories.set('Effect', () => {
      const host = createEntity(server, { typeId: 'minecraft:cow' })
      return host.addEffect('minecraft:speed', 20) as unknown as object
    })

    // The abstract component bases carry no id, so no test can hold one; they are swept over the
    // state a real component keeps, which is the state their behaviour was written against.
    const componentTemplate = (): { data: unknown; owner: FakeState | undefined } => {
      const host = createEntity(server, { typeId: 'minecraft:pig' })
      const componentState = stateOf(addComponent(host, 'minecraft:health') as unknown as object)
      return { data: componentState.data, owner: componentState.owner }
    }
    for (const className of manifests.FAKED_CLASSES) {
      if (!factories.has(className)) {
        const isComponent = (manifests.COMPONENT_CLASSES as readonly string[]).includes(className)
        factories.set(className, () =>
          isComponent ?
            construct(className, componentTemplate())
          : construct(className, { data: { server: state }, own: { typeId: 'minecraft:sheep', id: '1' } }),
        )
      }
    }
    return factories
  }

  /** A member with no registered behaviour is exactly one whose delegation reports itself missing. */
  const hasBehaviour = (probe: object, className: string, member: SweptMember): boolean => {
    try {
      delegate(probe, className, member.name, member.args)
      return true
    } catch (error) {
      return !(error instanceof NotImplementedError && error.member === `${className}.${member.name}`)
    }
  }

  /** Every member name a generated class really emitted, own data properties and statics included. */
  const emittedNames = (className: string, instance: object): Set<string> => {
    const statics = (FAKE_CLASSES as unknown as Bag)[className] as object
    const prototype = Object.getPrototypeOf(instance) as object
    return new Set([
      ...Object.getOwnPropertyNames(instance),
      ...Object.getOwnPropertyNames(prototype).filter((name) => name !== 'constructor'),
      ...Object.getOwnPropertyNames(statics).filter((name) => !['length', 'name', 'prototype'].includes(name)),
    ])
  }

  it('classifies the outcome of every declared member of every faked class', () => {
    const declared = manifests.FAKED_CLASSES.reduce((total, className) => {
      const manifest = manifestFor(className)
      return total + manifest.methods.length + manifest.properties.length
    }, 0)
    const targets = factoriesOf(createServer())
    // A second bundle absorbs the delegation probe's own side effects.
    const probes = factoriesOf(createServer())
    const unexpected: string[] = []
    let swept = 0
    let unmodelled = 0
    let ownProperties = 0

    const missing: string[] = []
    for (const className of manifests.FAKED_CLASSES) {
      const statics = (FAKE_CLASSES as unknown as Bag)[className] as object
      const emitted = emittedNames(className, targets.get(className)?.() ?? statics)
      for (const member of membersOf(className)) {
        swept++
        if (!emitted.has(member.name)) {
          missing.push(`${className}.${member.name}`)
        }
        const instance = targets.get(className)?.() ?? statics
        const target = member.name in instance ? instance : statics
        const outcome = run(target, member)

        // `typeId` and `id` are own data properties by the emission rule: no delegation behind them.
        if (!member.isMethod && Object.getOwnPropertyNames(instance).includes(member.name)) {
          ownProperties++
          if (outcome.threw || outcome.returned === undefined) {
            unexpected.push(`${className}.${member.name} is an own property but answered ${describeOutcome(outcome)}`)
          }
          continue
        }

        const probe = probes.get(className)?.() ?? statics
        if (hasBehaviour(member.name in probe ? probe : statics, className, member)) {
          if (outcome.threw && !isModelledFailure(outcome.error)) {
            unexpected.push(`${className}.${member.name} — ${describeOutcome(outcome)}`)
          }
          continue
        }
        unmodelled++
        if (!(outcome.error instanceof NotImplementedError) || outcome.error.member !== `${className}.${member.name}`) {
          unexpected.push(`${className}.${member.name} is unmodelled but answered ${describeOutcome(outcome)}`)
        }
      }
    }

    expect(unexpected).toEqual([])
    // The manifest counts the declarations; `missing` checks the classes really emitted them.
    expect(missing).toEqual([])
    expect(swept).toBe(declared)
    expect(swept).toBeGreaterThanOrEqual(1037)
    expect(unmodelled).toBeGreaterThan(0)
    expect(ownProperties).toBe(4)
  })

  it('sweeps the real objects a bundle hands out, not stateless stand-ins', () => {
    const factories = factoriesOf(createServer())
    for (const className of ['World', 'System', 'Scoreboard', 'Dimension', 'Entity', 'Player', 'Effect']) {
      const instance = factories.get(className)?.()
      expect(instance).toBeDefined()
      expect(stateOf(instance as object).className).toBe(className)
    }
    expect((factories.get('Dimension')?.() as MC.Dimension).id).toBe('minecraft:overworld')
    expect((factories.get('Entity')?.() as MC.Entity).typeId).toBe('minecraft:sheep')
    expect((factories.get('EntityHealthComponent')?.() as MC.EntityHealthComponent).typeId).toBe('minecraft:health')
    for (const className of manifests.SIGNAL_CLASSES) {
      expect(factories.get(className)?.()).toBeDefined()
    }
  })

  it('reaches the members standing in for blocks, items, containers and custom commands', () => {
    const server = createServer()
    const entity = createEntity(server, { typeId: 'minecraft:sheep' })
    // Items and blocks are declared on members of faked classes rather than faked in their own right.
    expect(() => loosely(entity).addItem('minecraft:test')).toThrow(NotImplementedError)
    expect(() => entity.getBlockStandingOn()).toThrow(NotImplementedError)
    const inventory = addComponent(entity, 'minecraft:inventory')
    expect(() => inventory.container).toThrow(NotImplementedError)
    // Custom commands hang off the StartupEvent payload, which no fake behaviour raises. The signal
    // is declared and subscribable; nothing in the library builds a registry behind it.
    const handler = (): undefined => undefined
    expect(server.system.beforeEvents.startup.subscribe(handler)).toBe(handler)
    for (const name of ['StartupEvent', 'CustomCommandRegistry', 'BlockComponentRegistry', 'Container', 'ItemStack']) {
      expect((FAKE_CLASSES as unknown as Bag)[name]).toBeUndefined()
    }
  })
})
