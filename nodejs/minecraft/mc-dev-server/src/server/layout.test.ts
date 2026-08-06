import { describe, expect, it } from 'vitest'

import { activationFile, packDir, poolDir, worldDir } from './layout.js'

describe('the server layout', () => {
  // d-jv1zleaj — the one layout everything the harness reads and writes uses
  it('places each kind in its own pool', () => {
    expect(poolDir('behavior')).toBe('/data/development_behavior_packs')
    expect(poolDir('resource')).toBe('/data/development_resource_packs')
  })

  // d-oo8256gl, d-0thqo4n0 — a pack occupies a directory named for its uuid, lowercased
  it('names a pack directory for its lowercased uuid', () => {
    expect(packDir('behavior', 'A1111111-1111-4111-8111-111111111111')).toBe(
      '/data/development_behavior_packs/a1111111-1111-4111-8111-111111111111',
    )
  })

  it('puts the world under its level name', () => {
    expect(worldDir('dev')).toBe('/data/worlds/dev')
  })

  // d-jv1zleaj — the activation lists sit beside each other in the world directory
  it('names the activation list of each kind', () => {
    expect(activationFile('dev', 'behavior')).toBe('/data/worlds/dev/world_behavior_packs.json')
    expect(activationFile('dev', 'resource')).toBe('/data/worlds/dev/world_resource_packs.json')
  })
})
