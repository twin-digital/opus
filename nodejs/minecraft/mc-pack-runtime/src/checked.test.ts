import { world } from '@minecraft/server'
import type { Dimension, Entity } from '@minecraft/server'
import {
  __useServer,
  addComponent,
  createEntity,
  createServer,
  registerEntityType,
  withVanillaDimensions,
} from '@twin-digital/minecraft-test-lib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ForeignEntityError, getEntities, getEntity, spawnEntity } from './checked.js'
import type { PackRuntimeInjection } from './injection.js'

const host = globalThis as { __MC_PACK_RUNTIME__?: PackRuntimeInjection }

const FAMILY = 'mcdk_pack_acme-arena'

const inject = (): void => {
  host.__MC_PACK_RUNTIME__ = { namespace: 'arena', packToken: 'acme-arena', prefixes: [] }
}

let server: ReturnType<typeof createServer>
let overworld: Dimension

beforeEach(() => {
  // A fresh server per test: unset first, since the last test's server holds its subscriptions.
  __useServer()
  server = createServer()
  __useServer(server)
  withVanillaDimensions(server)
  overworld = world.getDimension('overworld')
})

afterEach(() => {
  delete host.__MC_PACK_RUNTIME__
})

// d-wj60379v: the runtime checks the pack's type family on every entity it hands back. The cases
// below are the decision's, exactly. The fakes come from @twin-digital/minecraft-test-lib: a test
// registers types, attaches `minecraft:type_family` state, and reads the world back.
describe('spawnEntity', () => {
  it("returns the spawned entity where it carries the pack's own family", () => {
    inject()
    registerEntityType(server, 'arena:wizard')
    // The fake dispatches entitySpawn synchronously inside spawnEntity, so the family lands
    // before the checked call reads it — standing in for a definition the build stamped.
    world.afterEvents.entitySpawn.subscribe((event) => {
      addComponent(event.entity, 'minecraft:type_family', [FAMILY])
    })
    const entity = spawnEntity(overworld, 'arena:wizard', { x: 0, y: 64, z: 0 })
    expect(entity.typeId).toBe('arena:wizard')
    expect(entity.isValid).toBe(true)
  })

  it('removes the spawned entity and raises ForeignEntityError where it lacks the family', () => {
    inject()
    registerEntityType(server, 'arena:wizard')
    let spawned: Entity | undefined
    world.afterEvents.entitySpawn.subscribe((event) => {
      spawned = event.entity
    })
    expect(() => spawnEntity(overworld, 'arena:wizard', { x: 0, y: 64, z: 0 })).toThrow(ForeignEntityError)
    expect(spawned?.isValid).toBe(false)
    expect(overworld.getEntities()).toHaveLength(0)
  })

  it('spawns unchecked where no namespace was injected, so the build stamped no family', () => {
    registerEntityType(server, 'arena:wizard')
    const entity = spawnEntity(overworld, 'arena:wizard', { x: 0, y: 64, z: 0 })
    expect(entity.typeId).toBe('arena:wizard')
    expect(entity.isValid).toBe(true)
  })

  it('the raised error names the entity type, the expected family, and that it removed', () => {
    inject()
    registerEntityType(server, 'arena:wizard')
    let error: unknown
    try {
      spawnEntity(overworld, 'arena:wizard', { x: 0, y: 64, z: 0 })
    } catch (thrown) {
      error = thrown
    }
    expect(error).toBeInstanceOf(ForeignEntityError)
    const foreign = error as ForeignEntityError
    expect(foreign.entityTypeId).toBe('arena:wizard')
    expect(foreign.expectedFamily).toBe(FAMILY)
    expect(foreign.removed).toBe(true)
  })
})

describe('getEntity', () => {
  it("returns the entity where it carries the pack's own family", () => {
    inject()
    const own = createEntity(server, {
      typeId: 'arena:wizard',
      dimension: overworld,
      components: { 'minecraft:type_family': [FAMILY] },
    })
    expect(getEntity(own.id)).toBe(own)
  })

  it('raises ForeignEntityError where it lacks the family, leaving the entity where it was found', () => {
    inject()
    const foreign = createEntity(server, { typeId: 'arena:wizard', dimension: overworld })
    let error: unknown
    try {
      getEntity(foreign.id)
    } catch (thrown) {
      error = thrown
    }
    expect(error).toBeInstanceOf(ForeignEntityError)
    expect((error as ForeignEntityError).removed).toBe(false)
    expect(foreign.isValid).toBe(true)
    expect(world.getEntity(foreign.id)).toBe(foreign)
  })

  it('returns undefined where nothing answers, checked and unchecked alike', () => {
    inject()
    expect(getEntity('12345')).toBeUndefined()
    delete host.__MC_PACK_RUNTIME__
    expect(getEntity('12345')).toBeUndefined()
  })

  it('returns unchecked where no namespace was injected', () => {
    const familyless = createEntity(server, { typeId: 'arena:wizard', dimension: overworld })
    expect(getEntity(familyless.id)).toBe(familyless)
  })
})

describe('getEntities', () => {
  it("returns every entity where all carry the pack's own family", () => {
    inject()
    const first = createEntity(server, {
      typeId: 'arena:wizard',
      dimension: overworld,
      components: { 'minecraft:type_family': [FAMILY] },
    })
    const second = createEntity(server, {
      typeId: 'arena:golem',
      dimension: overworld,
      components: { 'minecraft:type_family': [FAMILY] },
    })
    expect(getEntities(overworld)).toEqual([first, second])
  })

  it('omits the foreign entities from a mixed result, and returns it', () => {
    inject()
    const own = createEntity(server, {
      typeId: 'arena:wizard',
      dimension: overworld,
      components: { 'minecraft:type_family': [FAMILY] },
    })
    createEntity(server, { typeId: 'arena:wizard', dimension: overworld })
    expect(getEntities(overworld)).toEqual([own])
  })

  it('returns every entity unchecked where no namespace was injected', () => {
    const first = createEntity(server, { typeId: 'arena:wizard', dimension: overworld })
    const second = createEntity(server, {
      typeId: 'arena:golem',
      dimension: overworld,
      components: { 'minecraft:type_family': [FAMILY] },
    })
    expect(getEntities(overworld)).toEqual([first, second])
  })
})
