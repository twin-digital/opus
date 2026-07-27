import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeWorkspace } from '../../test/fixture.js'
import { enumerateCandidates } from './workspace-enumerator.js'

const dirs = async (root: string): Promise<string[]> =>
  (await enumerateCandidates(root)).map((candidate) => candidate.packageDir).sort()

describe('enumerateCandidates', () => {
  describe('pnpm workspaces', () => {
    it('returns the root package and every member, each with its package.json parsed', async () => {
      const root = await writeWorkspace({
        'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
        'package.json': { name: 'ws-root', version: '0.0.0' },
        'packages/alpha/package.json': { name: '@fixture/alpha', version: '1.2.3' },
        'packages/beta/package.json': { name: '@fixture/beta', version: '0.1.0' },
      })

      const candidates = await enumerateCandidates(root)

      expect(candidates.map((candidate) => candidate.packageDir).sort()).toEqual([
        '.',
        'packages/alpha',
        'packages/beta',
      ])
      const alpha = candidates.find((candidate) => candidate.packageDir === 'packages/alpha')
      expect(alpha?.packageJson).toMatchObject({ name: '@fixture/alpha', version: '1.2.3' })
      expect(alpha?.absoluteDir).toBe(path.join(root, 'packages/alpha'))
    })

    it('reads the pnpm patterns when the root also declares an npm workspaces array', async () => {
      const root = await writeWorkspace({
        'pnpm-workspace.yaml': 'packages:\n  - pnpm-only/*\n',
        'package.json': { name: 'ws-root', version: '0.0.0', workspaces: ['npm-only/*'] },
        'pnpm-only/alpha/package.json': { name: '@fixture/alpha', version: '1.0.0' },
        'npm-only/beta/package.json': { name: '@fixture/beta', version: '1.0.0' },
      })

      expect(await dirs(root)).toEqual(['.', 'pnpm-only/alpha'])
    })

    // The kit forwards the `packages` field unread, so an absent one leaves the library on its own
    // default patterns, `['.', '**']` — every nested package, not the root alone.
    it('leaves the library on its default patterns when the packages field is absent', async () => {
      const root = await writeWorkspace({
        'pnpm-workspace.yaml': 'catalog:\n  chalk: ^5.0.0\n',
        'package.json': { name: 'ws-root', version: '0.0.0' },
        'packages/alpha/package.json': { name: '@fixture/alpha', version: '1.0.0' },
      })

      expect(await dirs(root)).toEqual(['.', 'packages/alpha'])
    })

    it('honours an exclusion pattern, which it forwards unread', async () => {
      const root = await writeWorkspace({
        'pnpm-workspace.yaml': 'packages:\n  - packages/*\n  - "!packages/ignored"\n',
        'package.json': { name: 'ws-root', version: '0.0.0' },
        'packages/alpha/package.json': { name: '@fixture/alpha', version: '1.0.0' },
        'packages/ignored/package.json': { name: '@fixture/ignored', version: '1.0.0' },
      })

      expect(await dirs(root)).toEqual(['.', 'packages/alpha'])
    })

    it('rejects with the underlying error when pnpm-workspace.yaml is not valid YAML', async () => {
      const root = await writeWorkspace({
        'pnpm-workspace.yaml': 'packages:\n  - "unterminated\n\t\tbad: [\n',
        'package.json': { name: 'ws-root', version: '0.0.0' },
      })

      await expect(enumerateCandidates(root)).rejects.toMatchObject({
        name: 'YAMLException',
        message: expect.stringContaining('double quoted scalar'),
      })
    })

    it('rejects when a member package.json is not valid JSON', async () => {
      const root = await writeWorkspace({
        'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
        'package.json': { name: 'ws-root', version: '0.0.0' },
        'packages/good/package.json': { name: '@fixture/good', version: '1.0.0' },
        'packages/broken/package.json': '{ "name": "@fixture/broken", "version": }',
      })

      await expect(enumerateCandidates(root)).rejects.toMatchObject({
        code: 'ERR_PNPM_JSON_PARSE',
      })
    })

    it('skips a matched directory holding no package.json', async () => {
      const root = await writeWorkspace({
        'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
        'package.json': { name: 'ws-root', version: '0.0.0' },
        'packages/good/package.json': { name: '@fixture/good', version: '1.0.0' },
        'packages/nomanifest/behavior_pack/manifest.json': { header: {} },
      })

      expect(await dirs(root)).toEqual(['.', 'packages/good'])
    })
  })

  describe('npm workspaces', () => {
    it('returns every member and adds the root, which mapWorkspaces never returns', async () => {
      const root = await writeWorkspace({
        'package.json': { name: 'ws-root', version: '0.0.0', workspaces: ['packages/*'] },
        'packages/alpha/package.json': { name: '@fixture/alpha', version: '1.2.3' },
        'packages/beta/package.json': { name: '@fixture/beta', version: '0.1.0' },
      })

      const candidates = await enumerateCandidates(root)

      expect(candidates.map((candidate) => candidate.packageDir).sort()).toEqual([
        '.',
        'packages/alpha',
        'packages/beta',
      ])
      expect(candidates.find((candidate) => candidate.packageDir === 'packages/beta')?.packageJson).toMatchObject({
        name: '@fixture/beta',
        version: '0.1.0',
      })
    })

    it('yields the root alone when the root declares no workspaces array', async () => {
      const root = await writeWorkspace({
        'package.json': { name: 'solo', version: '1.0.0' },
      })

      const candidates = await enumerateCandidates(root)

      expect(candidates).toHaveLength(1)
      expect(candidates[0]?.packageDir).toBe('.')
      expect(candidates[0]?.packageJson).toMatchObject({ name: 'solo' })
    })

    it('yields the root alone for an empty workspaces array', async () => {
      const root = await writeWorkspace({
        'package.json': { name: 'solo', version: '1.0.0', workspaces: [] },
      })

      expect(await dirs(root)).toEqual(['.'])
    })

    it('yields one candidate for a root its own patterns also match', async () => {
      const root = await writeWorkspace({
        'package.json': { name: 'ws-root', version: '0.0.0', workspaces: ['.', 'packages/*'] },
        'packages/alpha/package.json': { name: '@fixture/alpha', version: '1.0.0' },
      })

      expect(await dirs(root)).toEqual(['.', 'packages/alpha'])
    })

    it('is no candidate for a package the patterns do not match', async () => {
      const root = await writeWorkspace({
        'package.json': { name: 'ws-root', version: '0.0.0', workspaces: ['packages/*'] },
        'packages/alpha/package.json': { name: '@fixture/alpha', version: '1.0.0' },
        'elsewhere/gamma/package.json': { name: '@fixture/gamma', version: '1.0.0' },
        'elsewhere/gamma/behavior_pack/manifest.json': { header: {} },
      })

      expect(await dirs(root)).toEqual(['.', 'packages/alpha'])
    })

    it('rejects with the underlying error when the root package.json is not valid JSON', async () => {
      const root = await writeWorkspace({ 'package.json': '{ "name": "ws-root", }' })

      await expect(enumerateCandidates(root)).rejects.toBeInstanceOf(SyntaxError)
    })

    it('rejects when a member package.json is not valid JSON', async () => {
      const root = await writeWorkspace({
        'package.json': { name: 'ws-root', version: '0.0.0', workspaces: ['packages/*'] },
        'packages/good/package.json': { name: '@fixture/good', version: '1.0.0' },
        'packages/broken/package.json': '{ "name": "@fixture/broken", "version": }',
      })

      await expect(enumerateCandidates(root)).rejects.toMatchObject({ code: 'EJSONPARSE' })
    })

    it('skips a matched directory holding no package.json', async () => {
      const root = await writeWorkspace({
        'package.json': { name: 'ws-root', version: '0.0.0', workspaces: ['packages/*'] },
        'packages/good/package.json': { name: '@fixture/good', version: '1.0.0' },
        'packages/nomanifest/behavior_pack/manifest.json': { header: {} },
      })

      expect(await dirs(root)).toEqual(['.', 'packages/good'])
    })
  })

  it('rejects a root holding neither a pnpm-workspace.yaml nor a package.json', async () => {
    const root = await writeWorkspace({ 'README.md': 'no workspace here' })

    await expect(enumerateCandidates(root)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('enumerates a workspace that has never been installed', async () => {
    const root = await writeWorkspace({
      'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
      'package.json': { name: 'ws-root', version: '0.0.0' },
      'packages/alpha/package.json': { name: '@fixture/alpha', version: '1.0.0' },
    })

    expect(existsSync(path.join(root, 'node_modules'))).toBe(false)
    expect(existsSync(path.join(root, 'pnpm-lock.yaml'))).toBe(false)
    expect(await dirs(root)).toEqual(['.', 'packages/alpha'])
  })

  it('reports every package directory as a POSIX path relative to the workspace root', async () => {
    const root = await writeWorkspace({
      'package.json': { name: 'ws-root', version: '0.0.0', workspaces: ['packages/*'] },
      'packages/mc-pack-1/package.json': { name: 'mc-pack-1', version: '1.0.0' },
    })

    expect(await dirs(root)).toEqual(['.', 'packages/mc-pack-1'])
  })
})
