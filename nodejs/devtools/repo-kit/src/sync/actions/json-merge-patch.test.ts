import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'

import { makeJsonMergePatchAction } from './json-merge-patch.js'
import type { PackageMeta } from '../../workspace/package-meta.js'

let dir: string
let workspace: PackageMeta

const writeJson = (file: string, value: unknown) => {
  fs.writeFileSync(path.join(dir, file), `${JSON.stringify(value, null, 2)}\n`)
}
const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-kit-merge-'))
  workspace = { manifest: { name: 'pkg' }, name: 'pkg', path: dir }
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('makeJsonMergePatchAction', () => {
  it('deep-merges the YAML patch into the target file', async () => {
    writeJson('package.json', { name: 'pkg', scripts: { build: 'build' } })
    const action = makeJsonMergePatchAction({
      file: 'package.json',
      patch: 'scripts:\n  test: vitest run\n',
    })

    const result = await action(workspace)

    expect(result).toEqual({ result: 'ok', changedFiles: ['package.json'] })
    expect(readJson('package.json')).toEqual({
      name: 'pkg',
      scripts: { build: 'build', test: 'vitest run' },
    })
  })

  it('removes keys when the patch sets them to null (merge-patch semantics)', async () => {
    writeJson('package.json', { name: 'pkg', exports: { '.': { require: './x.js' } } })
    const action = makeJsonMergePatchAction({
      file: 'package.json',
      patch: 'exports:\n  .:\n    require: null\n',
    })

    await action(workspace)

    // the now-empty exports['.'] object is pruned by removeEmptyValues
    expect(readJson('package.json')).toEqual({ name: 'pkg' })
  })

  it('skips when the patch produces no change', async () => {
    writeJson('package.json', { name: 'pkg', scripts: { build: 'build' } })
    const action = makeJsonMergePatchAction({ file: 'package.json', patch: 'scripts:\n  build: build\n' })

    expect(await action(workspace)).toEqual({ result: 'skipped' })
  })
})
