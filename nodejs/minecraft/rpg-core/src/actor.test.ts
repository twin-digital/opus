// The public surface, exercised through the module-scope `world` the shim installs per file.
//
// The shipped fakes leave `EntityTypes.get` unimplemented — it throws `NotImplementedError` — so
// the registered / not-registered branches of the definitions check are not reachable here; the
// example adventure demonstrates them in a world. What IS demonstrable: the check runs first, a
// throwing catalog lookup propagates untranslated (the engine-refusal case), and the paths that
// precede the check behave.
import { currentServer, NotImplementedError, withVanillaDimensions } from '@twin-digital/minecraft-test-lib'
import { beforeEach, describe, expect, it } from 'vitest'

import { actorPropertyKey } from './internal.js'
import { findActor, spawnActor, type ActorPlace } from './index.js'

let place: ActorPlace

beforeEach(() => {
  const server = currentServer()
  withVanillaDimensions(server)
  place = { dimension: server.world.getDimension('overworld'), location: { x: 0.5, y: 64, z: 0.5 } }
})

describe('spawnActor', () => {
  it('fails on the catalog lookup itself when the catalog refuses, not on the product error', () => {
    expect(() => spawnActor('wizard', place)).toThrow(NotImplementedError)
  })

  it('checks before acting: a failed call has spawned nothing', () => {
    expect(() => spawnActor('wizard', place)).toThrow()
    expect([...place.dimension.getEntities()]).toHaveLength(0)
    expect(currentServer().world.getDynamicPropertyIds()).toEqual([])
  })

  it('rejects an unknown preset by name before any catalog lookup', () => {
    expect(() => spawnActor('goblin' as 'wizard', place)).toThrow(/goblin.*wizard/)
  })
})

describe('findActor', () => {
  it('returns undefined for an id no actor holds', () => {
    expect(findActor('nobody')).toBeUndefined()
  })

  it('checks the stored record before touching the entity', () => {
    currentServer().world.setDynamicProperty(
      actorPropertyKey('tower-wizard'),
      JSON.stringify({ preset: 'wizard', typeId: 'rpg:wizard', entity: '1' }),
    )
    expect(() => findActor('tower-wizard')).toThrow(NotImplementedError)
  })
})
