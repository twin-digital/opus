import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import AdmZip from 'adm-zip'
import { build } from 'tsdown'
import { describe, expect, it } from 'vitest'
import { buildPackage, listTree, packManifest, writeWorkspace, type FixtureFile } from '../../test/fixture.js'
import { packBuild } from '../build.js'
import { archivePackage } from './archive.js'
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

// increment 011: namespacing and vendoring. The package name is @scope/pack-1, so `true` resolves
// the namespace to scope-pack-1; the package's own asset names carry that namespace as their
// token, and a vendored asset's names carry its library's token plus a 16-hex content hash.
const NS = 'scope-pack-1'

/** A behavior entity definition declaring `identifier`, plus whatever the case overrides. */
function behaviorEntity(identifier: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format_version: '1.16.0',
    'minecraft:entity': { description: { identifier }, components: {}, ...overrides },
  }
}

/** A client entity definition declaring `identifier`, plus whatever description the case adds. */
function clientEntity(identifier: string, description: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format_version: '1.10.0',
    'minecraft:client_entity': { description: { identifier, ...description } },
  }
}

/** A parsed JSON file of the built output tree. */
async function builtJson(packageDir: string, relative: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(packageDir, 'dist', relative), 'utf8')) as Record<string, unknown>
}

/** A vendored library package: `@scope/<basename>` holding one behavior entity, unbuilt. */
function vendoredLibrary(
  basename: string,
  entity: string,
  packageJson: Record<string, unknown> = {},
): Record<string, FixtureFile> {
  return {
    [`packages/${basename}/package.json`]: { name: `@scope/${basename}`, version: '1.0.0', ...packageJson },
    [`packages/${basename}/vendored_pack/behavior_pack/entities/${entity}.json`]: behaviorEntity(entity),
  }
}

describe('the namespace setting', () => {
  it('fails the build naming the dependency when the package vendors anything and no namespace is set', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/package.json': {
        name: '@scope/pack-1',
        version: '1.2.3',
        dependencies: { '@scope/lib': 'workspace:*' },
      },
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      ...vendoredLibrary('lib', 'minion'),
    })

    await expect(buildPackage(path.join(workspace, 'packages/pack-1'))).rejects.toThrow(/@scope\/lib/)
  })

  it('leaves every name as the source spells it when no namespace is set and nothing is vendored', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/behavior_pack/entities/wizard.json': behaviorEntity('wizard'),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir)

    expect(await readFile(path.join(packageDir, 'dist/behavior_pack/entities/wizard.json'), 'utf8')).toBe(
      await readFile(path.join(packageDir, 'behavior_pack/entities/wizard.json'), 'utf8'),
    )
  })

  it('writes the namespace into a bare entity identifier, in the behavior and client halves alike', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/resource_pack/manifest.json': packManifest('resource'),
      'packages/pack-1/behavior_pack/entities/wizard.json': behaviorEntity('wizard'),
      'packages/pack-1/resource_pack/entity/wizard.json': clientEntity('wizard'),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    const behavior = await builtJson(packageDir, 'behavior_pack/entities/wizard.json')
    const client = await builtJson(packageDir, 'resource_pack/entity/wizard.json')
    expect(behavior['minecraft:entity']).toMatchObject({ description: { identifier: `${NS}:wizard` } })
    expect(client['minecraft:client_entity']).toMatchObject({ description: { identifier: `${NS}:wizard` } })
  })

  it('fails the build naming the file and the name when a source name already carries a prefix', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/behavior_pack/entities/wizard.json': behaviorEntity('other:wizard'),
    })

    const build = buildPackage(path.join(workspace, 'packages/pack-1'), { namespace: true })
    await expect(build).rejects.toThrow(/entities\/wizard\.json.*other:wizard/s)
  })

  it('does not rewrite script sources', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': scriptedManifest(),
      'packages/pack-1/behavior_pack/entities/wizard.json': behaviorEntity('wizard'),
      'packages/pack-1/behavior_pack/scripts/main.ts': "export const bare = 'wizard'\n",
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    const bundle = await readFile(path.join(packageDir, 'dist/behavior_pack/scripts/main.js'), 'utf8')
    expect(bundle).toContain('"wizard"')
    expect(bundle).not.toContain(`${NS}:wizard`)
  })
})

describe('what is rewritten', () => {
  it('rewrites a declared name and every reference to it, so the two halves still join', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/resource_pack/manifest.json': packManifest('resource'),
      'packages/pack-1/behavior_pack/entities/wizard.json': behaviorEntity('wizard'),
      'packages/pack-1/resource_pack/entity/wizard.json': clientEntity('wizard', {
        geometry: { default: 'geometry.wizard' },
      }),
      'packages/pack-1/resource_pack/models/wizard.geo.json': {
        format_version: '1.12.0',
        'minecraft:geometry': [{ description: { identifier: 'geometry.wizard' } }],
      },
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    const behavior = await builtJson(packageDir, 'behavior_pack/entities/wizard.json')
    const client = await builtJson(packageDir, 'resource_pack/entity/wizard.json')
    const geometry = await builtJson(packageDir, 'resource_pack/models/wizard.geo.json')

    // the halves join on one namespaced identifier, and the geometry reference follows its declaration
    expect(behavior['minecraft:entity']).toMatchObject({ description: { identifier: `${NS}:wizard` } })
    expect(client['minecraft:client_entity']).toMatchObject({
      description: { identifier: `${NS}:wizard`, geometry: { default: `geometry.${NS}.wizard` } },
    })
    expect(geometry['minecraft:geometry']).toMatchObject([{ description: { identifier: `geometry.${NS}.wizard` } }])
  })

  it('copies a reference to a name the package declares nowhere — vanilla geometry, say — as written', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/resource_pack/manifest.json': packManifest('resource'),
      'packages/pack-1/behavior_pack/entities/wizard.json': behaviorEntity('wizard'),
      'packages/pack-1/resource_pack/entity/wizard.json': clientEntity('wizard', {
        geometry: { default: 'geometry.evoker.v1.8' },
        textures: { default: 'textures/entity/evocation_illager' },
        materials: { default: 'entity_alphatest' },
      }),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    const client = await builtJson(packageDir, 'resource_pack/entity/wizard.json')
    expect(client['minecraft:client_entity']).toMatchObject({
      description: {
        geometry: { default: 'geometry.evoker.v1.8' },
        textures: { default: 'textures/entity/evocation_illager' },
        materials: { default: 'entity_alphatest' },
      },
    })
  })

  it('gives entity identifiers and their localization keys the namespace', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/resource_pack/manifest.json': packManifest('resource'),
      'packages/pack-1/behavior_pack/entities/wizard.json': behaviorEntity('wizard'),
      'packages/pack-1/resource_pack/texts/en_US.lang':
        'pack.name=My Pack\nentity.wizard.name=The Wizard\nitem.spawn_egg.entity.wizard.name=Wizard Egg\n',
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    const lang = await readFile(path.join(packageDir, 'dist/resource_pack/texts/en_US.lang'), 'utf8')
    expect(lang).toContain('pack.name=My Pack')
    expect(lang).toContain(`entity.${NS}:wizard.name=The Wizard`)
    expect(lang).toContain(`item.spawn_egg.entity.${NS}:wizard.name=Wizard Egg`)
    expect(lang).not.toContain('entity.wizard.name')
  })

  it('gives own geometry, textures, materials, render controllers and animations the pack namespace as their token', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/resource_pack/manifest.json': packManifest('resource'),
      'packages/pack-1/behavior_pack/entities/wizard.json': behaviorEntity('wizard'),
      'packages/pack-1/resource_pack/entity/wizard.json': clientEntity('wizard', {
        geometry: { default: 'geometry.wizard' },
        textures: { default: 'textures/entity/wizard' },
        materials: { default: 'wizard' },
        animations: { idle: 'animation.wizard.idle' },
        render_controllers: ['controller.render.wizard'],
      }),
      'packages/pack-1/resource_pack/models/wizard.geo.json': {
        'minecraft:geometry': [{ description: { identifier: 'geometry.wizard' } }],
      },
      'packages/pack-1/resource_pack/textures/entity/wizard.png': 'png bytes',
      'packages/pack-1/resource_pack/materials/wizard.material': {
        materials: { version: '1.0.0', 'wizard:entity_alphatest': {} },
      },
      'packages/pack-1/resource_pack/render_controllers/wizard.json': {
        render_controllers: { 'controller.render.wizard': {} },
      },
      'packages/pack-1/resource_pack/animations/wizard.json': {
        animations: { 'animation.wizard.idle': {} },
      },
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    const client = await builtJson(packageDir, 'resource_pack/entity/wizard.json')
    expect(client['minecraft:client_entity']).toMatchObject({
      description: {
        geometry: { default: `geometry.${NS}.wizard` },
        textures: { default: `textures/${NS}/entity/wizard` },
        materials: { default: `${NS}_wizard` },
        animations: { idle: `animation.${NS}.wizard.idle` },
        render_controllers: [`controller.render.${NS}.wizard`],
      },
    })

    const material = await builtJson(packageDir, 'resource_pack/materials/wizard.material')
    expect(material.materials).toMatchObject({ [`${NS}_wizard:entity_alphatest`]: {} })

    const controllers = await builtJson(packageDir, 'resource_pack/render_controllers/wizard.json')
    expect(controllers.render_controllers).toMatchObject({ [`controller.render.${NS}.wizard`]: {} })

    const animations = await builtJson(packageDir, 'resource_pack/animations/wizard.json')
    expect(animations.animations).toMatchObject({ [`animation.${NS}.wizard.idle`]: {} })

    const tree = await listTree(path.join(packageDir, 'dist/resource_pack/textures'))
    expect(tree).toEqual([`${NS}/entity/wizard.png`])
  })

  it('fails the build naming what it found when content declares a name it cannot rewrite', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/behavior_pack/entities/wizard.json': behaviorEntity('wizard'),
      'packages/pack-1/behavior_pack/functions/tick.mcfunction': 'say hi\n',
    })

    const build = buildPackage(path.join(workspace, 'packages/pack-1'), { namespace: true })
    await expect(build).rejects.toThrow(/functions\/tick\.mcfunction/)
  })
})

describe('vendoring', () => {
  /** A workspace whose pack-1 vendors @scope/lib, which holds both halves of a minion. */
  async function vendoringWorkspace(files: Record<string, FixtureFile> = {}): Promise<string> {
    return workspaceWith({
      'packages/pack-1/package.json': {
        name: '@scope/pack-1',
        version: '1.2.3',
        dependencies: { '@scope/lib': 'workspace:*' },
      },
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/resource_pack/manifest.json': packManifest('resource'),
      'packages/lib/package.json': { name: '@scope/lib', version: '1.0.0' },
      'packages/lib/vendored_pack/behavior_pack/entities/minion.json': behaviorEntity('minion'),
      'packages/lib/vendored_pack/resource_pack/entity/minion.json': clientEntity('minion'),
      ...files,
    })
  }

  it('merges a dependency’s vendored_pack into this package’s own packs, under its namespace and uuid', async () => {
    const workspace = await vendoringWorkspace()
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    const behavior = await builtJson(packageDir, 'behavior_pack/entities/scope-lib.minion.json')
    const client = await builtJson(packageDir, 'resource_pack/entity/scope-lib.minion.json')
    // the default prefix is the dependency's unscoped npm name: @scope/lib vendors as lib.*
    expect(behavior['minecraft:entity']).toMatchObject({ description: { identifier: `${NS}:lib.minion` } })
    expect(client['minecraft:client_entity']).toMatchObject({ description: { identifier: `${NS}:lib.minion` } })

    // the merged output carries the vendoring package's own identity, not the library's
    const manifest = await builtJson(packageDir, 'behavior_pack/manifest.json')
    expect(manifest.header).toMatchObject({ uuid: '11111111-1111-1111-1111-111111111111' })
  })

  it('builds one behavior pack and one resource pack whatever the package vendors', async () => {
    const workspace = await vendoringWorkspace()
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    const roots = new Set((await listTree(path.join(packageDir, 'dist'))).map((file) => file.split('/')[0]))
    expect([...roots].sort()).toEqual(['behavior_pack', 'resource_pack'])
  })

  it('fails naming the manifest to add when the package holds no source manifest of a vendored kind', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/package.json': {
        name: '@scope/pack-1',
        version: '1.2.3',
        dependencies: { '@scope/lib': 'workspace:*' },
      },
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/lib/package.json': { name: '@scope/lib', version: '1.0.0' },
      'packages/lib/vendored_pack/resource_pack/entity/minion.json': clientEntity('minion'),
    })

    const build = buildPackage(path.join(workspace, 'packages/pack-1'), { namespace: true })
    await expect(build).rejects.toThrow(/resource_pack\/manifest\.json/)
  })

  it('reads the vendored source tree without the depended-on package having been built', async () => {
    const workspace = await vendoringWorkspace()
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    expect(await listTree(path.join(workspace, 'packages/lib/dist'))).toEqual([])
    expect(await listTree(path.join(packageDir, 'dist/behavior_pack/entities'))).toContain('scope-lib.minion.json')
  })

  it('merges own dependencies only — no devDependency, and no transitive supplier nothing admitted', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/package.json': {
        name: '@scope/pack-1',
        version: '1.2.3',
        dependencies: { '@scope/lib-a': 'workspace:*' },
        devDependencies: { '@scope/lib-c': 'workspace:*' },
      },
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      ...vendoredLibrary('lib-a', 'soldier', { dependencies: { '@scope/lib-b': 'workspace:*' } }),
      ...vendoredLibrary('lib-b', 'archer'),
      ...vendoredLibrary('lib-c', 'spy'),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    const entities = await listTree(path.join(packageDir, 'dist/behavior_pack/entities'))
    expect(entities).toContain('scope-lib-a.soldier.json')
    expect(entities.join(' ')).not.toContain('archer')
    expect(entities.join(' ')).not.toContain('spy')
  })

  it('admits a transitive supplier through the vendor block, without a direct dependency', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/package.json': {
        name: '@scope/pack-1',
        version: '1.2.3',
        dependencies: { '@scope/lib-a': 'workspace:*' },
      },
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      ...vendoredLibrary('lib-a', 'soldier', { dependencies: { '@scope/lib-b': 'workspace:*' } }),
      ...vendoredLibrary('lib-b', 'archer'),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true, vendor: { '@scope/lib-b': {} } })

    const archer = await builtJson(packageDir, 'behavior_pack/entities/scope-lib-b.archer.json')
    expect(archer['minecraft:entity']).toMatchObject({ description: { identifier: `${NS}:lib-b.archer` } })
  })

  it('merges a diamond once — one package, one cell, however many paths reach it', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/package.json': {
        name: '@scope/pack-1',
        version: '1.2.3',
        dependencies: { '@scope/lib-a': 'workspace:*', '@scope/lib-b': 'workspace:*' },
      },
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      ...vendoredLibrary('lib-a', 'soldier', { dependencies: { '@scope/lib-c': 'workspace:*' } }),
      ...vendoredLibrary('lib-b', 'archer', { dependencies: { '@scope/lib-c': 'workspace:*' } }),
      ...vendoredLibrary('lib-c', 'spark'),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true, vendor: { '@scope/lib-c': {} } })

    const entities = await listTree(path.join(packageDir, 'dist/behavior_pack/entities'))
    expect(entities.filter((file) => file.includes('spark'))).toEqual(['scope-lib-c.spark.json'])
    const spark = await builtJson(packageDir, 'behavior_pack/entities/scope-lib-c.spark.json')
    expect(spark['minecraft:entity']).toMatchObject({ description: { identifier: `${NS}:lib-c.spark` } })
  })

  it('reads a vendored_pack from an installed dependency exactly as from a workspace sibling', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/package.json': {
        name: '@scope/pack-1',
        version: '1.2.3',
        dependencies: { '@scope/installed-lib': '^1.0.0' },
      },
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'node_modules/@scope/installed-lib/package.json': { name: '@scope/installed-lib', version: '1.0.0' },
      'node_modules/@scope/installed-lib/vendored_pack/behavior_pack/entities/minion.json': behaviorEntity('minion'),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    const merged = await builtJson(packageDir, 'behavior_pack/entities/scope-installed-lib.minion.json')
    expect(merged['minecraft:entity']).toMatchObject({ description: { identifier: `${NS}:installed-lib.minion` } })
  })

  it('fails naming the file when a vendored pack holds a content kind outside the allowed set', async () => {
    const workspace = await vendoringWorkspace({
      'packages/lib/vendored_pack/behavior_pack/functions/tick.mcfunction': 'say hi\n',
    })

    const build = buildPackage(path.join(workspace, 'packages/pack-1'), { namespace: true })
    await expect(build).rejects.toThrow(/lib\/vendored_pack\/behavior_pack\/functions\/tick\.mcfunction/)
  })

  it('gives own and vendored declarations of one bare entity name distinct composed ids', async () => {
    const workspace = await vendoringWorkspace({
      'packages/pack-1/behavior_pack/entities/minion.json': behaviorEntity('minion'),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    const own = await builtJson(packageDir, 'behavior_pack/entities/minion.json')
    const vendored = await builtJson(packageDir, 'behavior_pack/entities/scope-lib.minion.json')
    expect(own['minecraft:entity']).toMatchObject({ description: { identifier: `${NS}:minion` } })
    expect(vendored['minecraft:entity']).toMatchObject({ description: { identifier: `${NS}:lib.minion` } })
  })

  it('fails the build naming both dependencies when two merged packs resolve to one prefix', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/package.json': {
        name: '@scope/pack-1',
        version: '1.2.3',
        dependencies: { '@one/lib': 'workspace:*', '@two/lib': 'workspace:*' },
      },
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/one-lib/package.json': { name: '@one/lib', version: '1.0.0' },
      'packages/one-lib/vendored_pack/behavior_pack/entities/one.json': behaviorEntity('one'),
      'packages/two-lib/package.json': { name: '@two/lib', version: '1.0.0' },
      'packages/two-lib/vendored_pack/behavior_pack/entities/two.json': behaviorEntity('two'),
    })

    const build = buildPackage(path.join(workspace, 'packages/pack-1'), { namespace: true })
    await expect(build).rejects.toThrow(/@one\/lib.*@two\/lib.*"lib".*vendor block/s)
  })

  it('fails the build naming the character when a prefix steps outside its charset', async () => {
    const dotted = await vendoringWorkspace()
    await expect(
      buildPackage(path.join(dotted, 'packages/pack-1'), {
        namespace: true,
        vendor: { '@scope/lib': { prefix: 'f.x' } },
      }),
    ).rejects.toThrow(/"\."/)

    const cased = await vendoringWorkspace()
    await expect(
      buildPackage(path.join(cased, 'packages/pack-1'), {
        namespace: true,
        vendor: { '@scope/lib': { prefix: 'Fx' } },
      }),
    ).rejects.toThrow(/"F"/)
  })

  it('takes an explicit prefix from the vendor block', async () => {
    const workspace = await vendoringWorkspace()
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true, vendor: { '@scope/lib': { prefix: 'fx' } } })

    const vendored = await builtJson(packageDir, 'behavior_pack/entities/scope-lib.minion.json')
    expect(vendored['minecraft:entity']).toMatchObject({ description: { identifier: `${NS}:fx.minion` } })
  })

  it('fails a dotted bare entity declaration, naming the file and the name', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/behavior_pack/entities/wizard.json': behaviorEntity('wiz.ard'),
    })

    const build = buildPackage(path.join(workspace, 'packages/pack-1'), { namespace: true })
    await expect(build).rejects.toThrow(/entities\/wizard\.json.*wiz\.ard/s)
  })

  it('rewrites the consumer’s composed reference — prefix.name — to the vendored entity\u2019s id', async () => {
    const workspace = await vendoringWorkspace({
      'packages/pack-1/behavior_pack/entities/wizard.json': behaviorEntity('wizard'),
      'packages/pack-1/resource_pack/entity/skin.json': clientEntity('lib.minion'),
      'packages/pack-1/resource_pack/texts/en_US.lang': 'entity.lib.minion.name=The Minion\n',
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    const skin = await builtJson(packageDir, 'resource_pack/entity/skin.json')
    expect(skin['minecraft:client_entity']).toMatchObject({ description: { identifier: `${NS}:lib.minion` } })
    const lang = await readFile(path.join(packageDir, 'dist/resource_pack/texts/en_US.lang'), 'utf8')
    expect(lang).toContain(`entity.${NS}:lib.minion.name=The Minion`)
  })

  it('fails a dangling reference, naming the un-merged supplier and the fix', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/package.json': {
        name: '@scope/pack-1',
        version: '1.2.3',
        dependencies: { '@scope/lib-a': 'workspace:*' },
      },
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/resource_pack/manifest.json': packManifest('resource'),
      'packages/lib-a/package.json': {
        name: '@scope/lib-a',
        version: '1.0.0',
        dependencies: { '@scope/lib-b': 'workspace:*' },
      },
      'packages/lib-a/vendored_pack/behavior_pack/entities/soldier.json': behaviorEntity('soldier'),
      'packages/lib-a/vendored_pack/resource_pack/entity/soldier.json': clientEntity('soldier', {
        geometry: { default: 'geometry.core_shape' },
      }),
      'packages/lib-b/package.json': { name: '@scope/lib-b', version: '1.0.0' },
      'packages/lib-b/vendored_pack/resource_pack/models/core.geo.json': {
        'minecraft:geometry': [{ description: { identifier: 'geometry.core_shape' } }],
      },
    })

    const build = buildPackage(path.join(workspace, 'packages/pack-1'), { namespace: true })
    await expect(build).rejects.toThrow(
      /soldier\.json.*geometry\.core_shape.*@scope\/lib-b.*add @scope\/lib-b to dependencies or the vendor block/s,
    )
  })

  it('names a vendored asset by its library token and content hash, deterministically across rebuilds', async () => {
    const workspace = await vendoringWorkspace({
      'packages/pack-1/behavior_pack/entities/wizard.json': behaviorEntity('wizard'),
      'packages/lib/vendored_pack/resource_pack/entity/minion.json': clientEntity('minion', {
        geometry: { default: 'geometry.minion' },
      }),
      'packages/lib/vendored_pack/resource_pack/models/minion.geo.json': {
        'minecraft:geometry': [{ description: { identifier: 'geometry.minion' } }],
      },
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    const client = await builtJson(packageDir, 'resource_pack/entity/scope-lib.minion.json')
    const description = (client['minecraft:client_entity'] as { description: { geometry: { default: string } } })
      .description
    const reference = description.geometry.default
    expect(reference).toMatch(/^geometry\.scope-lib-[0-9a-f]{16}\.minion$/)

    // the declaration carries the same final name, so the reference still lands
    const geometry = await builtJson(packageDir, 'resource_pack/models/scope-lib.minion.geo.json')
    expect(geometry['minecraft:geometry']).toMatchObject([{ description: { identifier: reference } }])

    // rebuilding produces the identical name: the hash reads content, nothing run-specific
    await buildPackage(packageDir, { namespace: true })
    const again = await builtJson(packageDir, 'resource_pack/entity/scope-lib.minion.json')
    expect(again).toEqual(client)
  })

  it('lets two vendorings declare one bare asset name, each built under its own token', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/package.json': {
        name: '@scope/pack-1',
        version: '1.2.3',
        dependencies: { '@scope/lib-a': 'workspace:*', '@scope/lib-b': 'workspace:*' },
      },
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/resource_pack/manifest.json': packManifest('resource'),
      'packages/lib-a/package.json': { name: '@scope/lib-a', version: '1.0.0' },
      'packages/lib-a/vendored_pack/behavior_pack/entities/soldier.json': behaviorEntity('soldier'),
      'packages/lib-a/vendored_pack/resource_pack/entity/soldier.json': clientEntity('soldier', {
        geometry: { default: 'geometry.minion' },
      }),
      'packages/lib-a/vendored_pack/resource_pack/models/minion.geo.json': {
        'minecraft:geometry': [{ description: { identifier: 'geometry.minion' }, bones: ['a'] }],
      },
      'packages/lib-b/package.json': { name: '@scope/lib-b', version: '1.0.0' },
      'packages/lib-b/vendored_pack/behavior_pack/entities/archer.json': behaviorEntity('archer'),
      'packages/lib-b/vendored_pack/resource_pack/entity/archer.json': clientEntity('archer', {
        geometry: { default: 'geometry.minion' },
      }),
      'packages/lib-b/vendored_pack/resource_pack/models/minion.geo.json': {
        'minecraft:geometry': [{ description: { identifier: 'geometry.minion' }, bones: ['b'] }],
      },
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    // each vendored reference resolved within its own source, under its own token and hash
    const soldier = await builtJson(packageDir, 'resource_pack/entity/scope-lib-a.soldier.json')
    const archer = await builtJson(packageDir, 'resource_pack/entity/scope-lib-b.archer.json')
    const soldierGeometry = (soldier['minecraft:client_entity'] as { description: { geometry: { default: string } } })
      .description.geometry.default
    const archerGeometry = (archer['minecraft:client_entity'] as { description: { geometry: { default: string } } })
      .description.geometry.default
    expect(soldierGeometry).toMatch(/^geometry\.scope-lib-a-[0-9a-f]{16}\.minion$/)
    expect(archerGeometry).toMatch(/^geometry\.scope-lib-b-[0-9a-f]{16}\.minion$/)
    expect(soldierGeometry).not.toBe(archerGeometry)
  })

  it('fails an own reference to a bare asset name that only several vendorings declare, naming every candidate', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/package.json': {
        name: '@scope/pack-1',
        version: '1.2.3',
        dependencies: { '@scope/lib-a': 'workspace:*', '@scope/lib-b': 'workspace:*' },
      },
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/resource_pack/manifest.json': packManifest('resource'),
      'packages/pack-1/behavior_pack/entities/wizard.json': behaviorEntity('wizard'),
      'packages/pack-1/resource_pack/entity/wizard.json': clientEntity('wizard', {
        geometry: { default: 'geometry.minion' },
      }),
      'packages/lib-a/package.json': { name: '@scope/lib-a', version: '1.0.0' },
      'packages/lib-a/vendored_pack/resource_pack/models/minion.geo.json': {
        'minecraft:geometry': [{ description: { identifier: 'geometry.minion' }, bones: ['a'] }],
      },
      'packages/lib-b/package.json': { name: '@scope/lib-b', version: '1.0.0' },
      'packages/lib-b/vendored_pack/resource_pack/models/minion.geo.json': {
        'minecraft:geometry': [{ description: { identifier: 'geometry.minion' }, bones: ['b'] }],
      },
    })

    const build = buildPackage(path.join(workspace, 'packages/pack-1'), { namespace: true })
    await expect(build).rejects.toThrow(
      /geometry\.minion.*ambiguous.*lib-a\/vendored_pack\/resource_pack\/models\/minion\.geo\.json.*lib-b\/vendored_pack\/resource_pack\/models\/minion\.geo\.json/s,
    )
  })

  it('resolves an own reference to a name both own and vendored content declare to the own declaration', async () => {
    const workspace = await vendoringWorkspace({
      'packages/pack-1/behavior_pack/entities/wizard.json': behaviorEntity('wizard'),
      'packages/pack-1/resource_pack/entity/wizard.json': clientEntity('wizard', {
        geometry: { default: 'geometry.minion' },
      }),
      'packages/pack-1/resource_pack/models/minion.geo.json': {
        'minecraft:geometry': [{ description: { identifier: 'geometry.minion' }, bones: ['own'] }],
      },
      'packages/lib/vendored_pack/resource_pack/entity/minion.json': clientEntity('minion', {
        geometry: { default: 'geometry.minion' },
      }),
      'packages/lib/vendored_pack/resource_pack/models/minion.geo.json': {
        'minecraft:geometry': [{ description: { identifier: 'geometry.minion' }, bones: ['lib'] }],
      },
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    const own = await builtJson(packageDir, 'resource_pack/entity/wizard.json')
    const vendored = await builtJson(packageDir, 'resource_pack/entity/scope-lib.minion.json')
    expect(own['minecraft:client_entity']).toMatchObject({
      description: { geometry: { default: `geometry.${NS}.minion` } },
    })
    expect(vendored['minecraft:client_entity']).toMatchObject({
      description: {
        geometry: { default: expect.stringMatching(/^geometry\.scope-lib-[0-9a-f]{16}\.minion$/) as string },
      },
    })
  })

  it('folds a vendored material parent’s final name into the hash, so a parent edit renames the child', async () => {
    const files = (baseContents: Record<string, unknown>): Record<string, FixtureFile> => ({
      'packages/pack-1/behavior_pack/entities/wizard.json': behaviorEntity('wizard'),
      'packages/lib/vendored_pack/resource_pack/materials/base.material': {
        materials: { version: '1.0.0', minionbase: baseContents },
      },
      'packages/lib/vendored_pack/resource_pack/materials/skin.material': {
        materials: { version: '1.0.0', 'minionskin:minionbase': {} },
      },
    })

    const materialNames = async (packageDir: string): Promise<{ base: string; skin: string; parent: string }> => {
      const base = await builtJson(packageDir, 'resource_pack/materials/scope-lib.base.material')
      const skin = await builtJson(packageDir, 'resource_pack/materials/scope-lib.skin.material')
      const baseName = Object.keys(base.materials as Record<string, unknown>).find((key) => key !== 'version') as string
      const skinKey = Object.keys(skin.materials as Record<string, unknown>).find((key) => key !== 'version') as string
      const [skinName, parent] = skinKey.split(':')
      return { base: baseName, skin: skinName, parent }
    }

    const first = await vendoringWorkspace(files({}))
    const firstDir = path.join(first, 'packages/pack-1')
    await buildPackage(firstDir, { namespace: true })
    const before = await materialNames(firstDir)

    // the child's parent reference is the parent's final name
    expect(before.parent).toBe(before.base)
    expect(before.base).toMatch(/^scope-lib-[0-9a-f]{16}_minionbase$/)
    expect(before.skin).toMatch(/^scope-lib-[0-9a-f]{16}_minionskin$/)

    // editing the parent's bytes renames the parent — and the child, whose hash folds the parent's name
    const second = await vendoringWorkspace(files({ '+defines': 'EDITED' }))
    const secondDir = path.join(second, 'packages/pack-1')
    await buildPackage(secondDir, { namespace: true })
    const after = await materialNames(secondDir)

    expect(after.parent).toBe(after.base)
    expect(after.base).not.toBe(before.base)
    expect(after.skin).not.toBe(before.skin)
  })

  it('gives the same vendored pack a different spelling and identity in each package vendoring it', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/package.json': {
        name: '@scope/pack-1',
        version: '1.2.3',
        dependencies: { '@scope/lib': 'workspace:*' },
      },
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-2/package.json': {
        name: '@scope/pack-2',
        version: '2.0.0',
        dependencies: { '@scope/lib': 'workspace:*' },
      },
      'packages/pack-2/behavior_pack/manifest.json': packManifest('behavior', {
        header: { description: 'another pack', uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
      }),
      'packages/lib/package.json': { name: '@scope/lib', version: '1.0.0' },
      'packages/lib/vendored_pack/behavior_pack/entities/minion.json': behaviorEntity('minion'),
    })
    const first = path.join(workspace, 'packages/pack-1')
    const second = path.join(workspace, 'packages/pack-2')

    await buildPackage(first, { namespace: true })
    await buildPackage(second, { namespace: true })

    const inFirst = await builtJson(first, 'behavior_pack/entities/scope-lib.minion.json')
    const inSecond = await builtJson(second, 'behavior_pack/entities/scope-lib.minion.json')
    expect(inFirst['minecraft:entity']).toMatchObject({ description: { identifier: 'scope-pack-1:lib.minion' } })
    expect(inSecond['minecraft:entity']).toMatchObject({ description: { identifier: 'scope-pack-2:lib.minion' } })

    const firstManifest = await builtJson(first, 'behavior_pack/manifest.json')
    const secondManifest = await builtJson(second, 'behavior_pack/manifest.json')
    expect(firstManifest.header).toMatchObject({ uuid: '11111111-1111-1111-1111-111111111111' })
    expect(secondManifest.header).toMatchObject({ uuid: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })
  })

  it('composes a file more than one merged pack contributes entries to — texts/en_US.lang, say', async () => {
    const workspace = await vendoringWorkspace({
      'packages/pack-1/behavior_pack/entities/wizard.json': behaviorEntity('wizard'),
      'packages/pack-1/resource_pack/texts/en_US.lang': 'pack.name=My Pack\nentity.wizard.name=The Wizard\n',
      'packages/lib/vendored_pack/resource_pack/texts/en_US.lang': 'entity.minion.name=The Minion\n',
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    const lang = await readFile(path.join(packageDir, 'dist/resource_pack/texts/en_US.lang'), 'utf8')
    expect(lang).toContain('pack.name=My Pack')
    expect(lang).toContain(`entity.${NS}:wizard.name=The Wizard`)
    expect(lang).toContain(`entity.${NS}:lib.minion.name=The Minion`)
  })

  it('registers each vendored dependency’s vendored_pack tree as a watch input', async () => {
    const workspace = await vendoringWorkspace()
    const packageDir = path.join(workspace, 'packages/pack-1')

    const watched = await collectWatchFiles(packBuildPlugin({ namespace: true, packageDir, virtualEntry: true }))

    expect(watched).toContain(await realpath(path.join(workspace, 'packages/lib/vendored_pack')))
  })

  it('archives the vendored content inside the vendoring package’s own mcaddon', async () => {
    const workspace = await vendoringWorkspace()
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })
    const archive = await archivePackage(packageDir)

    const addon = new AdmZip(await readFile(archive))
    const behaviorMember = addon.getEntry('behavior_pack.mcpack')?.getData()
    expect(behaviorMember).toBeDefined()
    const behaviorEntries = new AdmZip(behaviorMember as Buffer).getEntries().map((entry) => entry.entryName)
    expect(behaviorEntries).toContain('entities/scope-lib.minion.json')
    expect(behaviorEntries).toContain('manifest.json')
  })
})

describe('what the build puts in the bundle and the manifest-adjacent content', () => {
  it('injects the namespace into the bundle as a constant the runtime helper reads', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/package.json': { name: '@scope/pack-1', version: '1.2.3', type: 'module' },
      'packages/pack-1/behavior_pack/manifest.json': scriptedManifest(),
      'packages/pack-1/behavior_pack/scripts/main.ts':
        "import { packId } from 'fake-runtime'\nexport const id = packId('wizard')\n",
      'node_modules/fake-runtime/package.json': {
        name: 'fake-runtime',
        version: '1.0.0',
        type: 'module',
        main: 'index.js',
      },
      // reads the injection lazily at call time, exactly as @twin-digital/mc-pack-runtime does
      'node_modules/fake-runtime/index.js':
        'export const packId = (name) => `${globalThis.__MC_PACK_RUNTIME__.namespace}:${name}`\n',
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: 'wizards' })

    const bundlePath = path.join(packageDir, 'dist/behavior_pack/scripts/main.js')
    const bundle = await readFile(bundlePath, 'utf8')
    expect(bundle.startsWith('globalThis.__MC_PACK_RUNTIME__ = Object.freeze(')).toBe(true)

    // the inlined library's own call resolves through the injected namespace, nothing passed per call
    const loaded = (await import(pathToFileURL(bundlePath).href)) as { id: string }
    expect(loaded.id).toBe('wizards:wizard')
    const injected = (globalThis as Record<string, unknown>).__MC_PACK_RUNTIME__ as Record<string, unknown>
    expect(injected).toMatchObject({ namespace: 'wizards', packToken: 'scope-pack-1', prefixes: [] })
    expect(Object.isFrozen(injected)).toBe(true)
    expect(Object.isFrozen(injected.prefixes)).toBe(true)
    Reflect.deleteProperty(globalThis, '__MC_PACK_RUNTIME__')
  })

  it('binds a vendored library’s runtime import to its prefix, so computed packId names land in its cell', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/package.json': {
        name: '@scope/pack-1',
        version: '1.2.3',
        type: 'module',
        dependencies: { '@scope/lib': '^1.0.0' },
      },
      'packages/pack-1/behavior_pack/manifest.json': scriptedManifest(),
      'packages/pack-1/behavior_pack/scripts/main.ts': [
        "import { packId } from '@twin-digital/mc-pack-runtime'",
        "import { libSpawnId } from '@scope/lib'",
        "export const own = packId('wizard')",
        "export const vendored = libSpawnId('min' + 'ion')",
        '',
      ].join('\n'),
      // the vendored library: a vendored_pack plus engine-side modules importing the runtime
      'node_modules/@scope/lib/package.json': {
        name: '@scope/lib',
        version: '1.0.0',
        type: 'module',
        main: 'index.js',
      },
      'node_modules/@scope/lib/vendored_pack/behavior_pack/entities/minion.json': behaviorEntity('minion'),
      'node_modules/@scope/lib/index.js':
        "import { packId } from '@twin-digital/mc-pack-runtime'\nexport const libSpawnId = (name) => packId(name)\n",
      // a stand-in runtime reading the injection lazily, exactly as @twin-digital/mc-pack-runtime does
      'node_modules/@twin-digital/mc-pack-runtime/package.json': {
        name: '@twin-digital/mc-pack-runtime',
        version: '1.0.0',
        type: 'module',
        main: 'index.js',
      },
      'node_modules/@twin-digital/mc-pack-runtime/index.js':
        'export const packId = (name) => `${globalThis.__MC_PACK_RUNTIME__.namespace}:${name}`\n',
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    const bundlePath = path.join(packageDir, 'dist/behavior_pack/scripts/main.js')
    const loaded = (await import(pathToFileURL(bundlePath).href)) as { own: string; vendored: string }
    // the consumer's own import is unwrapped; the library's compiled-in call carries its prefix
    expect(loaded.own).toBe(`${NS}:wizard`)
    expect(loaded.vendored).toBe(`${NS}:lib.minion`)
    const injected = (globalThis as Record<string, unknown>).__MC_PACK_RUNTIME__ as Record<string, unknown>
    expect(injected).toMatchObject({ prefixes: ['lib'] })
    Reflect.deleteProperty(globalThis, '__MC_PACK_RUNTIME__')
  })

  it('stamps a type family naming the pack on every entity type a namespaced pack declares', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/package.json': {
        name: '@scope/pack-1',
        version: '1.2.3',
        dependencies: { '@scope/lib': 'workspace:*' },
      },
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/behavior_pack/entities/wizard.json': behaviorEntity('wizard', {
        components: { 'minecraft:type_family': { family: ['mob'] } },
      }),
      'packages/lib/package.json': { name: '@scope/lib', version: '1.0.0' },
      'packages/lib/vendored_pack/behavior_pack/entities/minion.json': behaviorEntity('minion'),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    const own = await builtJson(packageDir, 'behavior_pack/entities/wizard.json')
    const vendored = await builtJson(packageDir, 'behavior_pack/entities/scope-lib.minion.json')
    expect(own['minecraft:entity']).toMatchObject({
      components: { 'minecraft:type_family': { family: ['mob', `mcdk_pack_${NS}`] } },
    })
    expect(vendored['minecraft:entity']).toMatchObject({
      components: { 'minecraft:type_family': { family: [`mcdk_pack_${NS}`] } },
    })
  })

  it('stamps no family when no namespace is set', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/behavior_pack/entities/wizard.json': behaviorEntity('wizard'),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir)

    const built = await builtJson(packageDir, 'behavior_pack/entities/wizard.json')
    const entity = built['minecraft:entity'] as { components: Record<string, unknown> }
    expect(entity.components).not.toHaveProperty('minecraft:type_family')
  })

  it('adds a claim entity type carrying the pack’s own token to every namespaced pack with a behavior half', async () => {
    const workspace = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')

    await buildPackage(packageDir, { namespace: true })

    const claim = await builtJson(packageDir, `behavior_pack/entities/mcdk_claim_${NS}.json`)
    expect(claim['minecraft:entity']).toMatchObject({
      description: { identifier: `${NS}:mcdk_claim_${NS}`, is_spawnable: false, is_summonable: false },
    })

    // a resource-only namespaced package has no behavior half, so it gets no claim type
    const resourceOnly = await workspaceWith({
      'packages/pack-1/resource_pack/manifest.json': packManifest('resource'),
    })
    const resourceDir = path.join(resourceOnly, 'packages/pack-1')
    await buildPackage(resourceDir, { namespace: true })
    expect(await listTree(path.join(resourceDir, 'dist'))).toEqual(['resource_pack/manifest.json'])

    // bare names landing in the claim spelling are reserved for the build
    const reserved = await workspaceWith({
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/pack-1/behavior_pack/entities/evil.json': behaviorEntity('mcdk_claim_evil'),
    })
    await expect(buildPackage(path.join(reserved, 'packages/pack-1'), { namespace: true })).rejects.toThrow(
      /mcdk_claim_evil/,
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
