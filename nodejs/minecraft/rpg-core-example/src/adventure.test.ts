/**
 * The adventure's own logic, driven through the library seam: what it asks the library for, and
 * nothing about what the library does with it. What the spawn call itself delivers — the entity,
 * the default name, the durable-name dedupe — is the library's contract, tested there.
 */

import {
  advanceTicks,
  createServer,
  emit,
  getOutput,
  withVanillaDimensions,
  type FakeServer,
} from '@twin-digital/minecraft-test-lib'
import { ActorDefinitionsMissingError, PRESET_NAMES, PRESETS } from '@twin-digital/rpg-core'
import type { ActorHandle, ActorPlace, PresetName, SpawnActorOptions } from '@twin-digital/rpg-core'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  durableId,
  installAdventure,
  PLACEMENT_ATTEMPTS,
  PLACEMENT_TICKS,
  placements,
  SPACING,
  STAGE,
} from './adventure.js'

interface SpawnCall {
  readonly preset: PresetName
  readonly place: ActorPlace
  readonly options?: SpawnActorOptions
}

let server: FakeServer
let calls: SpawnCall[]

/** The chat messages the adventure sent; other output shapes are not its. */
const messagesOf = (target: FakeServer): string[] =>
  getOutput(target.world).flatMap((record) => (typeof record.value === 'string' ? [record.value] : []))

const handleFor = (preset: PresetName, options?: SpawnActorOptions): ActorHandle => ({
  preset,
  entityId: PRESETS[preset].entityId,
  id: options?.id,
  entity: { nameTag: options?.name ?? 'default' } as ActorHandle['entity'],
  remove: () => undefined,
})

/** Records what the adventure asked for and hands back a handle, like a spawn that succeeded. */
const recordingSpawn = (preset: PresetName, place: ActorPlace, options?: SpawnActorOptions): ActorHandle => {
  calls.push({ preset, place, options })
  return handleFor(preset, options)
}

/** Installs against this test's server and runs the story to its first placement attempt. */
const runStory = (spawn = recordingSpawn, find: (id: string) => ActorHandle | undefined = () => undefined): void => {
  installAdventure({ world: server.world, system: server.system, spawn, find })
  emit(server.world.afterEvents.worldLoad, {})
  advanceTicks(server, PLACEMENT_TICKS)
}

beforeEach(() => {
  server = createServer()
  withVanillaDimensions(server)
  calls = []
})

describe('installAdventure', () => {
  it('places nothing before the world loads', () => {
    installAdventure({ world: server.world, system: server.system, spawn: recordingSpawn, find: () => undefined })
    advanceTicks(server, PLACEMENT_TICKS * 2)
    expect(calls).toHaveLength(0)
  })

  it('places the greeter and one actor per preset the product offers', () => {
    runStory()

    expect(calls).toHaveLength(PRESET_NAMES.length + 1)
    const gallery = calls.filter((call) => call.options?.name === undefined)
    expect(gallery.map((call) => call.preset)).toEqual([...PRESET_NAMES])
  })

  it('names the greeter itself, and no other actor — preset defaults are the library’s', () => {
    runStory()

    const named = calls.filter((call) => call.options?.name !== undefined)
    expect(named).toHaveLength(1)
    expect(named[0]?.options).toEqual({ id: 'example:greeter', name: 'Eldrin the Greeter' })
  })

  it('places each actor under a durable id of its own', () => {
    runStory()

    const ids = calls.map((call) => call.options?.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const preset of PRESET_NAMES) {
      expect(ids).toContain(durableId(preset))
    }
  })

  it('asks for the same durable ids after a restart, so nothing is placed twice', () => {
    runStory()
    const firstRun = calls.map((call) => call.options?.id)

    // a restart is a fresh world and a fresh run of the same story
    server = createServer()
    withVanillaDimensions(server)
    calls = []
    runStory()

    expect(calls.map((call) => call.options?.id)).toEqual(firstRun)
  })

  it('gives each actor its own spot in the overworld gallery', () => {
    runStory()

    const overworld = server.world.getDimension('overworld')
    const spots = new Set<string>()
    for (const call of calls) {
      expect(call.place.dimension).toBe(overworld)
      spots.add(`${call.place.location.x},${call.place.location.y},${call.place.location.z}`)
    }
    expect(spots.size).toBe(calls.length)
    expect(calls.map((call) => call.place.location)).toContainEqual({
      x: STAGE.x,
      y: STAGE.y,
      z: STAGE.z + SPACING,
    })
  })

  it('reports an actor whose definitions are missing, once, and places the rest', () => {
    // the greeter's spawn finds no definitions; every other placement succeeds
    let failures = 0
    const failingSpawn = (preset: PresetName, place: ActorPlace, options?: SpawnActorOptions): ActorHandle => {
      if (options?.name !== undefined) {
        failures += 1
        throw new ActorDefinitionsMissingError(preset, PRESETS[preset].entityId, 'RPG Core Actors')
      }
      return recordingSpawn(preset, place, options)
    }

    runStory(failingSpawn)
    advanceTicks(server, PLACEMENT_TICKS * 3)

    expect(failures).toBe(1)
    expect(calls.map((call) => call.preset)).toEqual([...PRESET_NAMES])
    const report = messagesOf(server).filter((message) => message.includes("could not place 'greeter'"))
    expect(report).toHaveLength(1)
    expect(report[0]).toContain('RPG Core Actors')
  })

  it('retries a placement the world was not ready for, and it lands without a complaint', () => {
    // the first attempt at everything fails as an unloaded chunk would; the next succeeds
    let ready = false
    const flakySpawn = (preset: PresetName, place: ActorPlace, options?: SpawnActorOptions): ActorHandle => {
      if (!ready) {
        throw new Error('cannot spawn in an unloaded chunk')
      }
      return recordingSpawn(preset, place, options)
    }

    runStory(flakySpawn)
    expect(calls).toHaveLength(0)

    ready = true
    advanceTicks(server, PLACEMENT_TICKS)

    expect(calls).toHaveLength(placements().length)
    expect(messagesOf(server).filter((message) => message.includes('could not place'))).toHaveLength(0)
  })

  it('gives up loudly when a placement never lands', () => {
    const brokenSpawn = (): ActorHandle => {
      throw new Error('cannot spawn in an unloaded chunk')
    }

    runStory(brokenSpawn)
    advanceTicks(server, PLACEMENT_TICKS * PLACEMENT_ATTEMPTS)

    const givenUp = messagesOf(server).filter((message) => message.includes('gave up placing'))
    expect(givenUp).toHaveLength(placements().length)
  })

  it('reports each actor standing under its name once the story is done', () => {
    const found = new Map<string, ActorHandle>()
    const spawn = (preset: PresetName, place: ActorPlace, options?: SpawnActorOptions): ActorHandle => {
      const handle = recordingSpawn(preset, place, options)
      if (options?.id !== undefined) {
        found.set(options.id, handle)
      }
      return handle
    }

    runStory(spawn, (id) => found.get(id))

    const standing = messagesOf(server).filter((message) => message.includes('stands as'))
    expect(standing).toHaveLength(placements().length)
    expect(standing.some((message) => message.includes("'greeter' stands as 'Eldrin the Greeter'"))).toBe(true)
  })
})
