import { writeFileSync } from 'node:fs'
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
const CT2 = 'ct_7a1c2d3e-4b5f-4a6b-8c7d-9e0f1a2b3c4d'
const FLD2 = 'fld_1d2e3f40-5a6b-4c7d-8e9f-a0b1c2d3e4f5'
const E2 = 'e_d1e2f3a4-b5c6-4d7e-8f90-a1b2c3d4e5f6'
const isHeld = (line: string) => line.includes('state.json is not written')
const isEqualAgain = (line: string) => line.includes('are equal to the files in definitions again')

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
      expect(hub.record().map(({ source }) => source)).toEqual(['files'])
      expect(writes()).toBe(0)
    })
  })

  describe('The store follows state.json after the process wrote it', () => {
    const statePath = () => path.join(folder, 'state.json')
    const processWrites = async (value: string) => {
      const before = writes()
      expect((await setTitle(value)).ok).toBe(true)
      await eventually(() => writes() > before)
      await eventually(async () => (await fileTitle()) === value)
      await pause(200)
    }
    const editInPlace = (value: string) => writeFile(statePath(), JSON.stringify(state(value)))
    const editByReplace = async (value: string) => {
      await writeFile(`${statePath()}.edit`, JSON.stringify(state(value)))
      await rename(`${statePath()}.edit`, statePath())
    }

    it('follows a write in place after one write of the process', async () => {
      await processWrites('Hello')
      await editInPlace('By hand')
      await eventually(() => title() === 'By hand')
    })

    it('follows a write in place after two writes of the process', async () => {
      await processWrites('One')
      await processWrites('Two')
      await editInPlace('By hand')
      await eventually(() => title() === 'By hand')
    })

    it('follows a replace of the file after a write of the process', async () => {
      await processWrites('Hello')
      await editByReplace('Replaced')
      await eventually(() => title() === 'Replaced')
    })

    it('follows a replace of the file, and then a write in place', async () => {
      await editByReplace('Replaced')
      await eventually(() => title() === 'Replaced')
      await editInPlace('In place')
      await eventually(() => title() === 'In place')
    })

    it('does not read again for the write of the process', async () => {
      await processWrites('Hello')
      expect(writes()).toBe(1)
      expect(storeInputsRecorded()).toHaveLength(0)
    })

    it('follows a state.json that is removed and made again', async () => {
      await rm(statePath())
      await pause(200)
      expect(title()).toBe('Wishem')
      await editInPlace('Back')
      await eventually(() => title() === 'Back')
      await processWrites('After')
      await editInPlace('By hand')
      await eventually(() => title() === 'By hand')
    })

    it('follows a definitions folder that is removed and made again', async () => {
      const file = path.join(folder, 'definitions', `${CT}.json`)
      await rm(path.join(folder, 'definitions'), { recursive: true })
      await mkdir(path.join(folder, 'definitions'))
      await writeFile(file, JSON.stringify(definition('Bar')))
      await eventually(() => store().definitions[0]?.label === 'Bar')
      await writeFile(file, JSON.stringify(definition('Baz')))
      await eventually(() => store().definitions[0]?.label === 'Baz')
    })

    it('follows a definition file after a write of the process', async () => {
      await processWrites('Hello')
      await writeFile(path.join(folder, 'definitions', `${CT}.json`), JSON.stringify(definition('Bar')))
      await eventually(() => store().definitions[0]?.label === 'Bar')
    })
  })

  describe('The process prints the warnings of the model', () => {
    const other = 'ct_7a1c2d3e-4b5f-4a6b-8c7d-9e0f1a2b3c4d'
    const warnings = () => lines.filter((line) => line.includes('warning')).length

    it('prints a warning for two component types with the same label', async () => {
      await writeFile(
        path.join(folder, 'definitions', 'other.json'),
        JSON.stringify({ ...definition('AppBar'), id: other }),
      )
      await eventually(() => warnings() === 1)
    })

    it('prints one warning for a burst of writes', async () => {
      await writeFile(
        path.join(folder, 'definitions', 'other.json'),
        JSON.stringify({ ...definition('AppBar'), id: other }),
      )
      await eventually(() => warnings() === 1)
      for (let index = 0; index < 8; index++) {
        writeFileSync(path.join(folder, 'state.json'), JSON.stringify(state(`Burst ${String(index)}`)))
      }
      await eventually(() => title() === 'Burst 7')
      await pause(300)
      expect(warnings()).toBe(2)
    })
  })

  describe('The report of a correct model', () => {
    it('says that the model is correct only after a problem, and once', async () => {
      await writeFile(path.join(folder, 'state.json'), JSON.stringify(state('One')))
      await eventually(() => title() === 'One')
      await writeFile(path.join(folder, 'state.json'), '{')
      await eventually(() => lines.some((line) => line.includes('problem in state.json')))
      expect(lines.some((line) => line.includes('the model is correct'))).toBe(false)
      await writeFile(path.join(folder, 'state.json'), JSON.stringify(state('Two')))
      await eventually(() => lines.filter((line) => line.includes('the model is correct')).length === 1)
      await writeFile(path.join(folder, 'state.json'), JSON.stringify(state('Three')))
      await eventually(() => title() === 'Three')
      await pause(200)
      expect(lines.filter((line) => line.includes('the model is correct'))).toHaveLength(1)
    })
  })

  describe('The last correct model stays', () => {
    it('names state.json for a model that is not correct although the JSON is valid', async () => {
      await writeFile(path.join(folder, 'state.json'), JSON.stringify({ entities: [{ id: 'bad' }] }))
      await eventually(() => lines.includes('wishem: the last correct model stays'))
      expect(lines.some((line) => line.startsWith('wishem: problem in state.json:'))).toBe(true)
      expect(title()).toBe('Wishem')
    })

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
      expect(lines.filter(isHeld)).toHaveLength(1)
    })

    it('writes an input that arrives directly before the stop', async () => {
      await setTitle('Last words')
      hub.stop()
      await storage.close()
      expect(await fileTitle()).toBe('Last words')
    })
  })

  describe('The model folder that the process writes always starts', () => {
    const second = { id: CT2, label: 'Card', fields: [{ id: FLD2, label: 'text', type: 'string' }] }
    const unchanged = async () => {
      await pause(300)
      expect(writes()).toBe(0)
      expect(await stateText()).toBe(JSON.stringify(state('Wishem')))
    }

    it('does not write a new component type with an entity that uses it', async () => {
      const entity = { id: E2, components: { [CT2]: { [FLD2]: 'x' } } }
      const model = { definitions: [definition('AppBar'), second], entities: [...store().entities, entity] }
      expect((await client.submit(inputs.replaceModel(model as Model))).ok).toBe(true)
      await unchanged()
    })

    it('does not write a new component type, then an added entity', async () => {
      const model = { definitions: [definition('AppBar'), second], entities: store().entities }
      expect((await client.submit(inputs.replaceModel(model as Model))).ok).toBe(true)
      const entity = { id: E2, components: { [CT2]: { [FLD2]: 'x' } } }
      expect((await client.submit(inputs.addEntity(entity))).ok).toBe(true)
      await unchanged()
    })

    it('does not write a new field, then a value for it', async () => {
      const extra = { id: FLD2, label: 'text', type: 'string' }
      const changed = { ...definition('AppBar'), fields: [...definition('AppBar').fields, extra] }
      const model = { definitions: [changed], entities: store().entities }
      expect((await client.submit(inputs.replaceModel(model as Model))).ok).toBe(true)
      const result = await client.submit(inputs.setField({ entity: E, componentType: CT, field: FLD2, value: 'x' }))
      expect(result.ok).toBe(true)
      await unchanged()
    })

    it('does not write a removed component type', async () => {
      const entities = [{ id: E, components: {} }]
      expect((await client.submit(inputs.replaceModel({ definitions: [], entities }))).ok).toBe(true)
      await unchanged()
      expect(await readdir(path.join(folder, 'definitions'))).toEqual([`${CT}.json`])
    })
  })

  describe('The process reports definitions that the model folder does not hold', () => {
    it('prints the line one time for two inputs while the definitions differ', async () => {
      const model = { definitions: [definition('Renamed')], entities: store().entities }
      await client.submit(inputs.replaceModel(model as Model))
      await setTitle('Title')
      await pause(300)
      expect(lines.filter(isHeld)).toHaveLength(1)
      expect(lines.filter(isEqualAgain)).toHaveLength(0)
    })

    it('prints the line again for a second difference', async () => {
      const disk = { definitions: [definition('AppBar')], entities: store().entities } as Model
      const renamed = { definitions: [definition('Renamed')], entities: store().entities } as Model
      await client.submit(inputs.replaceModel(renamed))
      await eventually(() => lines.filter(isHeld).length === 1)
      await client.submit(inputs.replaceModel(disk))
      await eventually(() => lines.filter(isEqualAgain).length === 1)
      await client.submit(inputs.replaceModel(renamed))
      await eventually(() => lines.filter(isHeld).length === 2)
      await pause(200)
      expect(lines.filter(isEqualAgain)).toHaveLength(1)
    })
  })

  describe('A person adds the definition file', () => {
    it('writes the entities that wait, with no new input', async () => {
      const second = { id: CT2, label: 'Card', fields: [{ id: FLD2, label: 'text', type: 'string' }] }
      const entity = { id: E2, components: { [CT2]: { [FLD2]: 'x' } } }
      const model = { definitions: [definition('AppBar'), second], entities: [...store().entities, entity] }
      expect((await client.submit(inputs.replaceModel(model as Model))).ok).toBe(true)
      await eventually(() => lines.filter(isHeld).length === 1)
      const recorded = hub.record().length

      await writeFile(path.join(folder, 'definitions', `${CT2}.json`), JSON.stringify(second))
      await eventually(() => lines.filter(isEqualAgain).length === 1)
      await eventually(async () => (await stateFile()).entities.length === 2)

      expect(hub.record()).toHaveLength(recorded)
      const result = validateModel((await readModelFolder(folder)).data)
      expect(result.ok).toBe(true)
      expect(result.ok && result.model.entities).toEqual(store().entities)
    })
  })

  describe('An input puts back the definitions of the disk', () => {
    it('writes the entities that wait', async () => {
      const disk = { definitions: [definition('AppBar')], entities: store().entities } as Model
      await client.submit(inputs.replaceModel({ ...disk, definitions: [definition('Renamed')] } as Model))
      await eventually(() => lines.filter(isHeld).length === 1)
      expect((await setTitle('Waiting')).ok).toBe(true)
      await pause(200)
      expect(await stateText()).toBe(JSON.stringify(state('Wishem')))
      await client.submit(inputs.replaceModel({ definitions: disk.definitions, entities: store().entities }))
      await eventually(() => lines.filter(isEqualAgain).length === 1)
      await eventually(async () => (await fileTitle()) === 'Waiting')
    })
  })

  describe('A read that the store refuses', () => {
    const isLost = (line: string) => line.includes('does not hold the last changes of the store')

    it('does not let the write of an entity without a definition file', async () => {
      const ct3 = 'ct_9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
      const fld3 = 'fld_2c3d4e5f-6a7b-4c8d-9e0f-a1b2c3d4e5f6'
      const e3 = 'e_3d4e5f60-7a8b-4c9d-8e1f-b2c3d4e5f607'
      const third = { id: ct3, label: 'Third', fields: [{ id: fld3, label: 'x', type: 'string' }] }
      const thirdFile = path.join(folder, 'definitions', `${ct3}.json`)
      await writeFile(thirdFile, JSON.stringify(third))
      await eventually(() => store().definitions.length === 2)
      const afterStep2 = await stateText()
      const entity = { id: e3, components: { [ct3]: { [fld3]: 'x' } } }
      const withSecond = [definition('AppBar'), third, { id: CT2, label: 'Card', fields: [] }]
      const held = { definitions: withSecond, entities: [...store().entities, entity] } as Model
      expect((await client.submit(inputs.replaceModel(held))).ok).toBe(true)
      await eventually(() => lines.filter(isHeld).length === 1)

      await rm(thirdFile)
      await eventually(() => lines.includes('wishem: the last correct model stays'))
      await pause(150)

      const equal = { definitions: [definition('AppBar'), third], entities: store().entities } as Model
      expect((await client.submit(inputs.replaceModel(equal))).ok).toBe(true)
      await pause(300)

      expect(await stateText()).toBe(afterStep2)
      expect(lines.filter(isEqualAgain)).toHaveLength(0)
      const reread = validateModel((await actualRead(folder)).data)
      expect(reread.ok).toBe(true)

      await storage.close()
      expect(lines.filter(isLost)).toHaveLength(1)
    })
  })

  describe('The process reports a stop that loses changes', () => {
    const isLost = (line: string) => line.includes('does not hold the last changes of the store')
    const relabel = () =>
      client.submit(inputs.replaceModel({ definitions: [definition('Renamed')], entities: store().entities } as Model))

    it('prints the line one time, also for a second close', async () => {
      const before = await readFile(path.join(folder, 'definitions', `${CT}.json`), 'utf8')
      expect((await relabel()).ok).toBe(true)
      await storage.close()
      await storage.close()
      expect(lines.filter(isLost)).toHaveLength(1)
      expect(await stateText()).toBe(JSON.stringify(state('Wishem')))
      expect(await readdir(path.join(folder, 'definitions'))).toEqual([`${CT}.json`])
      expect(await readFile(path.join(folder, 'definitions', `${CT}.json`), 'utf8')).toBe(before)
    })

    it('prints no line for a title that is written', async () => {
      await setTitle('Title')
      await storage.close()
      expect(await fileTitle()).toBe('Title')
      expect(lines.filter(isLost)).toHaveLength(0)
    })
  })

  describe('The storage subsystem writes no definition file', () => {
    it('leaves the definitions folder as it is', async () => {
      const before = await readFile(path.join(folder, 'definitions', `${CT}.json`), 'utf8')
      const model = { definitions: [definition('Other label')], entities: store().entities }
      await client.submit(inputs.replaceModel(model as Model))
      await setTitle('Not written')
      await pause(300)
      expect(await stateText()).toBe(JSON.stringify(state('Wishem')))
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

    it('keeps a definition that an input changed when only state.json is saved', async () => {
      const renamed = { definitions: [definition('Renamed')], entities: store().entities }
      expect((await client.submit(inputs.replaceModel(renamed as Model))).ok).toBe(true)
      await writeFile(path.join(folder, 'state.json'), JSON.stringify(state('By hand')))
      await eventually(() => title() === 'By hand')
      expect(store().definitions[0]?.label).toBe('Renamed')
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

  describe('the subsystems of the storage', () => {
    it('attaches the subsystems files and files-writer', () => {
      expect(FILES_ID).toBe('files')
      expect(FILES_WRITER_ID).toBe('files-writer')
      expect(() => hub.attach({ id: 'files', kind: 'input' })).toThrow()
      expect(() => hub.attach({ id: 'files-writer', kind: 'output' })).toThrow()
    })

    it('frees both subsystems at close', async () => {
      await storage.close()
      expect(() => {
        hub.attach({ id: 'files', kind: 'input' }).close()
      }).not.toThrow()
      expect(() => {
        hub.attach({ id: 'files-writer', kind: 'output' }).close()
      }).not.toThrow()
    })

    it('frees files when files-writer is already attached', () => {
      const other = createHub({ subsystems: [createStore({ model: store() })] })
      other.attach({ id: 'files-writer', kind: 'output' })
      expect(() => attachModelFolderStorage({ folder, hub: other, first: store(), log: () => undefined })).toThrow()
      expect(() => other.attach({ id: 'files', kind: 'input' })).not.toThrow()
    })
  })
})
