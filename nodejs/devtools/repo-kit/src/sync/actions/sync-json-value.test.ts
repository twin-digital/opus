import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'

import { makeSyncJsonValueAction } from './sync-json-value.js'
import type { PackageMeta } from '../../workspace/package-meta.js'

let dir: string
let workspace: PackageMeta

const write = (file: string, content: string) => {
  fs.writeFileSync(path.join(dir, file), content)
}
const writeJson = (file: string, value: unknown) => {
  write(file, `${JSON.stringify(value, null, 2)}\n`)
}
const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))

const renovateWith = (matchPackageNames: string[]) => ({
  packageRules: [
    { matchManagers: ['nvm'], enabled: false },
    { addLabels: ['build-scripts'], matchPackageNames },
  ],
})

const buildScriptsAction = (defaultValue?: unknown) =>
  makeSyncJsonValueAction({
    source: {
      file: 'pnpm-workspace.yaml',
      pointer: '/onlyBuiltDependencies',
      ...(defaultValue === undefined ? {} : { default: defaultValue }),
    },
    target: {
      file: 'renovate.json',
      array: '/packageRules',
      where: { pointer: '/addLabels', contains: 'build-scripts' },
      set: '/matchPackageNames',
    },
  })

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-kit-sync-json-'))
  workspace = { manifest: { name: 'pkg' }, name: 'pkg', path: dir }
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('makeSyncJsonValueAction', () => {
  it('copies a YAML array into the predicate-selected element of the target JSON', async () => {
    write('pnpm-workspace.yaml', 'onlyBuiltDependencies:\n  - esbuild\n  - serverless\n')
    writeJson('renovate.json', renovateWith(['stale']))

    const result = await buildScriptsAction().call(null, workspace)

    expect(result).toEqual({ result: 'ok', changedFiles: ['renovate.json'] })
    expect(readJson('renovate.json')).toEqual(renovateWith(['esbuild', 'serverless']))
  })

  it('is idempotent — skips when the target already matches the source', async () => {
    write('pnpm-workspace.yaml', 'onlyBuiltDependencies:\n  - esbuild\n')
    writeJson('renovate.json', renovateWith(['esbuild']))

    expect(await buildScriptsAction()(workspace)).toEqual({ result: 'skipped' })
  })

  it('reads from a JSON source as well as YAML', async () => {
    writeJson('pnpm-workspace.yaml', { onlyBuiltDependencies: ['esbuild'] })
    writeJson('renovate.json', renovateWith(['stale']))

    await buildScriptsAction()(workspace)

    expect((readJson('renovate.json') as ReturnType<typeof renovateWith>).packageRules[1].matchPackageNames).toEqual([
      'esbuild',
    ])
  })

  it('uses the default when the source pointer resolves to nothing', async () => {
    write('pnpm-workspace.yaml', 'packages:\n  - nodejs/*\n')
    writeJson('renovate.json', renovateWith(['stale']))

    await buildScriptsAction([])(workspace)

    expect((readJson('renovate.json') as ReturnType<typeof renovateWith>).packageRules[1].matchPackageNames).toEqual([])
  })

  it('throws when the source is missing and no default is provided', async () => {
    write('pnpm-workspace.yaml', 'packages:\n  - nodejs/*\n')
    writeJson('renovate.json', renovateWith(['stale']))

    await expect(buildScriptsAction()(workspace)).rejects.toThrow(/no value at/)
  })

  it('throws when no target element matches the predicate (does not silently no-op)', async () => {
    write('pnpm-workspace.yaml', 'onlyBuiltDependencies:\n  - esbuild\n')
    writeJson('renovate.json', { packageRules: [{ matchManagers: ['nvm'] }] })

    await expect(buildScriptsAction()(workspace)).rejects.toThrow()
  })
})

describe('makeSyncJsonValueAction — object-pointer target', () => {
  const descriptionAction = () =>
    makeSyncJsonValueAction({
      source: { file: 'package.json', pointer: '/description' },
      target: { file: 'pack/manifest.json', pointer: '/header/description' },
    })

  beforeEach(() => {
    fs.mkdirSync(path.join(dir, 'pack'))
    writeJson('package.json', { name: '@twin-digital/village-guard', description: 'Guards villagers.' })
  })

  it('writes a scalar value into an object field addressed by a JSON Pointer', async () => {
    writeJson('pack/manifest.json', { header: { name: 'village-guard', description: 'stale' } })

    const result = await descriptionAction()(workspace)

    expect(result).toEqual({ result: 'ok', changedFiles: ['pack/manifest.json'] })
    expect(readJson('pack/manifest.json')).toEqual({
      header: { name: 'village-guard', description: 'Guards villagers.' },
    })
  })

  it('is idempotent — skips when the field already matches the source', async () => {
    writeJson('pack/manifest.json', { header: { name: 'village-guard', description: 'Guards villagers.' } })

    expect(await descriptionAction()(workspace)).toEqual({ result: 'skipped' })
  })

  it('applies the strip-scope transform before writing (package name -> bare manifest name)', async () => {
    writeJson('pack/manifest.json', { header: { name: 'stale', description: 'Guards villagers.' } })

    const result = await makeSyncJsonValueAction({
      source: { file: 'package.json', pointer: '/name' },
      transform: 'strip-scope',
      target: { file: 'pack/manifest.json', pointer: '/header/name' },
    })(workspace)

    expect(result).toEqual({ result: 'ok', changedFiles: ['pack/manifest.json'] })
    expect((readJson('pack/manifest.json') as { header: { name: string } }).header.name).toBe('village-guard')
  })

  it('throws on an unknown transform name', async () => {
    writeJson('pack/manifest.json', { header: { name: 'x' } })

    await expect(
      makeSyncJsonValueAction({
        source: { file: 'package.json', pointer: '/name' },
        transform: 'no-such-transform',
        target: { file: 'pack/manifest.json', pointer: '/header/name' },
      })(workspace),
    ).rejects.toThrow(/unknown transform/)
  })

  it('throws when a transform is applied to a non-string value', async () => {
    writeJson('package.json', { name: '@twin-digital/village-guard', version: [0, 1, 0] })
    writeJson('pack/manifest.json', { header: {} })

    await expect(
      makeSyncJsonValueAction({
        source: { file: 'package.json', pointer: '/version' },
        transform: 'strip-scope',
        target: { file: 'pack/manifest.json', pointer: '/header/version' },
      })(workspace),
    ).rejects.toThrow(/requires a string value/)
  })
})
