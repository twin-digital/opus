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

const patchedRenovateWith = (matchPackageNames: string[]) => ({
  packageRules: [{ addLabels: ['patched-deps'], matchPackageNames }],
})

const patchedDepsAction = (defaultValue?: unknown) =>
  makeSyncJsonValueAction({
    source: {
      file: 'pnpm-workspace.yaml',
      pointer: '/patchedDependencies',
      keys: true,
      stripVersion: true,
      ...(defaultValue === undefined ? {} : { default: defaultValue }),
    },
    target: {
      file: 'renovate.json',
      array: '/packageRules',
      where: { pointer: '/addLabels', contains: 'patched-deps' },
      set: '/matchPackageNames',
    },
  })

describe('makeSyncJsonValueAction with keys + stripVersion (patchedDependencies)', () => {
  it('copies object keys as bare package names, stripping the version (scope-aware) and leaving bare names', async () => {
    write(
      'pnpm-workspace.yaml',
      "patchedDependencies:\n  ink: patches/ink.patch\n  '@mishieck/ink-titled-box@0.3.0': patches/x.patch\n  lodash-es@4.17.21: patches/y.patch\n",
    )
    writeJson('renovate.json', patchedRenovateWith(['stale']))

    const result = await patchedDepsAction().call(null, workspace)

    expect(result).toEqual({ result: 'ok', changedFiles: ['renovate.json'] })
    expect(readJson('renovate.json')).toEqual(patchedRenovateWith(['ink', '@mishieck/ink-titled-box', 'lodash-es']))
  })

  it('uses an empty-object default → empty package list', async () => {
    write('pnpm-workspace.yaml', 'packages:\n  - nodejs/*\n')
    writeJson('renovate.json', patchedRenovateWith(['stale']))

    await patchedDepsAction({})(workspace)

    expect(
      (readJson('renovate.json') as ReturnType<typeof patchedRenovateWith>).packageRules[0].matchPackageNames,
    ).toEqual([])
  })

  it("throws when 'keys' is applied to a non-object value", async () => {
    write('pnpm-workspace.yaml', 'patchedDependencies:\n  - ink\n')
    writeJson('renovate.json', patchedRenovateWith(['stale']))

    await expect(patchedDepsAction()(workspace)).rejects.toThrow(/'keys' requires an object/)
  })
})
