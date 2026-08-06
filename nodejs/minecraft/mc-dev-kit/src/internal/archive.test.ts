import { readFile } from 'node:fs/promises'
import path from 'node:path'
import AdmZip from 'adm-zip'
import { describe, expect, it } from 'vitest'
import { listTree, writeWorkspace, type FixtureFile } from '../../test/fixture.js'
import { PACK_MEMBERS, RELEASE_ASSETS, archivePackage } from './archive.js'

/** A built package, holding whatever output tree the case describes. */
async function builtPackage(files: Record<string, FixtureFile>): Promise<string> {
  return writeWorkspace({
    'package.json': { name: '@scope/pack-1', version: '1.2.3' },
    ...files,
  })
}

/** The member names an archive holds, sorted. */
function membersOf(archive: Buffer): string[] {
  return new AdmZip(archive)
    .getEntries()
    .map((entry) => entry.entryName)
    .sort()
}

/** The bytes of one named member of an archive. */
function memberData(archive: Buffer, member: string): Buffer {
  const data = new AdmZip(archive).getEntry(member)?.getData()
  if (data === undefined) {
    throw new Error(`${member} is not in the archive`)
  }
  return data
}

/** The entry names of one `.mcpack` member of an `.mcaddon`, sorted. */
function memberContents(archive: Buffer, member: string): string[] {
  return membersOf(memberData(archive, member))
}

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

describe('archivePackage', () => {
  it('cuts one .mcaddon per package, whatever the number of packs it holds', async () => {
    const two = await builtPackage({
      'dist/behavior_pack/manifest.json': { header: {} },
      'dist/resource_pack/manifest.json': { header: {} },
    })
    expect(membersOf(await readFile(await archivePackage(two)))).toEqual([
      'behavior_pack.mcpack',
      'resource_pack.mcpack',
    ])

    const one = await builtPackage({ 'dist/resource_pack/manifest.json': { header: {} } })
    const archive = await archivePackage(one)
    expect(await listTree(path.join(one, RELEASE_ASSETS))).toEqual([path.basename(archive)])
    expect(membersOf(await readFile(archive))).toEqual(['resource_pack.mcpack'])
  })

  it('names it <scope-stripped package name>-<version>.mcaddon from the package.json', async () => {
    const workspace = await builtPackage({ 'dist/behavior_pack/manifest.json': { header: {} } })

    expect(path.basename(await archivePackage(workspace))).toBe('pack-1-1.2.3.mcaddon')
  })

  it("holds each pack output directory's contents at its member's root", async () => {
    const workspace = await builtPackage({
      'dist/behavior_pack/manifest.json': { header: {} },
      'dist/behavior_pack/scripts/main.js': 'export const a = 1\n',
      'dist/behavior_pack/functions/tick.mcfunction': 'say hi\n',
    })

    const archive = await readFile(await archivePackage(workspace))
    expect(memberContents(archive, 'behavior_pack.mcpack')).toEqual([
      'functions/tick.mcfunction',
      'manifest.json',
      'scripts/main.js',
    ])
  })

  it('reads the output tree and calls the kit for nothing, so a stale tree archives as it stands', async () => {
    const workspace = await builtPackage({
      // a source tree that contradicts the built one, and a built manifest no completion would write
      'behavior_pack/manifest.json': { header: { uuid: '11111111-1111-1111-1111-111111111111' } },
      'behavior_pack/functions/new.mcfunction': 'say new\n',
      'dist/behavior_pack/manifest.json': { header: { name: 'stale', version: '0.0.1' } },
    })

    const archive = await readFile(await archivePackage(workspace))
    expect(memberContents(archive, 'behavior_pack.mcpack')).toEqual(['manifest.json'])

    const nested = new AdmZip(memberData(archive, 'behavior_pack.mcpack'))
    const manifest = JSON.parse(memberData(nested.toBuffer(), 'manifest.json').toString()) as { header: unknown }
    expect(manifest.header).toEqual({ name: 'stale', version: '0.0.1' })
  })

  it('fails naming the missing directory when the output tree is absent, and runs no build', async () => {
    const workspace = await builtPackage({ 'behavior_pack/manifest.json': { header: {} } })

    await expect(archivePackage(workspace)).rejects.toThrow(new RegExp(path.join(workspace, 'dist')))
    expect(await listTree(path.join(workspace, 'dist'))).toEqual([])
  })

  it('creates .release-assets/ and removes any archive already sitting there', async () => {
    const workspace = await builtPackage({
      'dist/behavior_pack/manifest.json': { header: {} },
      '.release-assets/pack-1-1.0.0.mcaddon': 'a previous version',
    })

    await archivePackage(workspace)

    expect(await listTree(path.join(workspace, RELEASE_ASSETS))).toEqual(['pack-1-1.2.3.mcaddon'])
  })
})
