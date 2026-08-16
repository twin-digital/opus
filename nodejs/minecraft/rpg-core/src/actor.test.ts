// The public surface, exercised through the module-scope bindings the shim installs per file.
// The definitions check runs against the fake catalog: `registerEntityType` stands in for the
// assets pack being active, its absence for the pack missing. The engine's early-execution
// refusal has no counterpart in the fakes (lookups answer whenever a test makes them), so that
// case rests on the check having no handler around it — see catalog.ts — and the example
// adventure's in-world run.
import {
  __useServer,
  createServer,
  registerEntityType,
  withVanillaDimensions,
  type FakeServer,
} from '@twin-digital/minecraft-test-lib'
import { beforeEach, describe, expect, it } from 'vitest'

import { actorPropertyKey } from './actor.js'
import { ActorDefinitionsMissingError, findActor, PACK_NAME, PRESETS, spawnActor, type ActorPlace } from './index.js'

let server: FakeServer
let place: ActorPlace

beforeEach(() => {
  // The shim installs one server per file; each test gets its own instead.
  __useServer()
  server = createServer()
  __useServer(server)
  withVanillaDimensions(server)
  place = { dimension: server.world.getDimension('overworld'), location: { x: 0.5, y: 64, z: 0.5 } }
})

/** The assets pack active in the world, as far as definitions go. */
const withDefinitions = (): void => {
  registerEntityType(server, PRESETS.wizard.entityId)
}

const entityCount = (): number => [...place.dimension.getEntities()].length

describe('spawnActor with the entity type registered', () => {
  beforeEach(withDefinitions)

  it('proceeds: spawns an entity of the preset identifier at the given place', () => {
    const handle = spawnActor('wizard', place)
    expect(handle.entity.typeId).toBe('rpg:wizard')
    expect(handle.entity.dimension).toBe(place.dimension)
    expect(handle.entity.location).toEqual(place.location)
    expect(handle.preset).toBe('wizard')
    expect(handle.entityId).toBe('rpg:wizard')
    expect(entityCount()).toBe(1)
  })

  it('applies the preset default name when no override is given', () => {
    expect(spawnActor('wizard', place).entity.nameTag).toBe(PRESETS.wizard.defaultName)
  })

  it('applies options.name in place of the default name', () => {
    expect(spawnActor('wizard', place, { name: 'Eldrin' }).entity.nameTag).toBe('Eldrin')
  })

  it('holds no durable record when no id is given', () => {
    const handle = spawnActor('wizard', place)
    expect(handle.id).toBeUndefined()
    expect(server.world.getDynamicPropertyIds()).toEqual([])
  })

  it('records a durable id under the product namespace', () => {
    spawnActor('wizard', place, { id: 'tower-wizard' })
    expect(server.world.getDynamicPropertyIds()).toEqual([actorPropertyKey('tower-wizard')])
  })

  it('returns the actor already there when spawned again under the same id', () => {
    const first = spawnActor('wizard', place, { id: 'tower-wizard' })
    const second = spawnActor('wizard', place, { id: 'tower-wizard' })
    expect(second.entity.id).toBe(first.entity.id)
    expect(second.id).toBe('tower-wizard')
    expect(entityCount()).toBe(1)
  })

  it('changes nothing about the actor already there — a name override included', () => {
    spawnActor('wizard', place, { id: 'tower-wizard', name: 'Eldrin' })
    const again = spawnActor('wizard', place, { id: 'tower-wizard', name: 'Someone Else' })
    expect(again.entity.nameTag).toBe('Eldrin')
  })

  it('spawns fresh and re-records when the recorded actor no longer exists', () => {
    const first = spawnActor('wizard', place, { id: 'tower-wizard' })
    first.entity.remove()
    const second = spawnActor('wizard', place, { id: 'tower-wizard' })
    expect(second.entity.id).not.toBe(first.entity.id)
    expect(second.entity.isValid).toBe(true)
    expect(findActor('tower-wizard')?.entity.id).toBe(second.entity.id)
  })
})

describe('spawnActor with the entity type not registered', () => {
  it('throws the product error, naming the preset, the identifier, and the pack', () => {
    let thrown: unknown
    try {
      spawnActor('wizard', place)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(ActorDefinitionsMissingError)
    const error = thrown as ActorDefinitionsMissingError
    expect(error.preset).toBe('wizard')
    expect(error.identifier).toBe('rpg:wizard')
    expect(error.pack).toBe(PACK_NAME)
    expect(error.message).toContain('wizard')
    expect(error.message).toContain('rpg:wizard')
    expect(error.message).toContain(PACK_NAME)
  })

  it('checks before acting: a failed call has spawned and recorded nothing', () => {
    expect(() => spawnActor('wizard', place, { id: 'tower-wizard' })).toThrow(ActorDefinitionsMissingError)
    expect(entityCount()).toBe(0)
    expect(server.world.getDynamicPropertyIds()).toEqual([])
  })

  it('rejects an unknown preset by name, before the definitions check', () => {
    expect(() => spawnActor('goblin' as 'wizard', place)).toThrow(/goblin.*wizard/)
    expect(() => spawnActor('goblin' as 'wizard', place)).not.toThrow(ActorDefinitionsMissingError)
  })
})

describe('findActor', () => {
  it('resolves a handle by durable id, reaching the same actor', () => {
    withDefinitions()
    const spawned = spawnActor('wizard', place, { id: 'tower-wizard', name: 'Eldrin' })
    const found = findActor('tower-wizard')
    expect(found?.entity.id).toBe(spawned.entity.id)
    expect(found?.entity.nameTag).toBe('Eldrin')
    expect(found?.preset).toBe('wizard')
    expect(found?.entityId).toBe('rpg:wizard')
    expect(found?.id).toBe('tower-wizard')
  })

  it('resolves through the world record alone — no in-process state', () => {
    // A world built by hand, as a later session would present it: the definitions, the record,
    // and the entity exist, but no spawnActor call ran in this process.
    withDefinitions()
    const entity = place.dimension.spawnEntity('rpg:wizard', place.location)
    entity.nameTag = 'Eldrin'
    server.world.setDynamicProperty(
      actorPropertyKey('tower-wizard'),
      JSON.stringify({ preset: 'wizard', typeId: 'rpg:wizard', entity: entity.id }),
    )
    expect(findActor('tower-wizard')?.entity.id).toBe(entity.id)
  })

  it('returns undefined for an id no actor holds — no check made, there is no actor to act on', () => {
    // The entity type is not registered here: a call that consulted the catalog would throw.
    expect(findActor('nobody')).toBeUndefined()
  })

  it('checks the stored record before touching the entity', () => {
    server.world.setDynamicProperty(
      actorPropertyKey('tower-wizard'),
      JSON.stringify({ preset: 'wizard', typeId: 'rpg:wizard', entity: '1' }),
    )
    let thrown: unknown
    try {
      findActor('tower-wizard')
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(ActorDefinitionsMissingError)
    expect((thrown as ActorDefinitionsMissingError).identifier).toBe('rpg:wizard')
  })

  it('returns undefined when the recorded actor no longer exists', () => {
    withDefinitions()
    const spawned = spawnActor('wizard', place, { id: 'tower-wizard' })
    spawned.entity.remove()
    expect(findActor('tower-wizard')).toBeUndefined()
  })

  it('treats an unreadable record as absent', () => {
    withDefinitions()
    server.world.setDynamicProperty(actorPropertyKey('tower-wizard'), 'not json')
    expect(findActor('tower-wizard')).toBeUndefined()
  })
})

describe('ActorHandle.remove', () => {
  beforeEach(withDefinitions)

  it('removes the actor from the world', () => {
    const handle = spawnActor('wizard', place)
    handle.remove()
    expect(handle.entity.isValid).toBe(false)
    expect(entityCount()).toBe(0)
  })

  it('releases the durable name', () => {
    const handle = spawnActor('wizard', place, { id: 'tower-wizard' })
    handle.remove()
    expect(server.world.getDynamicPropertyIds()).toEqual([])
    expect(findActor('tower-wizard')).toBeUndefined()
  })

  it('checks definitions first, and removes nothing when the world lacks them', () => {
    const handle = spawnActor('wizard', place, { id: 'tower-wizard' })
    // A world without the assets pack: a fresh server holding no registration.
    __useServer()
    __useServer(createServer())
    try {
      expect(() => {
        handle.remove()
      }).toThrow(ActorDefinitionsMissingError)
      expect(handle.entity.isValid).toBe(true)
    } finally {
      __useServer()
      __useServer(server)
    }
    expect(server.world.getDynamicPropertyIds()).toEqual([actorPropertyKey('tower-wizard')])
  })
})
