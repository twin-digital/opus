import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { packManifest, writeWorkspace } from '../test/fixture.js'
import { discoverPacks } from './discover-packs.js'
import type { PackEntry, ValidPackEntry } from './types.js'

const codes = (entries: readonly PackEntry[]): string[] =>
  entries.flatMap((entry) => entry.problems.map((problem) => problem.code))

const found = (entries: readonly PackEntry[]): string[] => entries.map((entry) => entry.sourceDir)

/** A workspace of two packages, one holding both kinds of pack, plus a pack in the root. */
const workspaceFiles = {
  'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
  'package.json': { name: 'ws-root', version: '0.0.1' },
  'behavior_pack/manifest.json': packManifest('behavior', {
    header: { uuid: 'ROOT-UUID' },
  }),
  'packages/mc-pack-1/package.json': { name: '@scope/mc-pack-1', version: '1.2.3' },
  'packages/mc-pack-1/behavior_pack/manifest.json': packManifest('behavior', {
    header: { uuid: 'pack-1-behavior' },
    dependencies: [{ module_name: '@minecraft/server', version: '1.9.0' }],
  }),
  'packages/mc-pack-1/resource_pack/manifest.json': packManifest('resource', {
    header: { uuid: 'pack-1-resource' },
  }),
  'packages/mc-pack-2/package.json': { name: 'mc-pack-2', productName: 'Pack Two', version: '2.0.0' },
  'packages/mc-pack-2/behavior_pack/manifest.json': packManifest('behavior', {
    header: { uuid: 'pack-2-behavior' },
    dependencies: [{ uuid: 'pack-1-behavior' }],
  }),
  'packages/no-pack/package.json': { name: 'no-pack', version: '1.0.0' },
}

describe('discoverPacks', () => {
  it('returns every pack of a pnpm workspace, each detail present on a valid entry', async () => {
    const workspace = await writeWorkspace(workspaceFiles)

    const entries = await discoverPacks({ workspace })

    expect(found(entries)).toEqual([
      'behavior_pack',
      'packages/mc-pack-1/behavior_pack',
      'packages/mc-pack-1/resource_pack',
      'packages/mc-pack-2/behavior_pack',
    ])
    expect(entries.every((entry) => entry.status === 'valid')).toBe(true)
    expect(entries[1]).toEqual({
      status: 'valid',
      kind: 'behavior',
      packageName: '@scope/mc-pack-1',
      packageDir: 'packages/mc-pack-1',
      sourceDir: 'packages/mc-pack-1/behavior_pack',
      outputDir: 'packages/mc-pack-1/dist/behavior_pack',
      scriptOutput: 'packages/mc-pack-1/dist/behavior_pack/scripts/main.js',
      uuid: 'pack-1-behavior',
      version: '1.2.3',
      manifest: expect.objectContaining({
        format_version: 2,
        header: expect.objectContaining({
          name: 'mc-pack-1',
          uuid: 'pack-1-behavior',
          version: '1.2.3',
        }),
      }),
      problems: [],
    })
  })

  it('completes a workspace dependency version from the depended-on package', async () => {
    const workspace = await writeWorkspace(workspaceFiles)

    const entries = await discoverPacks({ workspace, filter: { package: 'mc-pack-2' } })

    expect((entries[0] as ValidPackEntry).manifest.dependencies).toEqual([
      { uuid: 'pack-1-behavior', version: '1.2.3' },
    ])
  })

  it('returns every pack of an npm workspace, the root package among them', async () => {
    const workspace = await writeWorkspace({
      'package.json': { name: 'ws-root', version: '0.0.1', workspaces: ['packages/*'] },
      'behavior_pack/manifest.json': packManifest('behavior', { header: { uuid: 'root' } }),
      'packages/alpha/package.json': { name: 'alpha', version: '1.0.0' },
      'packages/alpha/resource_pack/manifest.json': packManifest('resource', {
        header: { uuid: 'alpha' },
      }),
    })

    const entries = await discoverPacks({ workspace })

    expect(found(entries)).toEqual(['behavior_pack', 'packages/alpha/resource_pack'])
    expect(codes(entries)).toEqual([])
  })

  it('orders entries by package directory, the root first and behavior before resource', async () => {
    const workspace = await writeWorkspace({
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'package.json': { name: 'ws-root', version: '1.0.0' },
      'resource_pack/manifest.json': packManifest('resource', { header: { uuid: 'root-r' } }),
      'behavior_pack/manifest.json': packManifest('behavior', { header: { uuid: 'root-b' } }),
      'packages/zeta/package.json': { name: 'zeta', version: '1.0.0' },
      'packages/zeta/behavior_pack/manifest.json': packManifest('behavior', {
        header: { uuid: 'zeta' },
      }),
      'packages/alpha/package.json': { name: 'alpha', version: '1.0.0' },
      'packages/alpha/resource_pack/manifest.json': packManifest('resource', {
        header: { uuid: 'alpha' },
      }),
    })

    expect(found(await discoverPacks({ workspace }))).toEqual([
      'behavior_pack',
      'resource_pack',
      'packages/alpha/resource_pack',
      'packages/zeta/behavior_pack',
    ])
  })

  it('reports the packs of a package the workspace definition reaches twice only once', async () => {
    const workspace = await writeWorkspace({
      'package.json': { name: 'ws-root', version: '1.0.0', workspaces: ['.', 'packages/*'] },
      'behavior_pack/manifest.json': packManifest('behavior', { header: { uuid: 'root' } }),
    })

    expect(found(await discoverPacks({ workspace }))).toEqual(['behavior_pack'])
  })

  describe('the workspace option', () => {
    const originalCwd = process.cwd()
    afterEach(() => {
      process.chdir(originalCwd)
    })

    it('defaults to the current working directory', async () => {
      const workspace = await writeWorkspace(workspaceFiles)
      process.chdir(workspace)

      expect(found(await discoverPacks())).toContain('packages/mc-pack-1/behavior_pack')
    })

    it('resolves a relative path against the current working directory', async () => {
      const workspace = await writeWorkspace(workspaceFiles)
      process.chdir(path.dirname(workspace))

      const entries = await discoverPacks({ workspace: path.basename(workspace) })

      expect(found(entries)).toContain('packages/mc-pack-1/behavior_pack')
    })
  })

  describe('filtering', () => {
    it('narrows the returned array, where no filter returns the whole set', async () => {
      const workspace = await writeWorkspace(workspaceFiles)

      expect(await discoverPacks({ workspace })).toHaveLength(4)
      expect(found(await discoverPacks({ workspace, filter: { package: 'mc-pack-2' } }))).toEqual([
        'packages/mc-pack-2/behavior_pack',
      ])
    })

    it('returns the whole set for an empty filter', async () => {
      const workspace = await writeWorkspace(workspaceFiles)

      expect(await discoverPacks({ workspace, filter: {} })).toHaveLength(4)
    })

    it('returns an empty array when nothing matches', async () => {
      const workspace = await writeWorkspace(workspaceFiles)

      expect(await discoverPacks({ workspace, filter: { name: 'nothing here' } })).toEqual([])
    })

    it('returns entries identical to the matching subset of an unfiltered call', async () => {
      const workspace = await writeWorkspace(workspaceFiles)

      const all = await discoverPacks({ workspace })

      expect(await discoverPacks({ workspace, filter: { uuid: 'PACK-1-BEHAVIOR' } })).toEqual([
        all.find((entry) => entry.sourceDir === 'packages/mc-pack-1/behavior_pack'),
      ])
    })

    it('narrows on status over a set holding both', async () => {
      const workspace = await writeWorkspace({
        'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
        'package.json': { name: 'ws-root', version: '1.0.0' },
        'packages/sound/package.json': { name: 'sound', version: '1.0.0' },
        'packages/sound/behavior_pack/manifest.json': packManifest('behavior'),
        'packages/broken/package.json': { name: 'broken', version: '1.0.0' },
        'packages/broken/behavior_pack/manifest.json': '{ not json',
      })

      expect(found(await discoverPacks({ workspace, filter: { status: 'valid' } }))).toEqual([
        'packages/sound/behavior_pack',
      ])
      expect(found(await discoverPacks({ workspace, filter: { status: 'invalid' } }))).toEqual([
        'packages/broken/behavior_pack',
      ])
    })
  })

  describe('faults after enumeration', () => {
    const faulted = {
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'package.json': { name: 'ws-root', version: '1.0.0' },
      'packages/unreadable/package.json': { name: 'unreadable', version: '1.0.0' },
      'packages/unreadable/behavior_pack/manifest.json': '{ not json',
      'packages/twin-a/package.json': { name: 'twin-a', version: '1.0.0' },
      'packages/twin-a/behavior_pack/manifest.json': packManifest('behavior', {
        header: { uuid: 'shared' },
      }),
      'packages/twin-b/package.json': { name: 'twin-b', version: '1.0.0' },
      'packages/twin-b/behavior_pack/manifest.json': packManifest('behavior', {
        header: { uuid: 'SHARED' },
      }),
      'packages/versionless/package.json': { name: 'versionless' },
      'packages/versionless/behavior_pack/manifest.json': packManifest('behavior', {
        header: { uuid: 'versionless' },
      }),
    }

    it('carries every fault on an entry rather than throwing', async () => {
      const workspace = await writeWorkspace(faulted)

      const entries = await discoverPacks({ workspace })

      expect(entries).toHaveLength(4)
      expect(codes(entries).sort()).toEqual([
        'duplicate-uuid',
        'duplicate-uuid',
        'manifest-unreadable',
        'package-version-missing',
      ])
    })

    it('keeps every non-manifest detail on an invalid entry', async () => {
      const workspace = await writeWorkspace(faulted)

      const entries = await discoverPacks({ workspace, filter: { status: 'invalid' } })

      expect(
        entries.map(({ kind, packageName, packageDir, sourceDir, outputDir }) => ({
          kind,
          packageName,
          packageDir,
          sourceDir,
          outputDir,
        })),
      ).toEqual([
        {
          kind: 'behavior',
          packageName: 'twin-a',
          packageDir: 'packages/twin-a',
          sourceDir: 'packages/twin-a/behavior_pack',
          outputDir: 'packages/twin-a/dist/behavior_pack',
        },
        {
          kind: 'behavior',
          packageName: 'twin-b',
          packageDir: 'packages/twin-b',
          sourceDir: 'packages/twin-b/behavior_pack',
          outputDir: 'packages/twin-b/dist/behavior_pack',
        },
        {
          kind: 'behavior',
          packageName: 'unreadable',
          packageDir: 'packages/unreadable',
          sourceDir: 'packages/unreadable/behavior_pack',
          outputDir: 'packages/unreadable/dist/behavior_pack',
        },
        {
          kind: 'behavior',
          packageName: 'versionless',
          packageDir: 'packages/versionless',
          sourceDir: 'packages/versionless/behavior_pack',
          outputDir: 'packages/versionless/dist/behavior_pack',
        },
      ])
    })

    it('keeps the uuid, version, and completed manifest an invalid entry still holds', async () => {
      const workspace = await writeWorkspace(faulted)

      const entries = await discoverPacks({ workspace })
      const duplicate = entries.find((entry) => entry.packageDir === 'packages/twin-a')
      const versionless = entries.find((entry) => entry.packageDir === 'packages/versionless')

      expect(duplicate).toMatchObject({
        uuid: 'shared',
        version: '1.0.0',
        manifest: expect.objectContaining({
          header: expect.objectContaining({ name: 'twin-a', version: '1.0.0' }),
        }),
      })
      expect(versionless?.uuid).toBe('versionless')
      expect(versionless?.version).toBeUndefined()
      expect((versionless?.manifest as { header: Record<string, unknown> }).header).toMatchObject({
        name: 'versionless',
      })
      expect((versionless?.manifest as { header: Record<string, unknown> }).header.version).toBeUndefined()
    })

    it('reports one problem for a misshapen container, with nothing cascading from it', async () => {
      const workspace = await writeWorkspace({
        'package.json': { name: 'solo', version: '1.0.0' },
        'behavior_pack/manifest.json': packManifest('behavior', {
          header: 'not an object',
          modules: 'not an array',
          dependencies: 'not an array',
        }),
      })

      const entries = await discoverPacks({ workspace })

      expect(codes(entries).sort()).toEqual([
        'manifest-shape-invalid',
        'manifest-shape-invalid',
        'manifest-shape-invalid',
      ])
    })

    it('reports a field whose form the source contradicts, and nothing that reads it', async () => {
      const workspace = await writeWorkspace({
        'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
        'package.json': { name: 'ws-root', version: '1.0.0' },
        'packages/uuid/package.json': { name: 'uuid-pack', version: '1.0.0' },
        'packages/uuid/behavior_pack/manifest.json': packManifest('behavior', {
          header: { uuid: 42 },
        }),
        'packages/module-type/package.json': { name: 'module-type-pack', version: '1.0.0' },
        'packages/module-type/behavior_pack/manifest.json': packManifest('behavior', {
          header: { uuid: 'module-type' },
          modules: [{ type: 7 }, { type: 'resources' }],
        }),
        'packages/module-version/package.json': { name: 'module-version-pack', version: '1.0.0' },
        'packages/module-version/behavior_pack/manifest.json': packManifest('behavior', {
          header: { uuid: 'module-version' },
          modules: [{ type: 'data', version: 'not a version at all', uuid: 7 }],
        }),
      })

      const entries = await discoverPacks({ workspace })

      expect(entries.map((entry) => entry.problems.map((problem) => problem.code))).toEqual([
        ['manifest-shape-invalid'],
        ['manifest-shape-invalid'],
        ['manifest-shape-invalid'],
      ])
      const shapeFields = entries.flatMap((entry) =>
        entry.problems.flatMap((problem) => (problem.code === 'manifest-shape-invalid' ? [problem.field] : [])),
      )

      expect(shapeFields).toEqual(['modules[0].type', 'modules[0].uuid', 'header.uuid'])
    })

    it('carries a pack whose kind the manifest contradicts', async () => {
      const workspace = await writeWorkspace({
        'package.json': { name: 'solo', version: '1.0.0' },
        'behavior_pack/manifest.json': packManifest('behavior', {
          modules: [{ type: 'resources' }],
        }),
      })

      expect(codes(await discoverPacks({ workspace })).sort()).toEqual(['foreign-kind-module', 'kind-not-corroborated'])
    })

    it('leaves a pack outside every workspace package out of the set, with no problem', async () => {
      const workspace = await writeWorkspace({
        'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
        'package.json': { name: 'ws-root', version: '1.0.0' },
        'packages/orphan/behavior_pack/manifest.json': packManifest('behavior'),
      })

      expect(await discoverPacks({ workspace })).toEqual([])
    })
  })

  it('rejects when the workspace cannot be enumerated, with the error unwrapped', async () => {
    const noDefinition = await writeWorkspace({ 'README.md': 'nothing here' })
    const brokenMember = await writeWorkspace({
      'package.json': { name: 'ws-root', version: '1.0.0', workspaces: ['packages/*'] },
      'packages/broken/package.json': '{ "name": "broken", "version": }',
    })

    await expect(discoverPacks({ workspace: noDefinition })).rejects.toMatchObject({
      code: 'ENOENT',
    })
    await expect(discoverPacks({ workspace: brokenMember })).rejects.toMatchObject({
      code: 'EJSONPARSE',
    })
  })

  it('reads the filesystem again on every call', async () => {
    const workspace = await writeWorkspace({
      'package.json': { name: 'solo', version: '1.0.0' },
      'behavior_pack/manifest.json': packManifest('behavior'),
    })

    expect(await discoverPacks({ workspace })).toHaveLength(1)

    await mkdir(path.join(workspace, 'resource_pack'), { recursive: true })
    await writeFile(path.join(workspace, 'resource_pack/manifest.json'), JSON.stringify(packManifest('resource')))

    expect((await discoverPacks({ workspace })).map((entry) => entry.kind)).toEqual(['behavior', 'resource'])
  })

  it('reports the completed header version as the entry version, and a lowercased uuid', async () => {
    const workspace = await writeWorkspace({
      'package.json': { name: 'solo', version: '3.4.5' },
      'behavior_pack/manifest.json': packManifest('behavior', {
        header: { uuid: 'MiXeD-CaSe-UUID', version: [0, 0, 0] },
      }),
    })

    const [entry] = await discoverPacks({ workspace })

    expect(entry.status).toBe('valid')
    expect(entry.uuid).toBe('mixed-case-uuid')
    expect((entry.manifest as { header: Record<string, unknown> }).header.uuid).toBe('MiXeD-CaSe-UUID')
    expect(entry.version).toBe('3.4.5')
  })

  it('raises every code the closed union holds, and nothing outside it, from one workspace', async () => {
    const workspace = await writeWorkspace({
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'package.json': {},
      'behavior_pack/manifest.json': packManifest('behavior', {
        format_version: 3,
        header: { uuid: 'root-uuid', name: 'Specified', version: [1, 0, 0] },
        modules: [{ type: 'data', entry: 'scripts/specified.js' }, { uuid: 'no-type' }, { type: 'resources' }],
        dependencies: [
          { uuid: 'nowhere' },
          { module_name: '@minecraft/server' },
          { uuid: 'both', module_name: 'both' },
          { uuid: 'twin', version: '1.0.0' },
        ],
      }),
      'packages/broken/package.json': { name: 'broken', version: 'not-a-version' },
      'packages/broken/behavior_pack/manifest.json': packManifest('behavior', {
        header: { uuid: 'twin' },
        modules: [{ type: 'client_data' }],
        dependencies: [{ uuid: 'twin-2', version: '' }],
      }),
      'packages/twin/package.json': { name: 'twin', version: '1.0.0' },
      'packages/twin/behavior_pack/manifest.json': packManifest('behavior', {
        header: { uuid: 'twin' },
      }),
      'packages/unreadable/package.json': { name: 'unreadable', version: '1.0.0' },
      'packages/unreadable/behavior_pack/manifest.json': '}{',
      'packages/nouuid/package.json': { name: 'nouuid', version: '1.0.0' },
      'packages/nouuid/behavior_pack/manifest.json': packManifest('behavior', {
        header: { description: 'no identity' },
      }),
      'packages/misshapen/package.json': { name: 'misshapen', version: '1.0.0' },
      'packages/misshapen/behavior_pack/manifest.json': packManifest('behavior', {
        header: [1, 2],
      }),
    })

    expect(new Set(codes(await discoverPacks({ workspace })))).toEqual(
      new Set([
        'manifest-unreadable',
        'manifest-shape-invalid',
        'array-version-at-format-version-3',
        'header-name-specified',
        'header-version-specified',
        'package-name-missing',
        'package-version-missing',
        'package-version-invalid',
        'dependency-version-specified',
        'dependency-entry-malformed',
        'external-dependency-version-missing',
        'dependency-unsatisfied',
        'manifest-missing-uuid',
        'module-entry-specified',
        'module-missing-type',
        'kind-not-corroborated',
        'foreign-kind-module',
        'duplicate-uuid',
        'dependency-invalid',
      ]),
    )
  })
})

describe('the published surface', () => {
  it('is named @twin-digital/mc-dev-kit', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { name: string }

    expect(manifest.name).toBe('@twin-digital/mc-dev-kit')
  })
})

describe('discovery produces no built output', () => {
  /** Every file under `dir`, as workspace-relative path → size, mtime, and bytes. */
  async function snapshot(dir: string, base = dir): Promise<Map<string, string>> {
    const taken = new Map<string, string>()
    for (const child of await readdir(dir, { withFileTypes: true })) {
      const target = path.join(dir, child.name)
      if (child.isDirectory()) {
        for (const [at, state] of await snapshot(target, base)) {
          taken.set(at, state)
        }
        continue
      }
      const [stats, bytes] = await Promise.all([stat(target), readFile(target)])
      taken.set(
        path.relative(base, target),
        `${String(stats.size)}:${String(stats.mtimeMs)}:${bytes.toString('base64')}`,
      )
    }
    return taken
  }

  it('leaves the tree byte-identical, with nothing standing at any reported output path', async () => {
    const workspace = await writeWorkspace(workspaceFiles)
    const before = await snapshot(workspace)

    const entries = await discoverPacks({ workspace })

    expect(await snapshot(workspace)).toEqual(before)
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry.outputDir).toBeTruthy()
      expect(existsSync(path.join(workspace, entry.outputDir))).toBe(false)
      if (entry.scriptOutput !== null) {
        expect(existsSync(path.join(workspace, entry.scriptOutput))).toBe(false)
      }
    }
    // no snapshot key sits under any pack's output tree, so the build tree was never written
    expect([...before.keys()].filter((at) => at.includes('dist/'))).toEqual([])
  })

  it('reads nothing of the output tree into the result, even where one is present', async () => {
    const workspace = await writeWorkspace({
      ...workspaceFiles,
      'packages/mc-pack-1/dist/behavior_pack/manifest.json': packManifest('behavior', {
        header: { uuid: 'BUILT-UUID', name: 'Built', version: '9.9.9' },
      }),
      'packages/mc-pack-1/dist/behavior_pack/scripts/main.js': 'export {}\n',
    })
    const before = await snapshot(workspace)

    const [, entry] = await discoverPacks({ workspace })

    expect(await snapshot(workspace)).toEqual(before)
    expect(entry.status).toBe('valid')
    expect(entry.uuid).toBe('pack-1-behavior')
    expect((entry as ValidPackEntry).manifest.header.name).toBe('mc-pack-1')
    expect(codes([entry])).toEqual([])
  })
})
