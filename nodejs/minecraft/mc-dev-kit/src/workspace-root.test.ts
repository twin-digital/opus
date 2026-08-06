import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeWorkspace } from '../test/fixture.js'
import { resolveWorkspaceRoot } from './workspace-root.js'

describe('resolveWorkspaceRoot', () => {
  it('finds a pnpm root by its marker, under either spelling', async () => {
    for (const marker of ['pnpm-workspace.yaml', 'pnpm-workspace.yml']) {
      const root = await writeWorkspace({
        [marker]: 'packages:\n  - packages/*\n',
        'package.json': { name: '@scope/ws-root', version: '1.0.0' },
        'packages/pack-1/package.json': { name: '@scope/pack-1', version: '1.0.0' },
      })

      const found = await resolveWorkspaceRoot({ from: path.join(root, 'packages/pack-1') })

      expect(found).toEqual({ root, packageName: '@scope/ws-root' })
    }
  })

  it('finds an npm root by a package.json declaring workspaces', async () => {
    const root = await writeWorkspace({
      'package.json': { name: 'ws-root', version: '1.0.0', workspaces: ['packages/*'] },
      'packages/pack-1/package.json': { name: '@scope/pack-1', version: '1.0.0' },
    })

    const found = await resolveWorkspaceRoot({ from: path.join(root, 'packages/pack-1') })

    expect(found).toEqual({ root, packageName: 'ws-root' })
  })

  it('climbs past a package.json that declares no workspaces', async () => {
    const root = await writeWorkspace({
      'pnpm-workspace.yaml': 'packages:\n  - nested/*/*\n',
      'package.json': { name: 'ws-root', version: '1.0.0' },
      'nested/package.json': { name: 'not-a-root', version: '1.0.0' },
      'nested/pack-1/package.json': { name: '@scope/pack-1', version: '1.0.0' },
    })

    const found = await resolveWorkspaceRoot({ from: path.join(root, 'nested/pack-1') })

    expect(found?.root).toBe(root)
  })

  it('takes the starting directory itself as a candidate', async () => {
    const root = await writeWorkspace({
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'package.json': { name: 'ws-root', version: '1.0.0' },
    })

    expect(await resolveWorkspaceRoot({ from: root })).toEqual({ root, packageName: 'ws-root' })
  })

  it('names a root package that declares no name by its directory', async () => {
    const root = await writeWorkspace({
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'package.json': { version: '1.0.0' },
    })

    const found = await resolveWorkspaceRoot({ from: root })

    expect(found?.packageName).toBe(path.basename(root))
  })

  it('names a pnpm root holding no package.json by its directory', async () => {
    const root = await writeWorkspace({ 'pnpm-workspace.yaml': 'packages:\n  - packages/*\n' })

    const found = await resolveWorkspaceRoot({ from: root })

    expect(found).toEqual({ root, packageName: path.basename(root) })
  })

  it('returns undefined when no ancestor is a workspace root', async () => {
    const root = await writeWorkspace({
      'package.json': { name: 'lonely', version: '1.0.0' },
      'nested/package.json': { name: 'nested', version: '1.0.0' },
    })

    expect(await resolveWorkspaceRoot({ from: path.join(root, 'nested') })).toBeUndefined()
  })

  it('throws naming the file when a pnpm marker will not parse', async () => {
    const root = await writeWorkspace({ 'pnpm-workspace.yaml': 'packages:\n - [unclosed\n' })

    await expect(resolveWorkspaceRoot({ from: root })).rejects.toThrow(path.join(root, 'pnpm-workspace.yaml'))
  })

  it('throws naming the file when a package.json on the ascent will not parse', async () => {
    const root = await writeWorkspace({
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'packages/pack-1/package.json': '{ not json',
    })

    await expect(resolveWorkspaceRoot({ from: path.join(root, 'packages/pack-1') })).rejects.toThrow(
      path.join(root, 'packages/pack-1/package.json'),
    )
  })

  it('resolves a relative `from` against the current directory, defaulting to it', async () => {
    const found = await resolveWorkspaceRoot({ from: '.' })

    expect(found).toEqual(await resolveWorkspaceRoot())
  })
})
