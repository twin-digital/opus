import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { packManifest, writeWorkspace } from '../../test/fixture.js'
import type { CandidatePackage, WorkingEntry } from './candidate.js'
import { locatePacks } from './pack-locator.js'
import { enumerateCandidates } from './workspace-enumerator.js'

/** Locates the packs of a workspace fixture, going through enumeration as the kit does. */
async function locate(files: Record<string, unknown>): Promise<WorkingEntry[]> {
  const root = await writeWorkspace(files as Parameters<typeof writeWorkspace>[0])
  const candidates = await enumerateCandidates(root)
  return locatePacks(root, candidates)
}

const solo = (files: Record<string, unknown>): Record<string, unknown> => ({
  'package.json': { name: 'mc-pack-1', version: '1.0.0' },
  ...files,
})

const problemCodes = (entry: WorkingEntry): string[] => entry.problems.map((problem) => problem.code)

describe('locatePacks', () => {
  it('yields a behavior entry for a package holding behavior_pack/manifest.json', async () => {
    const entries = await locate(solo({ 'behavior_pack/manifest.json': packManifest('behavior') }))

    expect(entries).toHaveLength(1)
    expect(entries[0]?.kind).toBe('behavior')
    expect(entries[0]?.problems).toEqual([])
  })

  it('yields a resource entry for a package holding resource_pack/manifest.json', async () => {
    const entries = await locate(solo({ 'resource_pack/manifest.json': packManifest('resource') }))

    expect(entries).toHaveLength(1)
    expect(entries[0]?.kind).toBe('resource')
  })

  it('yields both entries, behavior before resource, for a package holding both', async () => {
    const entries = await locate(
      solo({
        'behavior_pack/manifest.json': packManifest('behavior'),
        'resource_pack/manifest.json': packManifest('resource'),
      }),
    )

    expect(entries.map((entry) => entry.kind)).toEqual(['behavior', 'resource'])
  })

  it('yields no entry at all for a package holding neither', async () => {
    expect(await locate(solo({}))).toEqual([])
  })

  it('probes only the two fixed paths', async () => {
    const entries = await locate(
      solo({
        'manifest.json': packManifest('behavior'),
        'packs/behavior_pack/manifest.json': packManifest('behavior'),
        'src/resource_pack/manifest.json': packManifest('resource'),
      }),
    )

    expect(entries).toEqual([])
  })

  it('computes the source and output locations from the package directory and the kind', async () => {
    const entries = await locate({
      'package.json': { name: 'ws-root', version: '1.0.0', workspaces: ['packages/*'] },
      'packages/mc-pack-1/package.json': { name: 'mc-pack-1', version: '1.0.0' },
      'packages/mc-pack-1/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/mc-pack-1/resource_pack/manifest.json': packManifest('resource'),
    })

    expect(entries.map((entry) => [entry.sourceDir, entry.outputDir])).toEqual([
      ['packages/mc-pack-1/behavior_pack', 'packages/mc-pack-1/dist/behavior_pack'],
      ['packages/mc-pack-1/resource_pack', 'packages/mc-pack-1/dist/resource_pack'],
    ])
  })

  it('spells the root package locations without a ./ prefix', async () => {
    const entries = await locate(solo({ 'behavior_pack/manifest.json': packManifest('behavior') }))

    expect(entries[0]).toMatchObject({
      packageDir: '.',
      sourceDir: 'behavior_pack',
      outputDir: 'dist/behavior_pack',
    })
  })

  it('reports an output location that does not exist', async () => {
    const entries = await locate(solo({ 'behavior_pack/manifest.json': packManifest('behavior') }))

    expect(entries[0]?.outputDir).toBe('dist/behavior_pack')
    expect(entries[0]?.problems).toEqual([])
  })

  describe('the owning package name', () => {
    it('is the package.json name when it declares a string one', async () => {
      const entries = await locate({
        'package.json': { name: '@scope/mc-pack-1', version: '1.0.0' },
        'behavior_pack/manifest.json': packManifest('behavior'),
      })

      expect(entries[0]?.packageName).toBe('@scope/mc-pack-1')
    })

    it('falls back to the package directory basename', async () => {
      const entries = await locate({
        'package.json': { name: 'ws-root', version: '1.0.0', workspaces: ['packages/*'] },
        'packages/nameless/package.json': { version: '1.0.0' },
        'packages/nameless/behavior_pack/manifest.json': packManifest('behavior'),
      })

      expect(entries[0]?.packageName).toBe('nameless')
    })

    it("falls back to the workspace root directory's own name for the root package", async () => {
      const root = await writeWorkspace({
        'package.json': { version: '1.0.0' },
        'behavior_pack/manifest.json': packManifest('behavior'),
      })
      const entries = await locatePacks(root, await enumerateCandidates(root))

      expect(entries[0]?.packageName).toBe(path.basename(root))
    })
  })

  describe('reading the manifest', () => {
    it('reports an unreadable manifest as manifest-unreadable, keeping every other detail', async () => {
      const entries = await locate(
        solo({ 'behavior_pack/manifest.json/placeholder': 'a directory sits in the file place' }),
      )

      expect(entries).toHaveLength(1)
      expect(entries[0]?.manifest).toBeUndefined()
      expect(entries[0]).toMatchObject({
        kind: 'behavior',
        packageName: 'mc-pack-1',
        packageDir: '.',
        sourceDir: 'behavior_pack',
        outputDir: 'dist/behavior_pack',
      })
      expect(entries[0]?.problems).toEqual([
        { code: 'manifest-unreadable', message: expect.any(String), error: expect.any(String) },
      ])
    })

    it('parses a manifest saved with a byte-order mark', async () => {
      const entries = await locate(
        solo({
          'behavior_pack/manifest.json': `\uFEFF${JSON.stringify(packManifest('behavior'))}`,
        }),
      )

      expect(entries[0].problems).toEqual([])
      expect(entries[0].manifest).toMatchObject({ format_version: 2 })
    })

    it('reports an unparseable manifest as the same one problem', async () => {
      const entries = await locate(solo({ 'behavior_pack/manifest.json': '{ "header": }' }))

      expect(problemCodes(entries[0])).toEqual(['manifest-unreadable'])
      expect(entries[0]?.manifest).toBeUndefined()
    })
  })

  describe('the manifest shape', () => {
    const shapeCase = async (contents: unknown): Promise<WorkingEntry> => {
      const entries = await locate(solo({ 'behavior_pack/manifest.json': contents }))
      return entries[0]
    }

    it.each([
      ['an array', [1, 2, 3]],
      ['a string', '"a manifest"'],
      ['null', 'null'],
    ])('reports a manifest that parsed to %s at the manifest root', async (_label, contents) => {
      const entry = await shapeCase(contents)

      expect(entry.problems).toEqual([{ code: 'manifest-shape-invalid', message: expect.any(String), field: '' }])
      expect(entry.manifest).not.toBeUndefined()
    })

    it('reports a header that is not an object', async () => {
      const entry = await shapeCase(packManifest('behavior', { header: 'not an object' }))

      expect(entry.problems).toContainEqual(
        expect.objectContaining({ code: 'manifest-shape-invalid', field: 'header' }),
      )
    })

    it('reports modules that are not an array, and a non-object element', async () => {
      expect((await shapeCase(packManifest('behavior', { modules: {} }))).problems).toEqual([
        { code: 'manifest-shape-invalid', message: expect.any(String), field: 'modules' },
      ])
      expect(
        (await shapeCase(packManifest('behavior', { modules: [{ type: 'data' }, 'nope'] }))).problems,
      ).toContainEqual(expect.objectContaining({ field: 'modules[1]' }))
    })

    it('reports dependencies that are not an array, and a non-object element', async () => {
      expect((await shapeCase(packManifest('behavior', { dependencies: {} }))).problems).toEqual([
        { code: 'manifest-shape-invalid', message: expect.any(String), field: 'dependencies' },
      ])
      expect(
        (await shapeCase(packManifest('behavior', { dependencies: [{ module_name: 'x', version: '1.0.0' }, 3] })))
          .problems,
      ).toContainEqual(expect.objectContaining({ field: 'dependencies[1]' }))
    })

    it('raises no shape fault for an absent header, modules, or dependencies', async () => {
      const entry = await shapeCase({ format_version: 2 })

      expect(entry.problems).toEqual([])
    })
  })

  it('locates packs across every candidate handed to it', async () => {
    const root = await writeWorkspace({
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'package.json': { name: 'ws-root', version: '1.0.0' },
      'packages/alpha/package.json': { name: 'alpha', version: '1.0.0' },
      'packages/alpha/behavior_pack/manifest.json': packManifest('behavior'),
      'packages/beta/package.json': { name: 'beta', version: '1.0.0' },
      'packages/beta/resource_pack/manifest.json': packManifest('resource'),
    })
    const candidates: CandidatePackage[] = await enumerateCandidates(root)

    const entries = await locatePacks(root, candidates)

    expect(entries.map((entry) => entry.sourceDir).sort()).toEqual([
      'packages/alpha/behavior_pack',
      'packages/beta/resource_pack',
    ])
  })
})
