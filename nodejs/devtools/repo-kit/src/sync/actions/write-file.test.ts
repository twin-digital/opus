import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it, expect } from 'vitest'

import { makeWriteFileAction } from './write-file.js'
import type { PackageMeta } from '../../workspace/package-meta.js'

let dir: string
let workspace: PackageMeta

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-kit-write-'))
  workspace = { manifest: { name: 'pkg' }, name: 'pkg', path: dir }
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('makeWriteFileAction', () => {
  it('creates the file when it does not exist', async () => {
    const action = makeWriteFileAction({ file: '.nvmrc', content: 'lts/krypton\n' })

    const result = await action(workspace)

    expect(result).toEqual({ result: 'ok', changedFiles: ['.nvmrc'] })
    expect(fs.readFileSync(path.join(dir, '.nvmrc'), 'utf-8')).toBe('lts/krypton\n')
  })

  it('skips when the existing content is byte-identical', async () => {
    fs.writeFileSync(path.join(dir, '.nvmrc'), 'lts/krypton\n')
    const action = makeWriteFileAction({ file: '.nvmrc', content: 'lts/krypton\n' })

    expect(await action(workspace)).toEqual({ result: 'skipped' })
  })

  it('overwrites when the existing content differs', async () => {
    fs.writeFileSync(path.join(dir, '.nvmrc'), 'lts/iron\n')
    const action = makeWriteFileAction({ file: '.nvmrc', content: 'lts/krypton\n' })

    const result = await action(workspace)

    expect(result).toEqual({ result: 'ok', changedFiles: ['.nvmrc'] })
    expect(fs.readFileSync(path.join(dir, '.nvmrc'), 'utf-8')).toBe('lts/krypton\n')
  })
})
