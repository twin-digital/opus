import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'

import { makeJsonPatchAction } from './json-patch.js'
import type { PackageMeta } from '../../workspace/package-meta.js'

let dir: string
let workspace: PackageMeta

const writeJson = (file: string, value: unknown) => {
  fs.writeFileSync(path.join(dir, file), `${JSON.stringify(value, null, 2)}\n`)
}
const readJson = (file: string): unknown => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'))

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-kit-patch-'))
  workspace = { manifest: { name: 'pkg' }, name: 'pkg', path: dir }
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('makeJsonPatchAction', () => {
  it('applies the extended appendIfMissing operation', async () => {
    writeJson('package.json', { name: 'pkg', files: ['dist'] })
    const action = makeJsonPatchAction({
      file: 'package.json',
      patch:
        '- opx: appendIfMissing\n  path: /files\n  value: dist\n- opx: appendIfMissing\n  path: /files\n  value: public\n',
    })

    const result = await action(workspace)

    expect(result).toEqual({ result: 'ok', changedFiles: ['package.json'] })
    // "dist" already present -> not duplicated; "public" appended
    expect(readJson('package.json')).toEqual({ name: 'pkg', files: ['dist', 'public'] })
  })

  it('reorders map keys via the reorderMapKeys operation', async () => {
    writeJson('config.json', { entry: { import: './x.js', types: './x.d.ts', source: './x.ts' } })
    const action = makeJsonPatchAction({
      file: 'config.json',
      patch: '- opx: reorderMapKeys\n  path: /entry\n  value:\n    - source\n    - types\n    - import\n',
    })

    await action(workspace)

    expect(Object.keys((readJson('config.json') as { entry: object }).entry)).toEqual(['source', 'types', 'import'])
  })

  it('skips when the patch produces no change', async () => {
    writeJson('package.json', { name: 'pkg', files: ['dist'] })
    const action = makeJsonPatchAction({
      file: 'package.json',
      patch: '- opx: appendIfMissing\n  path: /files\n  value: dist\n',
    })

    expect(await action(workspace)).toEqual({ result: 'skipped' })
  })
})
