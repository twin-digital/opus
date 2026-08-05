import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'tsdown'
import { describe, expect, it } from 'vitest'
import { buildPackage, listTree, packManifest, writeWorkspace, type FixtureFile } from '../../test/fixture.js'
import { packBuild } from '../build.js'
import { packBuildPlugin, type BuildPlugin } from './pack-build-plugin.js'

/** A workspace holding one pack package, plus whatever the case adds. */
async function workspaceWith(files: Record<string, FixtureFile>): Promise<string> {
  return writeWorkspace({
    'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
    'package.json': { name: 'root', version: '0.0.0', private: true },
    'packages/pack-1/package.json': { name: '@scope/pack-1', version: '1.2.3' },
    ...files,
  })
}

/** The behavior pack manifest of a pack that declares a script module. */
function scriptedManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return packManifest('behavior', {
    modules: [
      { type: 'data', uuid: '33333333-3333-3333-3333-333333333333', version: [1, 0, 0] },
      { type: 'script', uuid: '44444444-4444-4444-4444-444444444444', version: [1, 0, 0] },
    ],
    ...overrides,
  })
}

describe('the plugin builds the package', () => {
  it('takes the package’s packs from the kit’s pack set, resolving the root by ascent', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/other/package.json': { name: '@scope/other', version: '9.9.9' },
      'packages/other/behavior_pack/manifest.json': packManifest('behavior', {
        header: { description: 'other', uuid: '99999999-9999-9999-9999-999999999999' },
      }),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir)

    // this package's pack, completed from its own package.json, and no sibling package's pack
    const manifest = JSON.parse(await readFile(path.join(packageDir, 'dist/behavior_pack/manifest.json'), 'utf8')) as {
      header: unknown
    }
    expect(manifest.header).toMatchObject({ name: 'pack-1', version: '1.2.3' })
    expect(await listTree(path.join(workspace, 'packages/other/dist'))).toEqual([])
  })

  it('fails naming the file when the kit’s enumeration rejects', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/broken/package.json': '{ not json',
    })

    await expect(buildPackage(path.join(workspace, 'packages/pack-1'))).rejects.toThrow(/packages\/broken/)
  })

  it('fails naming the package directory when the kit reports no pack', async () => {
    const workspace = await workspaceWith({})
    const packageDir = path.join(workspace, 'packages/pack-1')

    await expect(buildPackage(packageDir)).rejects.toThrow(new RegExp(`no pack found in ${packageDir}`))
  })

  it('fails with the kit’s problems printed when a pack is invalid, building no sibling pack', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior', {
        header: { uuid: '11111111-1111-1111-1111-111111111111', name: 'specified' },
      }),
      'packages/pack-1/resource_pack/manifest.json': packManifest('resource'),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await expect(buildPackage(packageDir)).rejects.toThrow(/header-name-specified/)
    expect(await listTree(path.join(packageDir, 'dist'))).toEqual([])
  })

  it('marks each module_name dependency of the completed manifests external', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': scriptedManifest({
        dependencies: [{ module_name: '@minecraft/server', version: '2.0.0' }],
      }),
      'packages/pack-1/behavior_pack/scripts/main.ts':
        "import { world } from '@minecraft/server'\nexport const w = world\n",
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir)

    const bundle = await readFile(path.join(packageDir, 'dist/behavior_pack/scripts/main.js'), 'utf8')
    expect(bundle).toMatch(/from ["']@minecraft\/server["']/)
  })

  it('fails an undeclared @minecraft/ import only where nothing importable resolves', async () => {
    const resolvable = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': scriptedManifest(),
      'packages/pack-1/behavior_pack/scripts/main.ts':
        "import { thing } from '@minecraft/vanilla-data'\nexport const t = thing\n",
      'node_modules/@minecraft/vanilla-data/package.json': { name: '@minecraft/vanilla-data', main: 'index.js' },
      'node_modules/@minecraft/vanilla-data/index.js': 'export const thing = 1\n',
    })
    await buildPackage(path.join(resolvable, 'packages/pack-1'))

    const bundle = await readFile(path.join(resolvable, 'packages/pack-1/dist/behavior_pack/scripts/main.js'), 'utf8')
    expect(bundle).not.toMatch(/from ["']@minecraft\/vanilla-data["']/)

    const missing = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': scriptedManifest(),
      'packages/pack-1/behavior_pack/scripts/main.ts':
        "import { gone } from '@minecraft/not-installed'\nexport const g = gone\n",
    })
    await expect(buildPackage(path.join(missing, 'packages/pack-1'))).rejects.toThrow(/@minecraft\/not-installed/)
  })

  it('writes the completed manifest as two-space JSON with a trailing newline', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir)

    const written = await readFile(path.join(packageDir, 'dist/behavior_pack/manifest.json'), 'utf8')
    expect(written.endsWith('\n')).toBe(true)
    expect(written.split('\n')[1]).toMatch(/^ {2}"/)
    expect(written).not.toBe(await readFile(path.join(packageDir, 'behavior_pack/manifest.json'), 'utf8'))
  })

  it('copies every other pack file verbatim, dotfiles and unknown extensions included', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/behavior_pack/functions/tick.mcfunction': 'say hi\n',
      'packages/pack-1/behavior_pack/textures/blocks/stone.png': 'not really a png',
      'packages/pack-1/behavior_pack/texts/en_US.lang': 'pack.name=Pack\n',
      'packages/pack-1/behavior_pack/.gitkeep': '',
      'packages/pack-1/behavior_pack/entities/thing.weird': 'contents\n',
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir)

    expect(await listTree(path.join(packageDir, 'dist/behavior_pack'))).toEqual([
      '.gitkeep',
      'entities/thing.weird',
      'functions/tick.mcfunction',
      'manifest.json',
      'texts/en_US.lang',
      'textures/blocks/stone.png',
    ])
    expect(await readFile(path.join(packageDir, 'dist/behavior_pack/entities/thing.weird'), 'utf8')).toBe('contents\n')
  })

  it('copies nothing under behavior_pack/scripts/', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': scriptedManifest(),
      'packages/pack-1/behavior_pack/scripts/main.ts': 'export const a = 1\n',
      'packages/pack-1/behavior_pack/scripts/helper.ts': 'export const b = 2\n',
      'packages/pack-1/behavior_pack/scripts/notes.txt': 'not a build output\n',
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir)

    expect(await listTree(path.join(packageDir, 'dist/behavior_pack/scripts'))).toEqual(['main.js'])
  })

  it('creates no output directory for an empty source directory', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')
    await mkdir(path.join(packageDir, 'behavior_pack/textures'), { recursive: true })

    await buildPackage(packageDir)

    expect(await listTree(path.join(packageDir, 'dist'))).toEqual(['behavior_pack/manifest.json'])
    await expect(stat(path.join(packageDir, 'dist/behavior_pack/textures'))).rejects.toThrow()
  })

  it('writes a file only where its bytes differ from what already sits there', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/behavior_pack/functions/tick.mcfunction': 'say hi\n',
    })
    const packageDir = path.join(workspace, 'packages/pack-1')
    const copied = path.join(packageDir, 'dist/behavior_pack/functions/tick.mcfunction')

    await buildPackage(packageDir)
    const first = (await stat(copied)).mtimeMs

    await buildPackage(packageDir)
    expect((await stat(copied)).mtimeMs).toBe(first)

    await writeFile(path.join(packageDir, 'behavior_pack/functions/tick.mcfunction'), 'say bye\n')
    await buildPackage(packageDir)
    expect(await readFile(copied, 'utf8')).toBe('say bye\n')
  })

  it('drops an unchanged chunk before the bundler writes it', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': scriptedManifest(),
      'packages/pack-1/behavior_pack/scripts/main.ts': 'export const a = 1\n',
    })
    const packageDir = path.join(workspace, 'packages/pack-1')
    const bundle = path.join(packageDir, 'dist/behavior_pack/scripts/main.js')

    await buildPackage(packageDir)
    const first = (await stat(bundle)).mtimeMs

    await buildPackage(packageDir)
    expect((await stat(bundle)).mtimeMs).toBe(first)

    await writeFile(path.join(packageDir, 'behavior_pack/scripts/main.ts'), 'export const a = 2\n')
    await buildPackage(packageDir)
    expect(await readFile(bundle, 'utf8')).toMatch(/a = 2/)
  })

  it('prunes output the build did not write, with no clean step first', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/behavior_pack/functions/keep.mcfunction': 'say keep\n',
      'packages/pack-1/dist/behavior_pack/functions/gone.mcfunction': 'say gone\n',
      'packages/pack-1/dist/behavior_pack/textures/old.png': 'stale',
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir)

    expect(await listTree(path.join(packageDir, 'dist'))).toEqual([
      'behavior_pack/functions/keep.mcfunction',
      'behavior_pack/manifest.json',
    ])
  })

  it('prunes a chunk no pack claims', async () => {
    const workspace = await workspaceWith({
      // sources on disk, but the manifest declares no script module
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/behavior_pack/scripts/main.ts': 'export const a = 1\n',
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir)

    expect(await listTree(path.join(packageDir, 'dist'))).toEqual(['behavior_pack/manifest.json'])
  })

  it('writes no report of which packs changed', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/resource_pack/manifest.json': packManifest('resource'),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir)

    expect(await listTree(path.join(packageDir, 'dist'))).toEqual([
      'behavior_pack/manifest.json',
      'resource_pack/manifest.json',
    ])
  })

  it('builds a resource-pack-only package, applying no script location check', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/resource_pack/manifest.json': packManifest('resource'),
      'packages/pack-1/resource_pack/textures/a.png': 'bytes',
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir)

    expect(await listTree(path.join(packageDir, 'dist'))).toEqual([
      'resource_pack/manifest.json',
      'resource_pack/textures/a.png',
    ])
  })

  it('fails at buildStart when the virtual entry was configured over sources on disk', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': scriptedManifest(),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    // the configuration is read while the sources are absent, as a watch run's is
    const fragment = packBuild({ packageDir })
    expect(fragment.entry).toEqual(['mc-dev-kit:pack-entry'])

    await mkdir(path.join(packageDir, 'behavior_pack/scripts'), { recursive: true })
    await writeFile(path.join(packageDir, 'behavior_pack/scripts/main.ts'), 'export const a = 1\n')

    await expect(build({ ...fragment, config: false, logLevel: 'silent' })).rejects.toThrow(/configured with no entry/)
  })

  it('fails when a declared script module has no sources', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': scriptedManifest(),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await expect(buildPackage(packageDir)).rejects.toThrow(/declares a script module but/)
  })

  it('registers the pack source directories, source manifests, package.json, and each depended-on package.json as watch inputs', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior', {
        dependencies: [{ uuid: '55555555-5555-5555-5555-555555555555' }],
      }),
      'packages/pack-1/resource_pack/manifest.json': packManifest('resource'),
      'packages/library/package.json': { name: '@scope/library', version: '4.5.6' },
      'packages/library/behavior_pack/manifest.json': packManifest('behavior', {
        header: { description: 'library', uuid: '55555555-5555-5555-5555-555555555555' },
      }),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    const watched = await collectWatchFiles(packBuildPlugin({ packageDir, virtualEntry: true }))

    expect(watched.sort()).toEqual(
      [
        path.join(packageDir, 'behavior_pack'),
        path.join(packageDir, 'behavior_pack/manifest.json'),
        path.join(packageDir, 'package.json'),
        path.join(packageDir, 'resource_pack'),
        path.join(packageDir, 'resource_pack/manifest.json'),
        path.join(workspace, 'packages/library/package.json'),
      ].sort(),
    )
  })
})

/** Runs a plugin's `buildStart` against a context that records what it asked to be watched. */
async function collectWatchFiles(plugin: BuildPlugin): Promise<string[]> {
  const watched: string[] = []
  const context = { addWatchFile: (id: string) => watched.push(id) }
  const buildStart = plugin.buildStart as unknown as (this: typeof context, options: unknown) => Promise<void>

  await buildStart.call(context, {})
  return watched
}
