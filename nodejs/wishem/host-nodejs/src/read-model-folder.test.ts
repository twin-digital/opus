import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validateModel } from '@thrashplay/wishem-core'
import { readModelFolder, withSource } from './read-model-folder.js'

const CT = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const FLD = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const E = 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2'

const definition = (type = 'string') => ({ id: CT, label: 'AppBar', fields: [{ id: FLD, label: 'title', type }] })
const state = { entities: [{ id: E, components: { [CT]: { [FLD]: 'Wishem' } } }] }

describe('readModelFolder', () => {
  let folder: string

  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), 'wishem-folder-'))
  })

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true })
  })

  const write = async (name: string, content: unknown) => {
    await mkdir(path.dirname(path.join(folder, name)), { recursive: true })
    await writeFile(path.join(folder, name), typeof content === 'string' ? content : JSON.stringify(content))
  }

  it('reads one component type and one entity', async () => {
    await write(`definitions/${CT}.json`, definition())
    await write('state.json', state)
    const result = await readModelFolder(folder)
    expect(result.problems).toEqual([])
    expect(result.data).toEqual({ definitions: [definition()], entities: state.entities })
  })

  it('gives a problem that names state.json when the file is missing', async () => {
    const result = await readModelFolder(folder)
    expect(result.data).toBeUndefined()
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0]?.source).toBe('state.json')
    expect(result.problems[0]?.severity).toBe('error')
  })

  it('gives no component types and no problem when definitions is absent or empty', async () => {
    await write('state.json', { entities: [] })
    expect((await readModelFolder(folder)).data).toEqual({ definitions: [], entities: [] })
    await mkdir(path.join(folder, 'definitions'))
    const result = await readModelFolder(folder)
    expect(result.data).toEqual({ definitions: [], entities: [] })
    expect(result.problems).toEqual([])
  })

  it('ignores files that do not end in .json', async () => {
    await write('state.json', { entities: [] })
    await write('definitions/notes.txt', 'not json')
    const result = await readModelFolder(folder)
    expect(result.problems).toEqual([])
    expect(result.data).toEqual({ definitions: [], entities: [] })
  })

  it('gives a problem that names the path when the folder does not exist', async () => {
    const missing = path.join(folder, 'nope')
    const result = await readModelFolder(missing)
    expect(result.data).toBeUndefined()
    expect(result.problems[0]?.source).toBe(missing)
    expect(result.problems[0]?.message).toContain(missing)
  })

  it('takes the ID from the file content, not the file name', async () => {
    await write('definitions/app-bar.json', definition())
    await write('state.json', { entities: [] })
    const result = await readModelFolder(folder)
    expect((result.data as { definitions: { id: string }[] }).definitions[0]?.id).toBe(CT)
  })

  it('gives a problem that names state.json for text that is not valid JSON', async () => {
    await write('state.json', '{ "entities": [')
    const result = await readModelFolder(folder)
    expect(result.data).toBeUndefined()
    expect(result.problems[0]?.source).toBe('state.json')
    expect(result.problems[0]?.message).toContain('not valid JSON')
  })

  it('gives a problem that names a definition file that is not valid JSON', async () => {
    await write('state.json', state)
    await write('definitions/bad.json', '{')
    const result = await readModelFolder(folder)
    expect(result.data).toBeUndefined()
    expect(result.problems[0]?.source).toBe(path.join('definitions', 'bad.json'))
  })

  it('names the definition file for a problem in a definition', async () => {
    await write(`definitions/${CT}.json`, definition('number'))
    await write('state.json', state)
    const result = await readModelFolder(folder)
    const validation = validateModel(result.data)
    expect(validation.ok).toBe(false)
    if (!validation.ok) {
      const problems = withSource(validation.problems, result)
      expect(problems.some((problem) => problem.source === path.join('definitions', `${CT}.json`))).toBe(true)
    }
  })

  it('names state.json for a component type that is not defined', async () => {
    await write('state.json', state)
    const result = await readModelFolder(folder)
    const validation = validateModel(result.data)
    expect(validation.ok).toBe(false)
    if (!validation.ok) {
      const problems = withSource(validation.problems, result)
      expect(problems.some((problem) => problem.source === 'state.json')).toBe(true)
    }
  })
})
