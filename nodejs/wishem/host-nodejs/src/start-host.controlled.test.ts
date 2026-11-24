import { EventEmitter } from 'node:events'
import type { watch as watchType } from 'node:fs'
import { watch } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readModelFolder } from './read-model-folder.js'
import type { ModelFolderResult } from './read-model-folder.js'
import { startHost } from './start-host.js'
import type { Host } from './start-host.js'

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  watch: vi.fn(),
}))

vi.mock('./read-model-folder.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./read-model-folder.js')>()
  return { ...actual, readModelFolder: vi.fn(actual.readModelFolder) }
})

const actualRead = (await vi.importActual<typeof import('./read-model-folder.js')>('./read-model-folder.js'))
  .readModelFolder

const CT = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const FLD = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const E = 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2'

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const eventually = async (check: () => boolean, ms = 2000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('timeout')
    }
    await pause(20)
  }
}

/** A watcher that the test controls. */
class FakeWatcher extends EventEmitter {
  readonly close = vi.fn()

  constructor(readonly change: () => void) {
    super()
  }
}

describe('startHost with a controlled watcher and reader', () => {
  let folder: string
  let lines: string[]
  let host: Host | undefined
  let watcher: FakeWatcher

  const start = async (options: { onWatchError?: (error: Error) => void } = {}) => {
    host = await startHost({ folder, port: 0, log: (line) => lines.push(line), ...options })
    return host
  }

  beforeEach(async () => {
    lines = []
    host = undefined
    folder = await mkdtemp(path.join(tmpdir(), 'wishem-host-'))
    await mkdir(path.join(folder, 'definitions'))
    await writeFile(
      path.join(folder, 'definitions', `${CT}.json`),
      JSON.stringify({ id: CT, label: 'AppBar', fields: [{ id: FLD, label: 'title', type: 'string' }] }),
    )
    await writeFile(
      path.join(folder, 'state.json'),
      JSON.stringify({ entities: [{ id: E, components: { [CT]: { [FLD]: 'Wishem' } } }] }),
    )
    vi.mocked(readModelFolder).mockReset()
    vi.mocked(readModelFolder).mockImplementation(actualRead)
    vi.mocked(watch).mockReset()
    vi.mocked(watch).mockImplementation(((_folder: string, _options: unknown, listener: () => void) => {
      watcher = new FakeWatcher(listener)
      return watcher
    }) as unknown as typeof watchType)
  })

  afterEach(async () => {
    vi.mocked(readModelFolder).mockImplementation(actualRead)
    await host?.close()
    await rm(folder, { recursive: true, force: true })
  })

  it('logs a watch error and calls onWatchError', async () => {
    const onWatchError = vi.fn()
    await start({ onWatchError })
    const error = new Error('boom')
    watcher.emit('error', error)
    expect(lines).toContain('wishem: the watch failed: boom')
    expect(onWatchError).toHaveBeenCalledExactlyOnceWith(error)
  })

  it('stops the watcher on close', async () => {
    const started = await start()
    expect(watcher.close).not.toHaveBeenCalled()
    await started.close()
    expect(watcher.close).toHaveBeenCalledOnce()
  })

  it('does not read the folder for a change that is pending at close', async () => {
    const started = await start()
    await pause(150)
    const reads = vi.mocked(readModelFolder).mock.calls.length
    watcher.change()
    await started.close()
    await pause(150)
    expect(vi.mocked(readModelFolder).mock.calls.length).toBe(reads)
  })

  it('joins the changes of one wait into one read', async () => {
    await start()
    await pause(150)
    const reads = vi.mocked(readModelFolder).mock.calls.length
    watcher.change()
    watcher.change()
    watcher.change()
    await pause(150)
    expect(vi.mocked(readModelFolder).mock.calls.length).toBe(reads + 1)
  })

  it('waits 50 ms after a change before it reads the folder', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      await start()
      await vi.advanceTimersByTimeAsync(50)
      await vi.mocked(readModelFolder).mock.results.at(-1)?.value
      await vi.advanceTimersByTimeAsync(0)
      const reads = vi.mocked(readModelFolder).mock.calls.length
      watcher.change()
      await vi.advanceTimersByTimeAsync(49)
      expect(vi.mocked(readModelFolder).mock.calls.length).toBe(reads)
      await vi.advanceTimersByTimeAsync(1)
      expect(vi.mocked(readModelFolder).mock.calls.length).toBe(reads + 1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('waits for a read that is running at close', async () => {
    const started = await start()
    let finish: (result: ModelFolderResult) => void = () => undefined
    vi.mocked(readModelFolder).mockImplementation(
      () =>
        new Promise<ModelFolderResult>((resolve) => {
          finish = resolve
        }),
    )
    await pause(150)
    await eventually(() => vi.mocked(readModelFolder).mock.calls.length >= 2)
    let closed = false
    const closing = started.close().then(() => {
      closed = true
    })
    await pause(100)
    expect(closed).toBe(false)
    finish(await actualRead(folder))
    await closing
    expect(closed).toBe(true)
  })

  it('logs a read that fails, and keeps running', async () => {
    await start()
    await pause(150)
    vi.mocked(readModelFolder).mockRejectedValueOnce(new Error('disk broke'))
    watcher.change()
    await eventually(() => lines.some((line) => line.includes('cannot read the model: Error: disk broke')))
    watcher.change()
    await pause(150)
    expect(lines.filter((line) => line.includes('cannot read the model'))).toHaveLength(1)
  })
})
