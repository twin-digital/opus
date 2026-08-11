// Test plan for the spawn/lookup/removal surface; filled in during the Code wave.
// All tests stand up `@minecraft/server` via @twin-digital/minecraft-test-lib.
import { describe, it } from 'vitest'

describe('spawnActor', () => {
  it.todo('spawns an entity of the preset identifier at the given place')
  it.todo('applies the preset default name when no override is given')
  it.todo('applies options.name in place of the default name')
  it.todo(
    'throws ActorDefinitionsMissingError naming preset, identifier, and pack when the entity type is not registered',
  )
  it.todo('spawns nothing when it throws — no handle to an actor it did not create')
  it.todo('returns the actor already in the world when spawned again under the same durable id')
})

describe('findActor', () => {
  it.todo('resolves a handle by durable id in a later session')
  it.todo('returns undefined for an id no actor holds')
  it.todo('checks the entity type is registered before acting')
})

describe('ActorHandle', () => {
  it.todo('remove() removes the actor from the world')
})
