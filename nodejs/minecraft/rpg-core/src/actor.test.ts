// The public surface, exercised through the module-scope bindings the shim installs per file.
// The pack's namespace, token, and vendored prefixes are what the kit's build injects into a
// namespaced bundle; a test assigns the same global by hand, standing in for a build that
// vendored this library under the prefix `rpg` into an adventure namespaced `adventure`.
import { world } from '@minecraft/server'
import {
  __useServer,
  addComponent,
  createEntity,
  createServer,
  registerEntityType,
  withVanillaDimensions,
  type FakeServer,
} from '@twin-digital/minecraft-test-lib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { actorPropertyKey } from './actor.js'
import { findActor, ForeignEntityError, PRESETS, spawnActor, type ActorPlace } from './index.js'

interface Injection {
  readonly namespace: string
  readonly packToken: string
  readonly prefixes: readonly string[]
}

const host = globalThis as { __MC_PACK_RUNTIME__?: Injection }

const NAMESPACE = 'adventure'
const PACK_TOKEN = 'twin-digital-adventure'
const FAMILY = `mcdk_pack_${PACK_TOKEN}`
// The library's own calls are prefix-bound by the build; a unit test spells the bound form.
const WIZARD_ID = `${NAMESPACE}:wizard`

const inject = (): void => {
  host.__MC_PACK_RUNTIME__ = { namespace: NAMESPACE, packToken: PACK_TOKEN, prefixes: ['rpg'] }
}

let server: FakeServer
let place: ActorPlace

/** Stamps this pack's family on everything spawned, as the build's stamped definitions do. */
const stampOwnFamily = (): void => {
  world.afterEvents.entitySpawn.subscribe((event) => {
    addComponent(event.entity, 'minecraft:type_family', [FAMILY])
  })
}

beforeEach(() => {
  // The shim installs one server per file; each test gets its own instead.
  __useServer()
  server = createServer()
  __useServer(server)
  withVanillaDimensions(server)
  inject()
  registerEntityType(server, WIZARD_ID)
  place = { dimension: server.world.getDimension('overworld'), location: { x: 0.5, y: 64, z: 0.5 } }
})

afterEach(() => {
  delete host.__MC_PACK_RUNTIME__
})

describe('spawnActor', () => {
  it('spawns an actor from a preset name alone', () => {
    stampOwnFamily()
    const wizard = spawnActor('wizard', place)
    expect(wizard.preset).toBe('wizard')
    expect(wizard.entity.isValid).toBe(true)
  })

  it("composes the identifier as the adventure's namespace over this product's prefix", () => {
    stampOwnFamily()
    expect(spawnActor('wizard', place).entityId).toBe(WIZARD_ID)
  })

  it("applies the preset's default name", () => {
    stampOwnFamily()
    expect(spawnActor('wizard', place).entity.nameTag).toBe(PRESETS.wizard.defaultName)
  })

  it('applies a display-name override in place of the default', () => {
    stampOwnFamily()
    expect(spawnActor('wizard', place, { name: 'Eldrin' }).entity.nameTag).toBe('Eldrin')
  })

  it('rejects a preset the catalogue does not hold', () => {
    expect(() => spawnActor('sorcerer' as 'wizard', place)).toThrow(TypeError)
  })

  it("raises ForeignEntityError where the spawned entity is not this pack's own", () => {
    expect(() => spawnActor('wizard', place)).toThrow(ForeignEntityError)
  })

  it('records a durable name and resolves it again in place of a second actor', () => {
    stampOwnFamily()
    const first = spawnActor('wizard', place, { id: 'tower-wizard' })
    const second = spawnActor('wizard', place, { id: 'tower-wizard' })
    expect(second.entity.id).toBe(first.entity.id)
    expect(place.dimension.getEntities()).toHaveLength(1)
  })

  it('leaves the standing actor unchanged, a display-name override included', () => {
    stampOwnFamily()
    spawnActor('wizard', place, { id: 'tower-wizard' })
    const second = spawnActor('wizard', place, { id: 'tower-wizard', name: 'Eldrin' })
    expect(second.entity.nameTag).toBe(PRESETS.wizard.defaultName)
  })

  it("raises ForeignEntityError, and leaves the record, where the record's actor is not this pack's own", () => {
    stampOwnFamily()
    spawnActor('wizard', place, { id: 'tower-wizard' })
    const stored = world.getDynamicProperty(actorPropertyKey('tower-wizard'))
    // A rival pack's definition answering the identifier: same entity id, no family of ours.
    const foreign = createEntity(server, { typeId: WIZARD_ID, dimension: place.dimension })
    world.setDynamicProperty(actorPropertyKey('tower-wizard'), JSON.stringify({ preset: 'wizard', entity: foreign.id }))
    expect(() => spawnActor('wizard', place, { id: 'tower-wizard' })).toThrow(ForeignEntityError)
    expect(world.getDynamicProperty(actorPropertyKey('tower-wizard'))).not.toBe(stored)
    expect(JSON.parse(world.getDynamicProperty(actorPropertyKey('tower-wizard')) as string)).toMatchObject({
      entity: foreign.id,
    })
  })

  it('spawns afresh and overwrites the record where the record is stale', () => {
    stampOwnFamily()
    const first = spawnActor('wizard', place, { id: 'tower-wizard' })
    first.entity.remove()
    const second = spawnActor('wizard', place, { id: 'tower-wizard' })
    expect(second.entity.id).not.toBe(first.entity.id)
    expect(JSON.parse(world.getDynamicProperty(actorPropertyKey('tower-wizard')) as string)).toMatchObject({
      preset: 'wizard',
      entity: second.entity.id,
    })
  })

  it('keys the record on the adventure namespace and stores the bare preset name', () => {
    stampOwnFamily()
    spawnActor('wizard', place, { id: 'tower-wizard' })
    expect(actorPropertyKey('tower-wizard')).toBe(`${NAMESPACE}:rpg-core.actor.tower-wizard`)
    expect(JSON.parse(world.getDynamicProperty(actorPropertyKey('tower-wizard')) as string)).toMatchObject({
      preset: 'wizard',
    })
  })

  it("rejects a durable name holding a ':'", () => {
    stampOwnFamily()
    expect(() => spawnActor('wizard', place, { id: 'a:b' })).toThrow(TypeError)
  })

  it('refuses a durable name where the build turned namespacing off', () => {
    stampOwnFamily()
    delete host.__MC_PACK_RUNTIME__
    expect(() => spawnActor('wizard', place, { id: 'tower-wizard' })).toThrow(/namespacing off/)
  })

  it('treats a record naming a preset the catalogue no longer holds as stale', () => {
    stampOwnFamily()
    const first = spawnActor('wizard', place, { id: 'tower-wizard' })
    world.setDynamicProperty(
      actorPropertyKey('tower-wizard'),
      JSON.stringify({ preset: 'sorcerer', entity: first.entity.id }),
    )
    const second = spawnActor('wizard', place, { id: 'tower-wizard' })
    expect(second.entity.id).not.toBe(first.entity.id)
    expect(JSON.parse(world.getDynamicProperty(actorPropertyKey('tower-wizard')) as string)).toMatchObject({
      preset: 'wizard',
      entity: second.entity.id,
    })
  })
})

describe('findActor', () => {
  it('resolves a handle to the actor spawned under a durable name', () => {
    stampOwnFamily()
    const wizard = spawnActor('wizard', place, { id: 'tower-wizard' })
    const found = findActor('tower-wizard')
    expect(found?.entity.id).toBe(wizard.entity.id)
    expect(found?.preset).toBe('wizard')
    expect(found?.entityId).toBe(WIZARD_ID)
    expect(found?.id).toBe('tower-wizard')
  })

  it('returns undefined for a name no record holds, without touching the world', () => {
    expect(findActor('nobody')).toBeUndefined()
    expect(place.dimension.getEntities()).toHaveLength(0)
  })

  it('returns undefined where the record is stale, leaving the record in place', () => {
    stampOwnFamily()
    spawnActor('wizard', place, { id: 'tower-wizard' }).entity.remove()
    expect(findActor('tower-wizard')).toBeUndefined()
    expect(world.getDynamicProperty(actorPropertyKey('tower-wizard'))).toBeTypeOf('string')
  })

  it("raises ForeignEntityError where the record's actor is not this pack's own", () => {
    const foreign = createEntity(server, { typeId: WIZARD_ID, dimension: place.dimension })
    world.setDynamicProperty(actorPropertyKey('tower-wizard'), JSON.stringify({ preset: 'wizard', entity: foreign.id }))
    expect(() => findActor('tower-wizard')).toThrow(ForeignEntityError)
  })
})

describe('a handle', () => {
  it('removes the actor and releases its durable name', () => {
    stampOwnFamily()
    const wizard = spawnActor('wizard', place, { id: 'tower-wizard' })
    wizard.remove()
    expect(place.dimension.getEntities()).toHaveLength(0)
    expect(world.getDynamicProperty(actorPropertyKey('tower-wizard'))).toBeUndefined()
    expect(findActor('tower-wizard')).toBeUndefined()
  })
})

describe('the entry point', () => {
  it('exports no entity identifier, namespace, or pack name', async () => {
    const entry: Record<string, unknown> = await import('./index.js')
    expect(Object.keys(entry).sort()).toEqual(
      ['ForeignEntityError', 'PRESETS', 'PRESET_NAMES', 'findActor', 'spawnActor'].sort(),
    )
    for (const preset of Object.values(PRESETS)) {
      expect(Object.keys(preset).sort()).toEqual(['defaultName', 'preset'])
    }
  })
})
