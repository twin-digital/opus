import { describe, expect, expectTypeOf, it } from 'vitest'
import { packManifest, writeWorkspace } from '../test/fixture.js'
import {
  discoverPacks,
  resolveWorkspaceRoot,
  type DiscoverOptions,
  type InvalidPackEntry,
  type ManifestDependency,
  type ManifestHeader,
  type ManifestModule,
  type ManifestVersion,
  type PackCriteria,
  type PackEntry,
  type PackKind,
  type PackManifest,
  type Problem,
  type ValidPackEntry,
  type WorkspaceRoot,
  type WorkspaceRootOptions,
} from '@twin-digital/mc-dev-kit'
import { packBuild, type PackBuildOptions, type VendorConfig } from '@twin-digital/mc-dev-kit/build'

/** The shape a consumer meets: the entry point, and the types it hands back. */
describe('the kit as a consumer imports it', () => {
  it('exports the discovery call and the types the pack set is made of', () => {
    expectTypeOf(discoverPacks).toBeFunction()
    expectTypeOf<DiscoverOptions>().toHaveProperty('workspace')
    expectTypeOf<DiscoverOptions>().toHaveProperty('filter')
    expectTypeOf<PackCriteria>().toHaveProperty('uuid')
    expectTypeOf<PackEntry>().toEqualTypeOf<ValidPackEntry | InvalidPackEntry>()
    expectTypeOf<PackKind>().toEqualTypeOf<'behavior' | 'resource'>()
    expectTypeOf<Problem>().toHaveProperty('code')
    expectTypeOf<PackManifest>().toHaveProperty('header')
    expectTypeOf<ManifestHeader>().toHaveProperty('uuid')
    expectTypeOf<ManifestModule>().toHaveProperty('type')
    expectTypeOf<ManifestVersion>().toEqualTypeOf<string | [number, number, number]>()
    expectTypeOf<ManifestDependency[]>().toEqualTypeOf<NonNullable<PackManifest['dependencies']>>()
  })

  it('exports workspace-root resolution, and the types it speaks', () => {
    expectTypeOf(resolveWorkspaceRoot).toBeFunction()
    expectTypeOf(resolveWorkspaceRoot).returns.resolves.toEqualTypeOf<WorkspaceRoot | undefined>()
    expectTypeOf<WorkspaceRoot>().toEqualTypeOf<{ root: string; packageName: string }>()
    expectTypeOf<WorkspaceRootOptions>().toHaveProperty('from')
  })

  it('exports the build fragment from its own subpath, so the discovery half names no bundler', () => {
    expectTypeOf(packBuild).toBeFunction()
    expectTypeOf<PackBuildOptions>().toEqualTypeOf<{
      packageDir: string
      namespace?: boolean | string
      vendor?: VendorConfig
    }>()
    expectTypeOf<VendorConfig>().toEqualTypeOf<Record<string, { prefix?: string } | undefined>>()
  })

  it('reports where a built script belongs on every entry, null where a pack has none', async () => {
    const workspace = await writeWorkspace({
      'package.json': { name: 'solo', version: '1.0.0' },
      'behavior_pack/manifest.json': packManifest('behavior'),
      'resource_pack/manifest.json': packManifest('resource'),
    })

    const [behavior, resource] = await discoverPacks({ workspace })

    expectTypeOf(behavior.scriptOutput).toEqualTypeOf<string | null>()
    expect(behavior.scriptOutput).toBe('dist/behavior_pack/scripts/main.js')
    expect(resource.scriptOutput).toBeNull()
  })

  it('hands back data, typed so a valid entry reads its manifest without a cast', async () => {
    const workspace = await writeWorkspace({
      'package.json': { name: 'solo', version: '1.0.0' },
      'behavior_pack/manifest.json': packManifest('behavior'),
    })

    const [entry] = await discoverPacks({ workspace })
    if (entry.status !== 'valid') {
      throw new Error('expected a valid entry')
    }

    expectTypeOf(entry.manifest).toEqualTypeOf<PackManifest>()
    expectTypeOf(entry.manifest.header.uuid).toBeString()
    expect(entry.manifest.header.uuid).toBe('11111111-1111-1111-1111-111111111111')
    expect(entry.uuid).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('types an invalid entry manifest as unknown, so a consumer narrows it', async () => {
    const workspace = await writeWorkspace({
      'package.json': { name: 'solo', version: '1.0.0' },
      'behavior_pack/manifest.json': '{ broken',
    })

    const [entry] = await discoverPacks({ workspace })
    if (entry.status !== 'invalid') {
      throw new Error('expected an invalid entry')
    }

    expectTypeOf(entry.manifest).toEqualTypeOf<unknown>()
    expectTypeOf(entry.problems).toEqualTypeOf<[Problem, ...Problem[]]>()
    expect(entry.problems[0].code).toBe('manifest-unreadable')
  })
})
