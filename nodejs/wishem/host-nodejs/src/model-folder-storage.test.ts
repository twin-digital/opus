import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createStore, storeInputs, validateModel } from '@thrashplay/wishem-core'
import type { Model } from '@thrashplay/wishem-core'
import { createHub } from '@thrashplay/wishem-hub'
import type { Hub, Port } from '@thrashplay/wishem-hub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachModelFolderStorage, FILES_ID, FILES_WRITER_ID } from './model-folder-storage.js'
import type { ModelFolderStorage } from './model-folder-storage.js'
import { readModelFolder } from './read-model-folder.js'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rename: vi.fn(actual.rename), writeFile: vi.fn(actual.writeFile) }
})

vi.mock('./read-model-folder.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./read-model-folder.js')>()
  return { ...actual, readModelFolder: vi.fn(actual.readModelFolder) }
})

const actualRead = (await vi.importActual<typeof import('./read-model-folder.js')>('./read-model-folder.js'))
  .readModelFolder
const actualWriteFile = (await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')).writeFile

const CT = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const FLD = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const E = 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2'

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const eventually = async (check: () => boolean | Promise<boolean>, ms = 2000) => {
  const deadline = Date.now() + ms
  while (!(await check())) {
    if (Date.now() > deadline) {
      throw new Error('timeout')
    }
    await pause(20)
  }
}

const definition = (label: string) => ({ id: CT, label, fields: [{ id: FLD, label: 'title', type: 'string' }] })
const state = (title: string) => ({ entities: [{ id: E, components: { [CT]: { [FLD]: title } } }] })

describe('the storage subsystem for files', () => {
  let folder: string
  let lines: string[]
  let hub: Hub
  let storage: ModelFolderStorage
  let client: Port
  const inputs = storeInputs()

  const store = () => hub.read().store as Model
  const title = () => store().entities[0]?.components[CT]?.[FLD]
  const stateText = () => readFile(path.join(folder, 'state.json'), 'utf8')
  const stateFile = async () => JSON.parse(await stateText()) as { entities: Model['entities'] }
  const fileTitle = async () => (await stateFile()).entities[0]?.components[CT]?.[FLD]
  const writes = () => vi.mocked(rename).mock.calls.length
  const storeInputsRecorded = () => hub.record().filter((input) => input.source === FILES_ID)
  const setTitle = (value: string) =>
    client.submit(inputs.setField({ entity: E, componentType: CT, field: FLD, value }))

  beforeEach(async () => {
    lines = []
    vi.mocked(rename).mockClear()
    vi.mocked(readModelFolder).mockReset()
    vi.mocked(readModelFolder).mockImplementation(actualRead)
    folder = await mkdtemp(path.join(tmpdir(), 'wishem-storage-'))
    await mkdir(path.join(folder, 'definitions'))
    await writeFile(path.join(folder, 'definitions', `${CT}.json`), JSON.stringify(definition('AppBar')))
    await writeFile(path.join(folder, 'state.json'), JSON.stringify(state('Wishem')))

    const result = validateModel((await actualRead(folder)).data)
    if (!result.ok) {
      throw new Error('the fixture is not correct')
    }
    hub = createHub({ subsystems: [createStore({ model: result.model })] })
    storage = attachModelFolderStorage({ folder, hub, first: result.model, log: (line) => lines.push(line) })
    hub.start()
    storage.watch()
    client = hub.attach({ id: 'client', kind: 'input' })
    await pause(150)
  })

  afterEach(async () => {
    await storage.close()
    if (hub.status === 'running') {
      hub.stop()
    }
    vi.mocked(readModelFolder).mockImplementation(actualRead)
    await rm(folder, { recursive: true, force: true })
  })

  describe('The store follows the model files', () => {
    it('follows a hand edit to the authored state', async () => {
      await writeFile(path.join(folder, 'state.json'), JSON.stringify(state('Wishem workbench')))
      await eventually(() => title() === 'Wishem workbench')
    })

    it('follows a hand edit to a definition', async () => {
      await writeFile(path.join(folder, 'definitions', `${CT}.json`), JSON.stringify(definition('Bar')))
      await eventually(() => store().definitions[0]?.label === 'Bar')
    })

    it('follows a new definition file', async () => {
      const other = 'ct_7a1c2d3e-4b5f-4a6b-8c7d-9e0f1a2b3c4d'
      await writeFile(
        path.join(folder, 'definitions', `${other}.json`),
        JSON.stringify({ id: other, label: 'Card', fields: [] }),
      )
      await eventually(() => store().definitions.length === 2)
    })

    it('follows a save through a temporary file', async () => {
      await writeFile(path.join(folder, 'state.json.tmp'), JSON.stringify(state('Through temp')))
      await rename(path.join(folder, 'state.json.tmp'), path.join(folder, 'state.json'))
      await eventually(() => title() === 'Through temp')
    })

    it('records one replace-model input with the source files', async () => {
      await writeFile(path.join(folder, 'state.json'), JSON.stringify(state('Edited')))
      await eventually(() => title() === 'Edited')
      await pause(200)
      expect(storeInputsRecorded().map(({ type }) => type)).toEqual(['store/replace-model'])
      expect(writes()).toBe(0)
    })
  })

  describe('The last correct model stays', () => {
    it('keeps the model for a file that is saved in part', async () => {
      const before = store()
      const count = hub.record().length
      await writeFile(path.join(folder, 'state.json'), '{ "entities": [')
      await eventually(() => lines.includes('wishem: the last correct model stays'))
      expect(lines.some((line) => line.startsWith('wishem: problem in state.json'))).toBe(true)
      expect(store()).toBe(before)
      expect(hub.record()).toHaveLength(count)
    })

    it('follows the file when it is corrected', async () => {
      await writeFile(path.join(folder, 'state.json'), '{ "entities": [')
      await eventually(() => lines.includes('wishem: the last correct model stays'))
      await writeFile(path.join(folder, 'state.json'), JSON.stringify(state('Fixed')))
      await eventually(() => title() === 'Fixed')
      expect(lines).toContain('wishem: the model is correct: 1 component type, 1 entity')
    })
  })

  describe('A change of the entities is written to state.json', () => {
    it('writes an input that sets a title, and a new read gives the same model', async () => {
      expect((await setTitle('Hello')).ok).toBe(true)
      await eventually(async () => (await fileTitle()) === 'Hello')
      const text = await stateText()
      expect(text).toBe(`${JSON.stringify({ entities: store().entities }, null, 2)}\n`)
      const reread = validateModel((await actualRead(folder)).data)
      expect(reread.ok && reread.model).toEqual(store())
    })

    it('holds the value of the second of two inputs', async () => {
      const first = setTitle('One')
      const second = setTitle('Two')
      await Promise.all([first, second])
      await eventually(async () => (await fileTitle()) === 'Two')
      await pause(200)
      expect(await fileTitle()).toBe('Two')
    })

    it('does not write for a change of a definition only', async () => {
      const model = { definitions: [definition('Renamed')], entities: store().entities }
      expect((await client.submit(inputs.replaceModel(model as Model))).ok).toBe(true)
      await pause(300)
      expect(store().definitions[0]?.label).toBe('Renamed')
      expect(writes()).toBe(0)
      expect(await stateText()).toBe(JSON.stringify(state('Wishem')))
    })

    it('writes an input that arrives directly before the stop', async () => {
      await setTitle('Last words')
      hub.stop()
      await storage.close()
      expect(await fileTitle()).toBe('Last words')
    })
  })

  describe('The storage subsystem writes no definition file', () => {
    it('leaves the definitions folder as it is', async () => {
      const before = await readFile(path.join(folder, 'definitions', `${CT}.json`), 'utf8')
      const model = { definitions: [definition('Other label')], entities: store().entities }
      await client.submit(inputs.replaceModel(model as Model))
      await setTitle('Also a write')
      await eventually(async () => (await fileTitle()) === 'Also a write')
      await pause(200)
      expect(await readdir(path.join(folder, 'definitions'))).toEqual([`${CT}.json`])
      expect(await readFile(path.join(folder, 'definitions', `${CT}.json`), 'utf8')).toBe(before)
    })
  })

  describe('A write of the model folder does not come back as a change', () => {
    it('sees the write and does not write again or send a replace-model input', async () => {
      await setTitle('Hello')
      await eventually(async () => (await fileTitle()) === 'Hello')
      await pause(400)
      expect(writes()).toBe(1)
      const types = hub.record().map(({ type }) => type)
      expect(types).toEqual(['store/set-field'])
    })

    it('sends no input for a file that is saved with no change', async () => {
      const count = hub.record().length
      await writeFile(path.join(folder, 'state.json'), await stateText())
      await pause(300)
      expect(hub.record()).toHaveLength(count)
    })

    it('keeps the same part and writes nothing for a full model that is equal', async () => {
      const before = store()
      const result = await client.submit(inputs.replaceModel(JSON.parse(JSON.stringify(before)) as Model))
      expect(result.ok).toBe(true)
      await pause(300)
      expect(hub.record().map(({ type }) => type)).toEqual(['store/replace-model'])
      expect(store()).toBe(before)
      expect(writes()).toBe(0)
    })

    it('keeps the new title for a read that started before an input', async () => {
      let release: () => void = () => undefined
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      vi.mocked(readModelFolder).mockImplementation(async (target) => {
        const result = await actualRead(target)
        await gate
        return result
      })
      await writeFile(path.join(folder, 'state.json'), await stateText())
      await eventually(() => vi.mocked(readModelFolder).mock.calls.length > 0)
      await pause(50)
      await setTitle('New title')
      release()
      await eventually(async () => (await fileTitle()) === 'New title')
      await pause(200)
      expect(title()).toBe('New title')
      expect(hub.record().map(({ type }) => type)).toEqual(['store/set-field'])
    })
  })

  describe('The process reports a write that fails', () => {
    it('prints a line that names state.json, and keeps the state', async () => {
      vi.mocked(writeFile).mockRejectedValueOnce(new Error('EACCES: permission denied'))
      await setTitle('Unwritten')
      await eventually(() => lines.some((line) => line.includes('cannot write state.json')))
      expect(lines).toContain('wishem: cannot write state.json: EACCES: permission denied')
      expect(title()).toBe('Unwritten')
      vi.mocked(writeFile).mockImplementation(actualWriteFile)
      await setTitle('Written')
      await eventually(async () => (await fileTitle()) === 'Written')
    })
  })

  it('attaches the subsystems files and files-writer', () => {
    expect(() => hub.attach({ id: FILES_ID, kind: 'input' })).toThrow()
    expect(() => hub.attach({ id: FILES_WRITER_ID, kind: 'output' })).toThrow()
  })
})
