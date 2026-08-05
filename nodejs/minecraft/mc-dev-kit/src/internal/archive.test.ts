import { describe, expect, it } from 'vitest'
import { PACK_MEMBERS, RELEASE_ASSETS } from './archive.js'

describe('the archive layout', () => {
  it('cuts one mcpack member per pack kind, named for the kind', () => {
    expect(PACK_MEMBERS).toEqual([
      ['behavior_pack', 'behavior_pack.mcpack'],
      ['resource_pack', 'resource_pack.mcpack'],
    ])
  })

  it('writes where the release hook looks', () => {
    expect(RELEASE_ASSETS).toBe('.release-assets')
  })
})

describe.todo('archivePackage', () => {
  it.todo('cuts one .mcaddon per package, whatever the number of packs it holds')
  it.todo('names it <scope-stripped package name>-<version>.mcaddon from the package.json')
  it.todo("holds each pack output directory's contents at its member's root")
  it.todo('reads the output tree and calls the kit for nothing, so a stale tree archives as it stands')
  it.todo('fails naming the missing directory when the output tree is absent, and runs no build')
  it.todo('creates .release-assets/ and removes any archive already sitting there')
})
