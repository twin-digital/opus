import { EventEmitter } from 'node:events'
import type { watch as watchType } from 'node:fs'
import { watch } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import * as fsp from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createStore, storeInputs, validateModel } from '@thrashplay/wishem-core'
import type { Model } from '@thrashplay/wishem-core'
import { createHub, InputRefusedError } from '@thrashplay/wishem-hub'
import type { Hub, ModelSubsystem, Port } from '@thrashplay/wishem-hub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachModelFolderStorage } from './model-folder-storage.js'
import type { ModelFolderStorage } from './model-folder-storage.js'
import { readModelFolder } from './read-model-folder.js'

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  watch: vi.fn(),
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, rename: vi.fn(actual.rename), writeFile: vi.fn(actual.writeFile), rm: vi.fn(actual.rm) }
})

vi.mock('./read-model-folder.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./read-model-folder.js')>()
  return { ...actual, readModelFolder: vi.fn(actual.readModelFolder) }
})

const actualRead = (await vi.importActual<typeof import('./read-model-folder.js')>('./read-model-folder.js'))
  .readModelFolder
const actualFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')

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

/** A promise that the test settles by hand. */
const deferred = () => {
  let release: () => void = () => undefined
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

/** A watcher that the test controls. */
class FakeWatcher extends EventEmitter {
  readonly close = vi.fn()

  constructor(
    readonly target: string,
    readonly change: (event?: string, name?: string | null) => void,
  ) {
    super()
  }
}

const definition = { id: CT, label: 'AppBar', fields: [{ id: FLD, label: 'title', type: 'string' }] }
const state = (title: string) => ({ entities: [{ id: E, components: { [CT]: { [FLD]: title } } }] })

describe('the storage subsystem with a controlled watcher, reader, and writer', () => {
  let folder: string
  let lines: string[]
  let hub: Hub
  let storage: ModelFolderStorage
  let client: Port
  let watcher: FakeWatcher
  let watchers: FakeWatcher[]
  let first: Model
  const inputs = storeInputs()

  const store = () => hub.read().store as Model
  const title = () => store().entities[0]?.components[CT]?.[FLD]
  const fileTitle = async () =>
    (JSON.parse(await readFile(path.join(folder, 'state.json'), 'utf8')) as ReturnType<typeof state>).entities[0]
      ?.components[CT]?.[FLD]
  const setTitle = (value: string) =>
    client.submit(inputs.setField({ entity: E, componentType: CT, field: FLD, value }))
  const reads = () => vi.mocked(readModelFolder).mock.calls.length
  const renames = () => vi.mocked(fsp.rename).mock.calls.length

  /** The next read ends when the returned function is called. It returns the file content from before the call. */
  const holdNextRead = () => {
    const gate = deferred()
    vi.mocked(readModelFolder).mockImplementationOnce(async (target) => {
      const result = await actualRead(target)
      await gate.promise
      return result
    })
    return gate.release
  }

  /** The next write of a file ends when the returned function is called. */
  const holdNextWrite = () => {
    const gate = deferred()
    vi.mocked(fsp.writeFile).mockImplementationOnce(async (...args: Parameters<typeof writeFile>) => {
      await gate.promise
      return actualFs.writeFile(...args)
    })
    return gate.release
  }

  const start = (customHub?: Hub) => {
    hub = customHub ?? createHub({ subsystems: [createStore({ model: first })] })
    storage = attachModelFolderStorage({ folder, hub, first, log: (line) => lines.push(line) })
    hub.start()
    storage.watch()
    client = hub.attach({ id: 'client', kind: 'input' })
  }

  beforeEach(async () => {
    lines = []
    folder = await mkdtemp(path.join(tmpdir(), 'wishem-storage-'))
    await mkdir(path.join(folder, 'definitions'))
    await writeFile(path.join(folder, 'definitions', `${CT}.json`), JSON.stringify(definition))
    await writeFile(path.join(folder, 'state.json'), JSON.stringify(state('Wishem')))
    const result = validateModel((await actualRead(folder)).data)
    if (!result.ok) {
      throw new Error('the fixture is not correct')
    }
    first = result.model
    vi.mocked(readModelFolder).mockReset()
    vi.mocked(readModelFolder).mockImplementation(actualRead)
    vi.mocked(fsp.writeFile).mockReset()
    vi.mocked(fsp.writeFile).mockImplementation(actualFs.writeFile)
    vi.mocked(fsp.rename).mockReset()
    vi.mocked(fsp.rename).mockImplementation(actualFs.rename)
    vi.mocked(fsp.rm).mockReset()
    vi.mocked(fsp.rm).mockImplementation(actualFs.rm)
    vi.mocked(watch).mockReset()
    watchers = []
    vi.mocked(watch).mockImplementation(((target: string, _options: unknown, listener: () => void) => {
      watcher = new FakeWatcher(target, listener)
      watchers.push(watcher)
      return watcher
    }) as unknown as typeof watchType)
  })

  afterEach(async () => {
    await storage.close()
    if (hub.status === 'running') {
      hub.stop()
    }
    await rm(folder, { recursive: true, force: true })
  })

  it('keeps an input that arrives during a read, although the read ends with the old file', async () => {
    start()
    await pause(150)
    const release = holdNextRead()
    watcher.change()
    await eventually(() => reads() >= 2)
    await setTitle('New title')
    release()
    await eventually(async () => (await fileTitle()) === 'New title')
    expect(title()).toBe('New title')
    expect(hub.record().map(({ type }) => type)).toEqual(['store/set-field'])
  })

  it('makes a read wait for a write, then reads the new file', async () => {
    start()
    await pause(150)
    const release = holdNextWrite()
    await setTitle('A')
    await eventually(() => vi.mocked(fsp.writeFile).mock.calls.length === 1)
    const count = reads()
    await writeFile(path.join(folder, 'definitions', `${CT}.json`), JSON.stringify({ ...definition, label: 'Bar' }))
    watcher.change()
    await pause(150)
    expect(reads()).toBe(count)
    release()
    await eventually(() => store().definitions[0]?.label === 'Bar')
    expect(reads()).toBe(count + 1)
    expect(title()).toBe('A')
  })

  it('makes a write wait for a read', async () => {
    start()
    await pause(150)
    const release = holdNextRead()
    watcher.change()
    await eventually(() => reads() >= 2)
    await setTitle('Queued')
    await pause(100)
    expect(vi.mocked(fsp.writeFile)).not.toHaveBeenCalled()
    release()
    await eventually(async () => (await fileTitle()) === 'Queued')
    expect(vi.mocked(fsp.writeFile)).toHaveBeenCalledOnce()
  })

  it('joins two writes that are requested during a write into one more write, with the newest entities', async () => {
    start()
    await pause(150)
    const release = holdNextWrite()
    await setTitle('A')
    await eventually(() => vi.mocked(fsp.writeFile).mock.calls.length === 1)
    await setTitle('B')
    await setTitle('C')
    release()
    await eventually(async () => (await fileTitle()) === 'C')
    await pause(150)
    expect(vi.mocked(fsp.writeFile)).toHaveBeenCalledTimes(2)
    expect(renames()).toBe(2)
  })

  it('prints the problems of a refused replace-model, and sends the same files again after a new save', async () => {
    const apply = vi.fn((_part: Model): Model => {
      throw new InputRefusedError([{ message: 'The store says no', path: ['payload', 'model'] }])
    })
    const refusing: ModelSubsystem<Model> = {
      id: 'store',
      inputs: ['store/replace-model', 'store/set-field'],
      initial: first,
      apply,
    }
    start(createHub({ subsystems: [refusing] }))
    await pause(150)
    await writeFile(path.join(folder, 'state.json'), JSON.stringify(state('Edited')))
    watcher.change()
    await eventually(() => apply.mock.calls.length === 1)
    await eventually(() => lines.includes('wishem: the last correct model stays'))
    expect(lines).toContain('wishem: problem: The store says no')
    watcher.change()
    await eventually(() => apply.mock.calls.length === 2)
    expect(apply.mock.calls[1]?.[0]).toBe(first)
  })

  it('names state.json for a write that fails, removes the temporary file, and writes again for the next change', async () => {
    start()
    await pause(150)
    vi.mocked(fsp.writeFile).mockImplementationOnce(async (...args: Parameters<typeof writeFile>) => {
      await actualFs.writeFile(...args)
      throw new Error('EACCES: permission denied')
    })
    await setTitle('A')
    await eventually(() => lines.some((line) => line.includes('cannot write state.json')))
    expect(lines).toContain('wishem: cannot write state.json: EACCES: permission denied')
    expect((await readdir(folder)).filter((name) => name.endsWith('.tmp'))).toEqual([])
    expect(await fileTitle()).toBe('Wishem')
    await setTitle('B')
    await eventually(async () => (await fileTitle()) === 'B')
  })

  it('gives one promise for each call of close', async () => {
    start()
    await pause(150)
    const one = storage.close()
    const two = storage.close()
    expect(two).toBe(one)
    await one
    expect(watcher.close).toHaveBeenCalledOnce()
  })

  it('waits for a read that is running at close, and prints no line for a stopped hub', async () => {
    start()
    await pause(150)
    await writeFile(path.join(folder, 'state.json'), JSON.stringify(state('Hand edit')))
    const release = holdNextRead()
    watcher.change()
    await eventually(() => reads() >= 2)
    hub.stop()
    let closed = false
    const closing = storage.close().then(() => {
      closed = true
    })
    await pause(100)
    expect(closed).toBe(false)
    release()
    await closing
    expect(lines).toEqual([])
  })

  it('writes a pending write before close resolves', async () => {
    start()
    await pause(150)
    const release = holdNextRead()
    watcher.change()
    await eventually(() => reads() >= 2)
    await setTitle('Before close')
    const closing = storage.close()
    release()
    await closing
    expect(await fileTitle()).toBe('Before close')
  })

  it('does not read for a change that is pending at close', async () => {
    start()
    await pause(150)
    const count = reads()
    watcher.change()
    await storage.close()
    await pause(150)
    expect(reads()).toBe(count)
  })

  const startWithErrorHandler = () => {
    const onWatchError = vi.fn()
    hub = createHub({ subsystems: [createStore({ model: first })] })
    storage = attachModelFolderStorage({ folder, hub, first, log: (line) => lines.push(line), onWatchError })
    hub.start()
    storage.watch()
    client = hub.attach({ id: 'client', kind: 'input' })
    return onWatchError
  }

  it('logs a watch error of each watcher and calls onWatchError', () => {
    const onWatchError = startWithErrorHandler()
    expect(watchers.map(({ target }) => target)).toEqual([folder, path.join(folder, 'definitions')])
    const first = new Error('boom')
    const second = new Error('bang')
    watchers[0]?.emit('error', first)
    watchers[1]?.emit('error', second)
    expect(lines).toContain('wishem: the watch failed: boom')
    expect(lines).toContain('wishem: the watch failed: bang')
    expect(onWatchError).toHaveBeenCalledTimes(2)
    expect(onWatchError).toHaveBeenNthCalledWith(1, first)
    expect(onWatchError).toHaveBeenNthCalledWith(2, second)
  })

  it('closes each watcher at close', async () => {
    start()
    await pause(150)
    await storage.close()
    expect(watchers).toHaveLength(2)
    watchers.forEach((made) => {
      expect(made.close).toHaveBeenCalledOnce()
    })
  })

  it.each([
    ['the name definitions', 'definitions'],
    ['no name', null],
    ['an undefined name', undefined],
  ])('attaches the watcher of definitions again for an event of the folder with %s', async (_label, name) => {
    start()
    await pause(150)
    const old = watchers[1]
    watchers[0]?.change('rename', name)
    expect(old.close).toHaveBeenCalledOnce()
    expect(watchers).toHaveLength(3)
    expect(watchers[2]?.target).toBe(path.join(folder, 'definitions'))
    await storage.close()
    expect(old.close).toHaveBeenCalledOnce()
    watchers.forEach((made) => {
      expect(made.close).toHaveBeenCalled()
    })
    expect(watchers[0]?.close).toHaveBeenCalledOnce()
    expect(watchers[2]?.close).toHaveBeenCalledOnce()
  })

  it('does not attach the watcher of definitions again for an event of the folder with another name', async () => {
    start()
    await pause(150)
    watchers[0]?.change('change', 'state.json')
    expect(watchers).toHaveLength(2)
    expect(watchers[1]?.close).not.toHaveBeenCalled()
  })

  it('reports a watch that throws when it is attached again, and throws nothing out of the listener', async () => {
    const onWatchError = startWithErrorHandler()
    await pause(150)
    const failure = new Error('ENOSPC: no space')
    vi.mocked(watch).mockImplementationOnce(() => {
      throw failure
    })
    expect(() => {
      watchers[0]?.change('rename', 'definitions')
    }).not.toThrow()
    expect(watchers[1]?.close).toHaveBeenCalledOnce()
    expect(lines).toContain('wishem: the watch failed: ENOSPC: no space')
    expect(onWatchError).toHaveBeenCalledExactlyOnceWith(failure)
  })

  it('joins the changes of one wait into one read', async () => {
    start()
    await pause(150)
    const count = reads()
    watcher.change()
    watcher.change()
    watcher.change()
    await pause(150)
    expect(reads()).toBe(count + 1)
  })

  it('waits 50 ms after a change before it reads the folder', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      start()
      await vi.advanceTimersByTimeAsync(50)
      await vi.mocked(readModelFolder).mock.results.at(-1)?.value
      await vi.advanceTimersByTimeAsync(0)
      const count = reads()
      watcher.change()
      await vi.advanceTimersByTimeAsync(49)
      expect(reads()).toBe(count)
      await vi.advanceTimersByTimeAsync(1)
      expect(reads()).toBe(count + 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('logs a read that fails, and keeps running', async () => {
    start()
    await pause(150)
    vi.mocked(readModelFolder).mockRejectedValueOnce(new Error('disk broke'))
    watcher.change()
    await eventually(() => lines.some((line) => line.includes('cannot read the model: Error: disk broke')))
    await writeFile(path.join(folder, 'state.json'), JSON.stringify(state('After failure')))
    watcher.change()
    await eventually(() => title() === 'After failure')
    expect(lines.filter((line) => line.includes('cannot read the model'))).toHaveLength(1)
  })

  it('writes again when an input restores the content that was last read', async () => {
    start()
    await pause(150)
    await setTitle('A')
    await eventually(async () => (await fileTitle()) === 'A')
    await setTitle('Wishem')
    await eventually(async () => (await fileTitle()) === 'Wishem')
  })

  it('prints the warnings of a change that the first quiet read finds', async () => {
    const other = 'ct_7a1c2d3e-4b5f-4a6b-8c7d-9e0f1a2b3c4d'
    await writeFile(path.join(folder, 'definitions', 'other.json'), JSON.stringify({ ...definition, id: other }))
    start()
    await eventually(() => store().definitions.length === 2)
    await pause(100)
    expect(lines.filter((line) => line.includes('warning'))).toHaveLength(1)
  })

  it('prints the warnings for a read of a model that did not change, after a change of the files', async () => {
    const other = 'ct_7a1c2d3e-4b5f-4a6b-8c7d-9e0f1a2b3c4d'
    await writeFile(path.join(folder, 'definitions', 'other.json'), JSON.stringify({ ...definition, id: other }))
    const result = validateModel((await actualRead(folder)).data)
    if (!result.ok) {
      throw new Error('the fixture is not correct')
    }
    first = result.model
    start()
    await pause(150)
    expect(lines.filter((line) => line.includes('warning'))).toHaveLength(0)
    const count = reads()
    watcher.change()
    await eventually(() => reads() > count)
    await pause(50)
    expect(lines.filter((line) => line.includes('warning'))).toHaveLength(1)
  })

  it('does not read a change that waits behind a write when close starts', async () => {
    start()
    await pause(150)
    const release = holdNextWrite()
    await setTitle('A')
    await eventually(() => vi.mocked(fsp.writeFile).mock.calls.length === 1)
    watcher.change()
    await pause(150)
    const count = reads()
    const closing = storage.close()
    release()
    await closing
    expect(reads()).toBe(count)
  })

  it('writes an input that arrives while close waits for a read', async () => {
    start()
    await pause(150)
    const release = holdNextRead()
    watcher.change()
    await eventually(() => reads() >= 2)
    const closing = storage.close()
    await setTitle('Late')
    release()
    await closing
    expect(await fileTitle()).toBe('Late')
  })

  it('names state.json for a refusal of the entities by the store', async () => {
    const refusing: ModelSubsystem<Model> = {
      id: 'store',
      inputs: ['store/replace-model', 'store/set-field'],
      initial: first,
      apply: () => {
        throw new InputRefusedError([{ message: 'The store says no', path: ['entities', 0] }])
      },
    }
    start(createHub({ subsystems: [refusing] }))
    await pause(150)
    await writeFile(path.join(folder, 'state.json'), JSON.stringify(state('Edited')))
    watcher.change()
    await eventually(() => lines.includes('wishem: the last correct model stays'))
    expect(lines).toContain('wishem: problem in state.json: The store says no')
  })

  it('follows a change that is made between the first read and the start of the watch', async () => {
    await writeFile(path.join(folder, 'state.json'), JSON.stringify(state('Raced')))
    start()
    await eventually(() => title() === 'Raced')
  })
})
