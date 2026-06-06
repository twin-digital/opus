import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'

import { makeSyncMapToArrayAction } from './sync-map-to-array.js'
import type { TransformName } from '../transforms.js'
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
  packageRules: [{ addLabels: ['patched-deps'], matchPackageNames }],
})

const patchedAction = (opts?: { emit?: 'keys' | 'values'; transform?: TransformName; defaultValue?: unknown }) =>
  makeSyncMapToArrayAction({
    source: {
      file: 'pnpm-workspace.yaml',
      pointer: '/patchedDependencies',
      ...(opts?.defaultValue === undefined ? {} : { default: opts.defaultValue }),
    },
    emit: opts?.emit ?? 'keys',
    ...(opts?.transform === undefined ? {} : { transform: opts.transform }),
    target: {
      file: 'renovate.json',
      array: '/packageRules',
      where: { pointer: '/addLabels', contains: 'patched-deps' },
      set: '/matchPackageNames',
    },
  })

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-kit-sync-map-'))
  workspace = { manifest: { name: 'pkg' }, name: 'pkg', path: dir }
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('makeSyncMapToArrayAction', () => {
  it('emits the object keys, applying the package-name transform (scope-aware version strip)', async () => {
    write(
      'pnpm-workspace.yaml',
      "patchedDependencies:\n  ink: patches/ink.patch\n  '@mishieck/ink-titled-box@0.3.0': patches/x.patch\n  lodash-es@4.17.21: patches/y.patch\n",
    )
    writeJson('renovate.json', renovateWith(['stale']))

    const result = await patchedAction({ transform: 'strip-package-version' })(workspace)

    expect(result).toEqual({ result: 'ok', changedFiles: ['renovate.json'] })
    expect(readJson('renovate.json')).toEqual(renovateWith(['ink', '@mishieck/ink-titled-box', 'lodash-es']))
  })

  it('emits the object keys verbatim when no transform is given', async () => {
    write('pnpm-workspace.yaml', "patchedDependencies:\n  ink: a.patch\n  'pkg@1.0.0': b.patch\n")
    writeJson('renovate.json', renovateWith(['stale']))

    await patchedAction()(workspace)

    expect((readJson('renovate.json') as ReturnType<typeof renovateWith>).packageRules[0].matchPackageNames).toEqual([
      'ink',
      'pkg@1.0.0',
    ])
  })

  it('emits the object values when emit is "values"', async () => {
    write('pnpm-workspace.yaml', 'patchedDependencies:\n  ink: patches/ink.patch\n')
    writeJson('renovate.json', renovateWith(['stale']))

    await patchedAction({ emit: 'values' })(workspace)

    expect((readJson('renovate.json') as ReturnType<typeof renovateWith>).packageRules[0].matchPackageNames).toEqual([
      'patches/ink.patch',
    ])
  })

  it('is idempotent — skips when the target already matches', async () => {
    write('pnpm-workspace.yaml', "patchedDependencies:\n  '@mishieck/ink-titled-box@0.3.0': x.patch\n")
    writeJson('renovate.json', renovateWith(['@mishieck/ink-titled-box']))

    expect(await patchedAction({ transform: 'strip-package-version' })(workspace)).toEqual({ result: 'skipped' })
  })

  it('uses an empty-object default → empty array', async () => {
    write('pnpm-workspace.yaml', 'packages:\n  - nodejs/*\n')
    writeJson('renovate.json', renovateWith(['stale']))

    await patchedAction({ transform: 'strip-package-version', defaultValue: {} })(workspace)

    expect((readJson('renovate.json') as ReturnType<typeof renovateWith>).packageRules[0].matchPackageNames).toEqual([])
  })

  it('throws when the source value is not an object', async () => {
    write('pnpm-workspace.yaml', 'patchedDependencies:\n  - ink\n')
    writeJson('renovate.json', renovateWith(['stale']))

    await expect(patchedAction()(workspace)).rejects.toThrow(/expected an object/)
  })
})
