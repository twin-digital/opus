/**
 * The invalidation guard as the guard data gives it — on entities, attribute components and
 * effects — and the order a read that finds nothing resolves in.
 *
 * The fakes are built through the runtime seam: the guard is compiled into every member by the
 * generator, so it is testable ahead of the models that hang behind those members.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type * as MC from '@minecraft/server'

import { createServer } from './create-server.js'
import { InvalidEntityError, NotImplementedError, UnsetValueError } from './errors.js'
import { emit } from './events.js'
import { ATTRIBUTE_COMPONENT_CLASSES, EntityManifest } from './generated/manifests.js'
import { ATTRIBUTE_COMPONENT_IDS } from './ids.js'
import { construct } from './runtime/construct.js'
import { stateOf } from './runtime/member.js'
import { serverOf, type ServerState } from './runtime/state.js'

type Fn = (...args: unknown[]) => unknown
type Bag = Record<string, unknown>
type Server = ReturnType<typeof createServer>

const loosely = (value: object): Record<string, Fn> => value as unknown as Record<string, Fn>

const stateFor = (server: Server): ServerState => serverOf(server.world)

const makeEntity = (server: Server, className: 'Entity' | 'Player' = 'Entity'): MC.Entity =>
  construct(className, {
    data: { server: stateFor(server), typeId: 'minecraft:sheep', id: '-42' },
    own: { typeId: 'minecraft:sheep', id: '-42' },
  }) as MC.Entity

/** A component hanging off an entity, whose validity it follows. */
const makeComponent = (server: Server, entity: MC.Entity, className: string): object =>
  construct(className, { data: { server: stateFor(server) }, owner: stateOf(entity) })

const makeEffect = (server: Server, entity: MC.Entity): MC.Effect =>
  construct('Effect', { data: { server: stateFor(server) }, owner: stateOf(entity) }) as MC.Effect

const invalidateFake = (fake: object): void => {
  stateOf(fake).valid = false
}

const caughtFrom = (act: () => unknown): unknown => {
  try {
    act()
  } catch (error) {
    return error
  }
  throw new Error('expected a throw')
}

const invalidEntityMessage = (shape: 'get property' | 'set property' | 'call function', name: string): string =>
  `Failed to ${shape} '${name}' due to Entity being invalid (has the Entity been removed?).`

const placeholders = (count: number): unknown[] => Array.from({ length: count }, () => 'minecraft:test')

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

describe('invalid entity', () => {
  it('keeps id readable', () => {
    const entity = makeEntity(createServer())
    invalidateFake(entity)
    expect(entity.id).toBe('-42')
  })

  it('keeps typeId readable', () => {
    const entity = makeEntity(createServer())
    invalidateFake(entity)
    expect(entity.typeId).toBe('minecraft:sheep')
  })

  it('reads isValid as false', () => {
    const entity = makeEntity(createServer())
    expect(entity.isValid).toBe(true)
    invalidateFake(entity)
    expect(entity.isValid).toBe(false)
  })

  it('reads scoreboardIdentity as undefined', () => {
    const entity = makeEntity(createServer())
    invalidateFake(entity)
    expect(entity.scoreboardIdentity).toBeUndefined()
  })

  it('throws InvalidEntityError for every other declared property', () => {
    const entity = makeEntity(createServer())
    invalidateFake(entity)
    const readable = new Set(['id', 'isValid', 'typeId', 'scoreboardIdentity'])
    const guarded = EntityManifest.properties.filter((name) => !readable.has(name))
    expect(guarded).toHaveLength(12)
    for (const name of guarded) {
      expect(() => (entity as unknown as Bag)[name]).toThrow(InvalidEntityError)
    }
  })

  it('names the get-property access shape', () => {
    const entity = makeEntity(createServer())
    invalidateFake(entity)
    expect(() => entity.location).toThrow(invalidEntityMessage('get property', 'location'))
  })

  it("names the set-property shape the engine uses for nameTag's read", () => {
    const entity = makeEntity(createServer())
    invalidateFake(entity)
    expect(() => entity.nameTag).toThrow(invalidEntityMessage('set property', 'nameTag'))
  })

  it('names the call-function shape for localizationKey', () => {
    const entity = makeEntity(createServer())
    invalidateFake(entity)
    expect(() => entity.localizationKey).toThrow(invalidEntityMessage('call function', 'localizationKey'))
  })

  it('throws InvalidEntityError from every declared method called with correct arguments', () => {
    const entity = makeEntity(createServer())
    invalidateFake(entity)
    const wrong: string[] = []
    expect(EntityManifest.methods).toHaveLength(46)
    for (const { name, minArity } of EntityManifest.methods) {
      const error = caughtFrom(() => loosely(entity)[name].apply(entity, placeholders(minArity)))
      if (!(error instanceof InvalidEntityError) || error.message !== invalidEntityMessage('call function', name)) {
        wrong.push(`${name}: ${(error as Error).message}`)
      }
    }
    expect(wrong).toEqual([])
  })

  it('reads a method without throwing', () => {
    const entity = makeEntity(createServer())
    invalidateFake(entity)
    const probed = [
      'kill',
      'teleport',
      'hasTag',
      'getComponent',
      'applyDamage',
      'triggerEvent',
      'getTags',
      'getVelocity',
      'getRotation',
      'getHeadLocation',
      'getViewDirection',
      'getEffects',
      'getComponents',
      'getDynamicPropertyIds',
    ]
    for (const name of probed) {
      expect(typeof (entity as unknown as Bag)[name]).toBe('function')
    }
  })

  it('throws on a reference captured while the entity was valid', () => {
    const entity = makeEntity(createServer())
    const bound = entity.kill.bind(entity)
    const unbound = entity.kill
    invalidateFake(entity)
    expect(() => bound()).toThrow(InvalidEntityError)
    expect(() => unbound.call(entity)).toThrow(InvalidEntityError)
  })

  it('throws on a reference a handler captured mid-event', () => {
    const server = createServer()
    const entity = makeEntity(server)
    let captured: (() => boolean) | undefined
    server.world.afterEvents.entitySpawn.subscribe(() => {
      captured = entity.kill.bind(entity)
    })
    emit(server.world.afterEvents.entitySpawn, { entity, cause: 'Spawned' } as unknown as MC.EntitySpawnAfterEvent)
    invalidateFake(entity)
    expect(captured).toBeTypeOf('function')
    expect(() => captured?.()).toThrow(InvalidEntityError)
  })

  it("carries the entity's id and type on the error", () => {
    const entity = makeEntity(createServer())
    invalidateFake(entity)
    const error = caughtFrom(() => entity.location) as InvalidEntityError
    expect(error.id).toBe('-42')
    expect(error.type).toBe('minecraft:sheep')
  })

  it('guards a Player the same way', () => {
    const player = makeEntity(createServer(), 'Player')
    invalidateFake(player)
    expect(player.id).toBe('-42')
    expect(player.typeId).toBe('minecraft:sheep')
    expect(() => player.location).toThrow(InvalidEntityError)
  })
})

// ---------------------------------------------------------------------------
// Attribute components
// ---------------------------------------------------------------------------

describe('invalid attribute component', () => {
  const attached = (): { entity: MC.Entity; component: MC.EntityHealthComponent } => {
    const server = createServer()
    const entity = makeEntity(server)
    const component = makeComponent(server, entity, 'EntityHealthComponent') as MC.EntityHealthComponent
    invalidateFake(entity)
    return { entity, component }
  }

  it('keeps isValid readable and false', () => {
    expect(attached().component.isValid).toBe(false)
  })

  it('keeps typeId readable', () => {
    expect(attached().component.typeId).toBe('minecraft:health')
  })

  it("throws a plain Error naming 'current' for currentValue", () => {
    const error = caughtFrom(() => attached().component.currentValue)
    expect((error as Error).constructor).toBe(Error)
    expect((error as Error).name).toBe('Error')
    expect(error).not.toBeInstanceOf(InvalidEntityError)
    expect((error as Error).message).toBe("Failed to get property 'current'.")
  })

  it("throws a plain Error naming 'value' for defaultValue", () => {
    expect(() => attached().component.defaultValue).toThrow(new Error("Failed to get property 'value'."))
  })

  it("throws a plain Error naming 'effectiveMaxValue' for effectiveMax", () => {
    expect(() => attached().component.effectiveMax).toThrow(new Error("Failed to get property 'effectiveMaxValue'."))
  })

  it("throws a plain Error naming 'effectiveMinValue' for effectiveMin", () => {
    expect(() => attached().component.effectiveMin).toThrow(new Error("Failed to get property 'effectiveMinValue'."))
  })

  it('throws a plain Error for resetToDefaultValue', () => {
    expect(() => {
      attached().component.resetToDefaultValue()
    }).toThrow(new Error("Failed to call function 'resetToDefaultValue'."))
  })

  it('throws a plain Error for resetToMaxValue', () => {
    expect(() => {
      attached().component.resetToMaxValue()
    }).toThrow(new Error("Failed to call function 'resetToMaxValue'."))
  })

  it('throws a plain Error for resetToMinValue', () => {
    expect(() => {
      attached().component.resetToMinValue()
    }).toThrow(new Error("Failed to call function 'resetToMinValue'."))
  })

  it("throws InvalidEntityError naming 'setCurrent' for setCurrentValue", () => {
    const error = caughtFrom(() => attached().component.setCurrentValue(1))
    expect(error).toBeInstanceOf(InvalidEntityError)
    expect((error as Error).message).toBe(invalidEntityMessage('set property', 'setCurrent'))
  })

  it('throws InvalidEntityError for entity', () => {
    const error = caughtFrom(() => attached().component.entity)
    expect(error).toBeInstanceOf(InvalidEntityError)
    expect((error as Error).message).toBe(invalidEntityMessage('get property', 'entity'))
  })

  it("carries the owner's identity on the InvalidEntityError", () => {
    const error = caughtFrom(() => attached().component.entity) as InvalidEntityError
    expect(error.id).toBe('-42')
    expect(error.type).toBe('minecraft:sheep')
  })

  it('applies the same table to all seven attribute components', () => {
    const server = createServer()
    const entity = makeEntity(server)
    const components = ATTRIBUTE_COMPONENT_CLASSES.map((className) => makeComponent(server, entity, className))
    expect(components).toHaveLength(ATTRIBUTE_COMPONENT_IDS.length)
    invalidateFake(entity)
    for (const component of components) {
      expect(() => (component as MC.EntityAttributeComponent).currentValue).toThrow(
        new Error("Failed to get property 'current'."),
      )
    }
  })

  it('follows its owner rather than a flag of its own', () => {
    const server = createServer()
    const entity = makeEntity(server)
    const component = makeComponent(server, entity, 'EntityHealthComponent') as MC.EntityHealthComponent
    expect(() => component.currentValue).not.toThrow("Failed to get property 'current'.")
    invalidateFake(entity)
    expect(() => component.currentValue).toThrow("Failed to get property 'current'.")
  })

  it('keeps a non-attribute component readable on isValid and typeId and throws for the rest', () => {
    const server = createServer()
    const entity = makeEntity(server)
    const component = makeComponent(server, entity, 'EntityIsBabyComponent') as MC.EntityIsBabyComponent
    invalidateFake(entity)
    expect(component.isValid).toBe(false)
    expect(component.typeId).toBe('minecraft:is_baby')
    expect(() => component.entity).toThrow(InvalidEntityError)
  })
})

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

describe('invalid effect', () => {
  const held = (): MC.Effect => {
    const server = createServer()
    const entity = makeEntity(server)
    const effect = makeEffect(server, entity)
    invalidateFake(entity)
    return effect
  }

  it('keeps isValid readable and false', () => {
    expect(held().isValid).toBe(false)
  })

  it('throws a plain Error for amplifier', () => {
    const error = caughtFrom(() => held().amplifier)
    expect((error as Error).constructor).toBe(Error)
    expect((error as Error).message).toBe("Failed to get property 'amplifier'.")
  })

  it('throws a plain Error for duration', () => {
    expect(() => held().duration).toThrow(new Error("Failed to get property 'duration'."))
  })

  it('throws a plain Error for typeId', () => {
    expect(() => held().typeId).toThrow(new Error("Failed to get property 'typeId'."))
  })

  it('throws a plain Error for displayName', () => {
    expect(() => held().displayName).toThrow(new Error("Failed to get property 'displayName'."))
  })

  it('throws no InvalidEntityError', () => {
    for (const read of [() => held().amplifier, () => held().duration, () => held().typeId, () => held().displayName]) {
      expect(caughtFrom(read)).not.toBeInstanceOf(InvalidEntityError)
    }
  })

  it('throws the same way for an effect that was itself removed', () => {
    const server = createServer()
    const entity = makeEntity(server)
    const effect = makeEffect(server, entity)
    invalidateFake(effect)
    expect(() => effect.amplifier).toThrow(new Error("Failed to get property 'amplifier'."))
    expect(effect.isValid).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The guard data itself
// ---------------------------------------------------------------------------

interface GuardTable {
  readonly readable: readonly string[]
  readonly defaultProperty: string
  readonly defaultMethod: string
  readonly overrides: Readonly<Record<string, string | undefined>>
}

interface GuardData {
  readonly tables: {
    readonly entity: GuardTable
    readonly attributeComponent: GuardTable
    readonly entityComponent: GuardTable
    readonly effect: GuardTable
  }
  readonly assignments: Readonly<Record<string, string | undefined>>
  readonly attributeComponentClasses: readonly string[]
}

const guardData = JSON.parse(
  readFileSync(fileURLToPath(new URL('./guard-data.json', import.meta.url)), 'utf8'),
) as GuardData

describe('guard data', () => {
  it('lists the four readable entity names', () => {
    expect(guardData.tables.entity.readable).toEqual(['id', 'isValid', 'typeId', 'scoreboardIdentity'])
  })

  it('carries the eleven-row attribute table', () => {
    const table = guardData.tables.attributeComponent
    expect(table.readable).toEqual(['isValid', 'typeId'])
    expect(Object.keys(table.overrides)).toHaveLength(9)
    expect(table.overrides.currentValue).toBe('failed-property:current')
    expect(table.overrides.defaultValue).toBe('failed-property:value')
    expect(table.overrides.effectiveMax).toBe('failed-property:effectiveMaxValue')
    expect(table.overrides.effectiveMin).toBe('failed-property:effectiveMinValue')
    expect(table.readable.length + Object.keys(table.overrides).length).toBe(11)
  })

  it('carries the five-row effect table', () => {
    const table = guardData.tables.effect
    expect(table.readable).toEqual(['isValid'])
    expect(table.defaultProperty).toBe('failed-property')
    // One readable row, plus the four value members the default covers.
    expect(table.readable.length + ['amplifier', 'duration', 'typeId', 'displayName'].length).toBe(5)
  })

  it('names only members the declarations carry', () => {
    const entityMembers = new Set<string>([
      ...EntityManifest.properties,
      ...EntityManifest.methods.map((method) => method.name),
    ])
    const { entity } = guardData.tables
    for (const name of [...entity.readable, ...Object.keys(entity.overrides)]) {
      expect(entityMembers.has(name)).toBe(true)
    }
  })

  it('lists the seven attribute component classes', () => {
    expect(guardData.attributeComponentClasses).toEqual([...ATTRIBUTE_COMPONENT_CLASSES])
  })

  it('assigns the entity table to Entity and Player, and the effect table to Effect', () => {
    expect(guardData.assignments.Entity).toBe('entity')
    expect(guardData.assignments.Player).toBe('entity')
    expect(guardData.assignments.Effect).toBe('effect')
  })
})

// ---------------------------------------------------------------------------
// The order a read that finds nothing resolves in
// ---------------------------------------------------------------------------

describe('read order', () => {
  it('rule 1 — too few arguments throw TypeError on a valid reference', () => {
    expect(() => loosely(makeEntity(createServer())).addTag()).toThrow(TypeError)
  })

  it('rule 1 beats rule 2', () => {
    const entity = makeEntity(createServer())
    invalidateFake(entity)
    const error = caughtFrom(() => loosely(entity).addTag())
    expect(error).toBeInstanceOf(TypeError)
    expect(error).not.toBeInstanceOf(InvalidEntityError)
  })

  it('rule 1 beats rule 3', () => {
    const error = caughtFrom(() => loosely(makeEntity(createServer())).teleport())
    expect(error).toBeInstanceOf(TypeError)
    expect(error).not.toBeInstanceOf(NotImplementedError)
  })

  it('rule 2 beats rule 3', () => {
    const entity = makeEntity(createServer())
    invalidateFake(entity)
    const error = caughtFrom(() => entity.getAABB())
    expect(error).toBeInstanceOf(InvalidEntityError)
    expect(error).not.toBeInstanceOf(NotImplementedError)
  })

  it('rule 2 beats rule 4', () => {
    const entity = makeEntity(createServer())
    invalidateFake(entity)
    expect(() => entity.getDynamicProperty('never-set')).toThrow(InvalidEntityError)
  })

  it('rule 2 beats rule 5', () => {
    const entity = makeEntity(createServer())
    invalidateFake(entity)
    const error = caughtFrom(() => entity.nameTag)
    expect(error).toBeInstanceOf(InvalidEntityError)
    expect(error).not.toBeInstanceOf(UnsetValueError)
  })

  it('rule 3 beats rule 4', () => {
    const entity = makeEntity(createServer())
    expect(() => entity.getBlockFromViewDirection()).toThrow(NotImplementedError)
  })

  it('rule 3 beats rule 5', () => {
    const entity = makeEntity(createServer())
    const error = caughtFrom(() => entity.getProperty('x'))
    expect(error).toBeInstanceOf(NotImplementedError)
    expect(error).not.toBeInstanceOf(UnsetValueError)
  })

  it('rule 4 — an absence the engine can exhibit reads undefined', () => {
    const server = createServer()
    expect(server.world.getEntity('nope')).toBeUndefined()
    expect(server.world.getDynamicProperty('never-set')).toBeUndefined()
    expect(server.world.scoreboard.getObjective('nope')).toBeUndefined()
  })

  it('rule 5 — a value the test never supplied throws UnsetValueError', () => {
    const entity = makeEntity(createServer())
    const error = caughtFrom(() => entity.nameTag)
    expect(error).toBeInstanceOf(UnsetValueError)
    expect((error as UnsetValueError).member).toBe('Entity.nameTag')
  })

  it("rules 4 and 5 are told apart by the declaration's own type", () => {
    const entity = makeEntity(createServer())
    expect(entity.getDynamicProperty('never-set')).toBeUndefined()
    expect(() => entity.location).toThrow(UnsetValueError)
  })

  it('leaves a modelled empty collection alone', () => {
    const server = createServer()
    expect(makeEntity(server).getTags()).toEqual([])
    expect(server.world.getAllPlayers()).toEqual([])
  })
})
