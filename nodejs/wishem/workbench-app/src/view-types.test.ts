// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validateModel } from '@thrashplay/wishem-core'
import { readModelFolder } from '@thrashplay/wishem-host-nodejs'
import { modelFolder } from '@thrashplay/wishem-workbench'
import { generateViewTypes, VIEW_TYPES_COMMAND } from '../scripts/view-types.js'

const APP_BAR = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const TITLE = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'

describe('generateViewTypes of the workbench', () => {
  let views: string

  beforeEach(() => {
    views = mkdtempSync(join(tmpdir(), 'wishem-views-'))
  })

  afterEach(() => {
    rmSync(views, { recursive: true, force: true })
  })

  it('writes the header of each file with the command of the workbench', async () => {
    writeFileSync(join(views, 'AppBar.view.json'), JSON.stringify({ kind: 'react', componentType: APP_BAR }))
    await generateViewTypes({
      definitions: [{ id: APP_BAR, label: 'AppBar', fields: [{ id: TITLE, label: 'title', type: 'string' }] }],
      views,
    })
    const text = readFileSync(join(views, 'AppBar.view.gen.ts'), 'utf8')
    expect(VIEW_TYPES_COMMAND).toBe('pnpm --filter @thrashplay/wishem-workbench-app generate')
    expect(text).toContain(`// To write this file again: ${VIEW_TYPES_COMMAND}\n`)
  })
})

describe('the generated files of the repository', () => {
  it('are current', async () => {
    const folder = await readModelFolder(modelFolder)
    const validation = validateModel(folder.data)
    if (!validation.ok) {
      throw new Error('the base model is not correct')
    }
    const result = await generateViewTypes({
      definitions: validation.model.definitions,
      views: join(import.meta.dirname, 'views'),
      check: true,
    })
    expect(result.errors).toEqual([])
    expect(result.files.filter((file) => file.status === 'not-current').map((file) => file.file)).toEqual([])
  })
})
