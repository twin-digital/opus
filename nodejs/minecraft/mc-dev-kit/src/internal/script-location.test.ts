import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { packManifest, writeWorkspace } from '../../test/fixture.js'
import type { PackEntry } from '../types.js'
import { packBuildPlugin } from './pack-build-plugin.js'

// the pack set computes the script location, so the only way it reports one the configuration does
// not point at is for that computation to change — which is what this check exists to catch
const { reported } = vi.hoisted(() => ({ reported: { scriptOutput: '' } }))

vi.mock('../discover-packs.js', () => ({
  discoverPacks: () =>
    Promise.resolve([
      {
        status: 'valid',
        kind: 'behavior',
        packageName: '@scope/pack-1',
        packageDir: 'packages/pack-1',
        sourceDir: 'packages/pack-1/behavior_pack',
        outputDir: 'packages/pack-1/dist/behavior_pack',
        scriptOutput: reported.scriptOutput,
        uuid: '11111111-1111-1111-1111-111111111111',
        version: '1.2.3',
        manifest: packManifest('behavior'),
        problems: [],
      },
    ] as unknown as PackEntry[]),
}))

describe('the configured script location is checked against the pack set', () => {
  it('fails when the pack set reports a script location that is not the configured one', async () => {
    const workspace = await writeWorkspace({
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'package.json': { name: 'root', version: '0.0.0', private: true },
      'packages/pack-1/package.json': { name: '@scope/pack-1', version: '1.2.3' },
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')
    reported.scriptOutput = 'packages/pack-1/dist/behavior_pack/scripts/elsewhere.js'

    const plugin = packBuildPlugin({ packageDir, virtualEntry: true })
    const buildStart = plugin.buildStart as unknown as (this: unknown, options: unknown) => Promise<void>

    await expect(buildStart.call({ addWatchFile: () => undefined }, {})).rejects.toThrow(
      /reports the script of .* at .*scripts\/elsewhere\.js, not at .*scripts\/main\.js/,
    )
  })

  it('passes the pack whose reported location is the configured one', async () => {
    const workspace = await writeWorkspace({
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'package.json': { name: 'root', version: '0.0.0', private: true },
      'packages/pack-1/package.json': { name: '@scope/pack-1', version: '1.2.3' },
      'packages/pack-1/behavior_pack/manifest.json': packManifest('behavior'),
    })
    const packageDir = path.join(workspace, 'packages/pack-1')
    reported.scriptOutput = 'packages/pack-1/dist/behavior_pack/scripts/main.js'

    const plugin = packBuildPlugin({ packageDir, virtualEntry: true })
    const buildStart = plugin.buildStart as unknown as (this: unknown, options: unknown) => Promise<void>

    await expect(buildStart.call({ addWatchFile: () => undefined }, {})).resolves.toBeUndefined()
  })
})
