import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { findPackages } from './find-packages.js'

const mocks = vi.hoisted(() => ({
  root: '',
  stdout: '',
}))

vi.mock('execa', () => ({
  execa: () => () => Promise.resolve({ stdout: mocks.stdout }),
}))

vi.mock('./get-workspace-root.js', () => ({
  getWorkspaceRoot: () => Promise.resolve(mocks.root),
}))

const PACKAGE_DIRS = ['nodejs/apps/app', 'nodejs/core-aws/aws-lib', 'nodejs/core/core-lib', 'tooling/scripts']

let root: string

/** Builds `pnpm list -r --depth -1 --json` output for the given entries (root first, as pnpm emits it). */
const listOutput = (entries: { name: string; path: string }[]) => JSON.stringify(entries)

const nameOf = (dir: string) => path.basename(dir)

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'repo-kit-find-packages-')))
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'root' }))
  for (const dir of PACKAGE_DIRS) {
    fs.mkdirSync(path.join(root, dir), { recursive: true })
    fs.writeFileSync(path.join(root, dir, 'package.json'), JSON.stringify({ name: nameOf(dir) }))
  }
  mocks.root = root
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

/** Expected result: every package, sorted by absolute path with code-unit ordering (`core-aws` before `core/`). */
const expectedNames = ['app', 'aws-lib', 'core-lib', 'scripts']

describe('findPackages', () => {
  it('sorts packages by path regardless of the order pnpm emits them', async () => {
    // pnpm 11 orders `core-aws/*` before `core/*`; pnpm 12 orders `core/*` first. Both must yield the same result.
    const orders = [
      ['nodejs/apps/app', 'nodejs/core-aws/aws-lib', 'nodejs/core/core-lib', 'tooling/scripts'],
      ['nodejs/apps/app', 'nodejs/core/core-lib', 'nodejs/core-aws/aws-lib', 'tooling/scripts'],
      ['tooling/scripts', 'nodejs/core/core-lib', 'nodejs/apps/app', 'nodejs/core-aws/aws-lib'],
    ]

    for (const order of orders) {
      mocks.stdout = listOutput([
        { name: 'root', path: root },
        ...order.map((dir) => ({ name: nameOf(dir), path: path.join(root, dir) })),
      ])

      const packages = await findPackages()

      expect(packages.map((pkg) => pkg.name)).toEqual(expectedNames)
      expect(packages.map((pkg) => pkg.manifest.name)).toEqual(expectedNames)
    }
  })

  it('excludes the root even when pnpm reports its path in a non-normalized form', async () => {
    mocks.stdout = listOutput([
      { name: 'root', path: `${root}${path.sep}` },
      ...PACKAGE_DIRS.map((dir) => ({ name: nameOf(dir), path: path.join(root, dir, '.') })),
    ])

    const packages = await findPackages()

    expect(packages.map((pkg) => pkg.name)).toEqual(expectedNames)
    expect(packages.map((pkg) => pkg.path)).toEqual(PACKAGE_DIRS.map((dir) => path.join(root, dir)))
  })

  it('resolves relative package paths against the workspace root', async () => {
    mocks.stdout = listOutput([
      { name: 'root', path: '.' },
      ...PACKAGE_DIRS.map((dir) => ({ name: nameOf(dir), path: dir })),
    ])

    const packages = await findPackages()

    expect(packages.map((pkg) => pkg.path)).toEqual(PACKAGE_DIRS.map((dir) => path.join(root, dir)))
  })

  it('includes the root, with a path equal to the workspace root, when requested', async () => {
    mocks.stdout = listOutput([
      { name: 'root', path: `${root}${path.sep}` },
      ...PACKAGE_DIRS.map((dir) => ({ name: nameOf(dir), path: path.join(root, dir) })),
    ])

    const packages = await findPackages({ includeRoot: true })

    expect(packages.map((pkg) => pkg.name)).toEqual(['root', ...expectedNames])
    expect(packages[0]?.path).toBe(root)
  })
})
