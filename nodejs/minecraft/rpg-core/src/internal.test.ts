import type { Dimension } from '@minecraft/server'
import { createServer, withVanillaDimensions, type FakeServer } from '@twin-digital/minecraft-test-lib'
import { beforeEach, describe, expect, it } from 'vitest'

import type { ActorPlace } from './actor.js'
import type { EnsureDefinitions } from './catalog.js'
import { actorPropertyKey, placeActor, resolveActor } from './internal.js'
import { PRESETS } from './registry.js'

const noCheck: EnsureDefinitions = () => undefined

let server: FakeServer
let overworld: Dimension
let place: ActorPlace

beforeEach(() => {
  server = createServer()
  withVanillaDimensions(server)
  overworld = server.world.getDimension('overworld')
  place = { dimension: overworld, location: { x: 0.5, y: 64, z: 0.5 } }
})

const entityCount = (): number => [...overworld.getEntities()].length

describe('placeActor', () => {
  it('spawns an entity of the preset identifier at the given place', () => {
    const handle = placeActor(noCheck, server.world, 'wizard', place)
    expect(handle.entity.typeId).toBe(PRESETS.wizard.entityId)
    expect(handle.entity.dimension).toBe(overworld)
    expect(handle.entity.location).toEqual(place.location)
    expect(handle.preset).toBe('wizard')
    expect(handle.entityId).toBe('rpg:wizard')
  })

  it('applies the preset default name when no override is given', () => {
    const handle = placeActor(noCheck, server.world, 'wizard', place)
    expect(handle.entity.nameTag).toBe(PRESETS.wizard.defaultName)
  })

  it('applies options.name in place of the default name', () => {
    const handle = placeActor(noCheck, server.world, 'wizard', place, { name: 'Eldrin' })
    expect(handle.entity.nameTag).toBe('Eldrin')
  })

  it('rejects an unknown preset by name, before the definitions check runs', () => {
    const calls: string[] = []
    const recording: EnsureDefinitions = (preset) => {
      calls.push(preset)
    }
    expect(() => placeActor(recording, server.world, 'goblin' as 'wizard', place)).toThrow(/goblin.*wizard/)
    expect(calls).toEqual([])
    expect(entityCount()).toBe(0)
  })

  it('checks definitions before spawning, and spawns nothing when the check throws', () => {
    const refusal = new Error('not registered')
    const failing: EnsureDefinitions = () => {
      throw refusal
    }
    expect(() => placeActor(failing, server.world, 'wizard', place)).toThrow(refusal)
    expect(entityCount()).toBe(0)
    expect(server.world.getDynamicPropertyIds()).toEqual([])
  })

  it('hands the check the preset and its entity identifier', () => {
    const calls: [string, string][] = []
    const recording: EnsureDefinitions = (preset, typeId) => {
      calls.push([preset, typeId])
    }
    placeActor(recording, server.world, 'wizard', place)
    expect(calls).toEqual([['wizard', 'rpg:wizard']])
  })

  it('holds no durable record when no id is given', () => {
    const handle = placeActor(noCheck, server.world, 'wizard', place)
    expect(handle.id).toBeUndefined()
    expect(server.world.getDynamicPropertyIds()).toEqual([])
  })

  it('records a durable id under the product namespace', () => {
    placeActor(noCheck, server.world, 'wizard', place, { id: 'tower-wizard' })
    expect(server.world.getDynamicPropertyIds()).toEqual([actorPropertyKey('tower-wizard')])
  })

  it('returns the actor already there when placed again under the same id', () => {
    const first = placeActor(noCheck, server.world, 'wizard', place, { id: 'tower-wizard' })
    const second = placeActor(noCheck, server.world, 'wizard', place, { id: 'tower-wizard' })
    expect(second.entity.id).toBe(first.entity.id)
    expect(second.id).toBe('tower-wizard')
    expect(entityCount()).toBe(1)
  })

  it('changes nothing about the actor already there — a name override included', () => {
    placeActor(noCheck, server.world, 'wizard', place, { id: 'tower-wizard', name: 'Eldrin' })
    const again = placeActor(noCheck, server.world, 'wizard', place, { id: 'tower-wizard', name: 'Someone Else' })
    expect(again.entity.nameTag).toBe('Eldrin')
  })

  it('spawns fresh and re-records when the recorded actor no longer exists', () => {
    const first = placeActor(noCheck, server.world, 'wizard', place, { id: 'tower-wizard' })
    first.entity.remove()
    const second = placeActor(noCheck, server.world, 'wizard', place, { id: 'tower-wizard' })
    expect(second.entity.id).not.toBe(first.entity.id)
    expect(second.entity.isValid).toBe(true)
    expect(resolveActor(noCheck, server.world, 'tower-wizard')?.entity.id).toBe(second.entity.id)
  })
})

describe('resolveActor', () => {
  it('resolves a handle by durable id, reaching the same actor', () => {
    const spawned = placeActor(noCheck, server.world, 'wizard', place, { id: 'tower-wizard' })
    const found = resolveActor(noCheck, server.world, 'tower-wizard')
    expect(found?.entity.id).toBe(spawned.entity.id)
    expect(found?.preset).toBe('wizard')
    expect(found?.entityId).toBe('rpg:wizard')
    expect(found?.id).toBe('tower-wizard')
  })

  it('resolves through the world record alone — no in-process state', () => {
    // A world built by hand, as a later session would present it: the record and the entity
    // exist, but no placeActor call ran in this process.
    const entity = overworld.spawnEntity('rpg:wizard', place.location)
    entity.nameTag = 'Eldrin'
    server.world.setDynamicProperty(
      actorPropertyKey('tower-wizard'),
      JSON.stringify({ preset: 'wizard', typeId: 'rpg:wizard', entity: entity.id }),
    )
    const found = resolveActor(noCheck, server.world, 'tower-wizard')
    expect(found?.entity.id).toBe(entity.id)
    expect(found?.entity.nameTag).toBe('Eldrin')
  })

  it('returns undefined for an id no actor holds, without consulting the check', () => {
    const calls: string[] = []
    const recording: EnsureDefinitions = (preset) => {
      calls.push(preset)
    }
    expect(resolveActor(recording, server.world, 'nobody')).toBeUndefined()
    expect(calls).toEqual([])
  })

  it('checks definitions from the stored record before touching the entity', () => {
    placeActor(noCheck, server.world, 'wizard', place, { id: 'tower-wizard' })
    const refusal = new Error('not registered')
    const calls: [string, string][] = []
    const failing: EnsureDefinitions = (preset, typeId) => {
      calls.push([preset, typeId])
      throw refusal
    }
    expect(() => resolveActor(failing, server.world, 'tower-wizard')).toThrow(refusal)
    expect(calls).toEqual([['wizard', 'rpg:wizard']])
  })

  it('returns undefined when the recorded actor no longer exists', () => {
    const spawned = placeActor(noCheck, server.world, 'wizard', place, { id: 'tower-wizard' })
    spawned.entity.remove()
    expect(resolveActor(noCheck, server.world, 'tower-wizard')).toBeUndefined()
  })

  it('treats an unreadable record as absent', () => {
    server.world.setDynamicProperty(actorPropertyKey('tower-wizard'), 'not json')
    expect(resolveActor(noCheck, server.world, 'tower-wizard')).toBeUndefined()
  })
})

describe('ActorHandle.remove', () => {
  it('removes the actor from the world', () => {
    const handle = placeActor(noCheck, server.world, 'wizard', place)
    handle.remove()
    expect(handle.entity.isValid).toBe(false)
    expect(entityCount()).toBe(0)
  })

  it('releases the durable name', () => {
    const handle = placeActor(noCheck, server.world, 'wizard', place, { id: 'tower-wizard' })
    handle.remove()
    expect(server.world.getDynamicPropertyIds()).toEqual([])
    expect(resolveActor(noCheck, server.world, 'tower-wizard')).toBeUndefined()
  })

  it('checks definitions before acting, and removes nothing when the check throws', () => {
    const handle = placeActor(noCheck, server.world, 'wizard', place, { id: 'tower-wizard' })
    const refusal = new Error('not registered')
    let fail = false
    const failing: EnsureDefinitions = () => {
      if (fail) {
        throw refusal
      }
    }
    const guarded = placeActor(failing, server.world, 'wizard', place, { id: 'other-wizard' })
    fail = true
    expect(() => {
      guarded.remove()
    }).toThrow(refusal)
    expect(guarded.entity.isValid).toBe(true)
    expect(handle.entity.isValid).toBe(true)
  })
})
