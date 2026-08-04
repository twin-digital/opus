/**
 * The module-scope bindings: what an unset one does, what an install moves, what a replace refuses,
 * and that code reaching the engine through the module import reaches the bundle's own objects.
 */

import { afterEach, describe, expect, it } from 'vitest'

import {
  advanceTicks,
  createEntity,
  createServer,
  ShimNotInstalledError,
  ShimServerInUseError,
  withVanillaDimensions,
} from '../index.js'
import * as bindings from './bindings.js'
import * as shim from './index.js'

afterEach(() => {
  bindings.__useServer()
})

/** Every access shape a consumer can put on a binding. */
const accessShapes: Readonly<Record<string, (value: never) => unknown>> = {
  'property read': (value: { getDimension?: unknown }) => value.getDimension,
  'method call': (value: { getDimension: (id: string) => unknown }) => value.getDimension('overworld'),
  'call-shaped': (value: () => unknown) => value(),
  'construct-shaped': (value: new () => unknown) => new value(),
  'in-operator': (value: object) => 'getDimension' in value,
  spread: (value: object) => ({ ...value }),
}

describe('an unset binding', () => {
  it('throws ShimNotInstalledError from every access shape', () => {
    for (const [shape, access] of Object.entries(accessShapes)) {
      expect(() => access(bindings.world as never), shape).toThrow(ShimNotInstalledError)
    }
  })

  it('reads as neither nullish nor undefined — it is the access that fails, not the read', () => {
    expect(bindings.world).not.toBeUndefined()
    expect(bindings.world).not.toBeNull()
  })

  it('names the binding it stands for', () => {
    expect(() => bindings.system.currentTick).toThrow(/system/)
    expect(() => bindings.world.getDimension('overworld')).toThrow(/world/)
  })

  it('refuses currentServer()', () => {
    expect(() => bindings.currentServer()).toThrow(ShimNotInstalledError)
  })
})

describe('installing', () => {
  it('moves both bindings wholesale', () => {
    const server = createServer()
    bindings.__useServer(server)
    expect(bindings.world).toBe(server.world)
    expect(bindings.system).toBe(server.system)
    expect(bindings.currentServer()).toBe(server)
  })

  it('is what the aliased surface re-exports', () => {
    const server = createServer()
    bindings.__useServer(server)
    expect(shim.world).toBe(server.world)
    expect(shim.system).toBe(server.system)
  })

  it('reaches the bundle by the surface the package supplies', () => {
    const server = createServer()
    withVanillaDimensions(server)
    bindings.__useServer(server)
    const entity = createEntity(server, {
      typeId: 'minecraft:sheep',
      dimension: server.world.getDimension('overworld'),
    })
    // The module-import route and the bundle route land on the same objects.
    expect([...shim.world.getDimension('overworld').getEntities()]).toContain(entity)
    expect(shim.world).toBe(server.world)
  })

  it('returns to the unset state with no argument', () => {
    bindings.__useServer(createServer())
    bindings.__useServer()
    expect(() => bindings.world.getDimension('overworld')).toThrow(ShimNotInstalledError)
    expect(() => bindings.currentServer()).toThrow(ShimNotInstalledError)
  })

  it('starts a second install from what it installed, nothing carried over', () => {
    const first = createServer()
    withVanillaDimensions(first)
    bindings.__useServer(first)
    createEntity(first, { typeId: 'minecraft:sheep' })
    advanceTicks(first, 5)

    bindings.__useServer()
    const second = createServer()
    withVanillaDimensions(second)
    bindings.__useServer(second)
    expect(shim.system.currentTick).toBe(0)
    expect([...shim.world.getDimension('overworld').getEntities()]).toEqual([])
  })
})

describe('replacing a live server', () => {
  it('throws when subscribers are bound to it', () => {
    const first = createServer()
    bindings.__useServer(first)
    first.world.afterEvents.entityHurt.subscribe(() => undefined)
    expect(() => {
      bindings.__useServer(createServer())
    }).toThrow(ShimServerInUseError)
  })

  it('throws when scheduled runs are bound to it', () => {
    const first = createServer()
    bindings.__useServer(first)
    first.system.runInterval(() => {
      /* never advanced */
    }, 5)
    expect(() => {
      bindings.__useServer(createServer())
    }).toThrow(ShimServerInUseError)
  })

  it('carries the counts and the loadPack fix in the message', () => {
    const first = createServer()
    bindings.__useServer(first)
    first.world.afterEvents.entityHurt.subscribe(() => undefined)
    first.world.afterEvents.entityDie.subscribe(() => undefined)
    first.system.runInterval(() => {
      /* never advanced */
    }, 5)
    let caught: unknown
    try {
      bindings.__useServer(createServer())
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(ShimServerInUseError)
    expect((caught as ShimServerInUseError).subscribers).toBe(2)
    expect((caught as ShimServerInUseError).scheduledRuns).toBe(1)
    expect((caught as Error).message).toMatch(/loadPack/)
  })

  it('never throws on an explicit unset', () => {
    const first = createServer()
    bindings.__useServer(first)
    first.world.afterEvents.entityHurt.subscribe(() => undefined)
    expect(() => {
      bindings.__useServer()
    }).not.toThrow()
  })

  it('accepts a replacement once the unset has run', () => {
    const first = createServer()
    bindings.__useServer(first)
    first.world.afterEvents.entityHurt.subscribe(() => undefined)
    bindings.__useServer()
    const second = createServer()
    expect(() => {
      bindings.__useServer(second)
    }).not.toThrow()
    expect(bindings.world).toBe(second.world)
  })

  it('does not inspect a server the package did not build', () => {
    const foreign = { world: {}, system: {} } as never
    bindings.__useServer(foreign)
    expect(() => {
      bindings.__useServer(createServer())
    }).not.toThrow()
  })

  it('replaces a server with nothing bound to it', () => {
    bindings.__useServer(createServer())
    const second = createServer()
    expect(() => {
      bindings.__useServer(second)
    }).not.toThrow()
    expect(bindings.world).toBe(second.world)
  })
})
