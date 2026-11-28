import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import type { Model } from '@thrashplay/wishem-core'
import { readModelFolder } from '@thrashplay/wishem-host-nodejs'
import { serveLink } from '@thrashplay/wishem-hub'
import type { Hub } from '@thrashplay/wishem-hub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ipcChannel } from './ipc-channel.js'
import type { IpcEndpoint } from './ipc-channel.js'
import { createProductHub } from './product-construct.js'

const stubs = vi.hoisted(() => ({ children: [] as unknown[], forks: [] as unknown[][] }))

vi.mock('node:child_process', () => ({
  fork: (...args: unknown[]) => {
    stubs.forks.push(args)
    const child = stubs.children.at(-1)
    if (child === undefined) {
      throw new Error('No stub child.')
    }
    return child
  },
}))

const { checkProductCode, childProcessLauncher } = await import('./launchers.js')

type SendCallback = (error: Error | null) => void

/** A child process that records its calls. `kill` ends it with `disconnect` and `close`. */
const makeChild = (
  onSend: (message: { t: string }, callback: SendCallback | undefined, child: EventEmitter) => void,
) => {
  const child = new EventEmitter() as EventEmitter & Record<string, unknown>
  child.pid = 4242
  child.stdout = null
  child.stderr = null
  child.send = vi.fn((message: { t: string }, callback?: SendCallback) => {
    onSend(message, callback, child)
    return true
  })
  child.kill = vi.fn(() => {
    queueMicrotask(() => {
      child.emit('disconnect')
      child.emit('close', null, 'SIGKILL')
    })
    return true
  })
  stubs.children.push(child)
  return child
}

const MODEL_FOLDER = fileURLToPath(new URL('../../sample-product/model', import.meta.url))
const model = (await readModelFolder(MODEL_FOLDER)).data as Model
const start = { id: 'play', model, running: true }

interface LiveChildOptions {
  /** Answers each ping with a pong. */
  answerPing?: boolean
  /** Ends on a stop message. */
  answerStop?: boolean
  /** Drops the link messages of the parent. */
  mute?: boolean
  /** Sends `failed` to a serve message. */
  failServe?: boolean
  /** The time before `ready`. */
  readyDelayMs?: number
  streams?: boolean
}

/** A child process that runs the link side of a product construct in this process. */
const makeLiveChild = (options: LiveChildOptions = {}) => {
  const state = { answerPing: true, answerStop: true, mute: false, failServe: false, readyDelayMs: 0, ...options }
  const child = new EventEmitter() as EventEmitter & Record<string, unknown>
  const inside = new EventEmitter()
  const sent: { t: string }[] = []
  const sentAtReady: string[] = []
  const insideEndpoint = {
    send: (message: object, callback?: SendCallback) => {
      queueMicrotask(() => child.emit('message', message))
      callback?.(null)
      return true
    },
    on: (event: string, listener: (...args: unknown[]) => void) => inside.on(event, listener),
    off: (event: string, listener: (...args: unknown[]) => void) => inside.off(event, listener),
  } as unknown as IpcEndpoint
  let hub: Hub | undefined
  let ended = false
  const end = (code: number | null, signal: string | null) => {
    if (ended) {
      return
    }
    ended = true
    hub?.stop()
    child.emit('disconnect')
    child.emit('close', code, signal)
  }
  inside.on('message', (message: { t: string; model?: never; running?: boolean }) => {
    if (message.t === 'start') {
      const made = createProductHub({ model: message.model as never, running: message.running ?? false })
      hub = made
      made.start()
      serveLink(made, ipcChannel(insideEndpoint))
      const ready = () => {
        sentAtReady.push(...sent.map((item) => item.t))
        child.emit('message', { t: 'ready' })
      }
      if (state.readyDelayMs === 0) {
        queueMicrotask(ready)
      } else {
        setTimeout(ready, state.readyDelayMs)
      }
    } else if (message.t === 'serve') {
      child.emit(
        'message',
        state.failServe ? { t: 'failed', message: 'no port' } : { t: 'serving', linkUrl: 'ws://127.0.0.1:1/link' },
      )
    } else if (message.t === 'ping' && state.answerPing) {
      child.emit('message', { t: 'pong' })
    } else if (message.t === 'stop' && state.answerStop) {
      end(0, null)
    }
  })
  child.pid = 4242
  child.stdout = state.streams === true ? new PassThrough() : null
  child.stderr = state.streams === true ? new PassThrough() : null
  child.send = vi.fn((message: { t: string }, callback?: SendCallback) => {
    sent.push(message)
    if (!(state.mute && message.t === 'link')) {
      queueMicrotask(() => inside.emit('message', message))
    }
    callback?.(null)
    return true
  })
  child.kill = vi.fn((signal?: string) => {
    queueMicrotask(() => {
      end(null, signal ?? 'SIGTERM')
    })
    return true
  })
  stubs.children.push(child)
  return { child, state, sent, sentAtReady, end }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const countOf = (sent: { t: string }[], type: string) => sent.filter((message) => message.t === type).length

describe('childProcessLauncher on an error of the child process', () => {
  beforeEach(() => {
    stubs.children.length = 0
  })

  it('rejects the launch and kills the child when the child emits error before it is ready', async () => {
    const child = makeChild((_message, _callback, self) => {
      queueMicrotask(() => self.emit('error', new Error('boom')))
    })
    await expect(childProcessLauncher()(start)).rejects.toThrow('boom')
    expect(child.kill).toHaveBeenCalled()
  })

  it('rejects the launch and kills the child when the start message cannot be sent', async () => {
    const child = makeChild((_message, callback) => {
      callback?.(new Error('channel closed'))
    })
    await expect(childProcessLauncher()(start)).rejects.toThrow('channel closed')
    expect(child.kill).toHaveBeenCalled()
  })

  it('rejects the launch when the child emits error while the link opens', async () => {
    const child = makeChild((message, _callback, self) => {
      if (message.t === 'start') {
        queueMicrotask(() => {
          self.emit('message', { t: 'ready' })
          setTimeout(() => self.emit('error', new Error('lost')), 5)
        })
      }
    })
    await expect(childProcessLauncher()(start)).rejects.toThrow('had an error: lost')
    expect(child.kill).toHaveBeenCalled()
  })
})

describe('childProcessLauncher on the start', () => {
  beforeEach(() => {
    stubs.children.length = 0
    stubs.forks.length = 0
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('forks the process file with no exec arguments, a piped output, and the JSON serialization', async () => {
    makeLiveChild()
    const launched = await childProcessLauncher()(start)
    const [file, args, options] = stubs.forks[0]
    expect(String(file)).toMatch(/product-construct-process\.js$/)
    expect(args).toEqual([])
    expect(options).toEqual({ execArgv: [], stdio: ['ignore', 'pipe', 'pipe', 'ipc'], serialization: 'json' })
    await launched.close()
  })

  it('sends the start message with the ID, the model, and running, and with no option that is not set', async () => {
    const { sent } = makeLiveChild()
    const launched = await childProcessLauncher()({ ...start, running: false })
    expect(sent[0]).toEqual({ t: 'start', id: 'play', model, running: false })
    expect(Object.keys(sent[0])).toEqual(['t', 'id', 'model', 'running'])
    await launched.close()
  })

  it('sends stepMs and productCode in the start message when the options are set', async () => {
    const { sent } = makeLiveChild()
    const launched = await childProcessLauncher({ stepMs: 20, productCode: 'file:///product.js' })(start)
    expect(sent[0]).toMatchObject({ t: 'start', stepMs: 20, productCode: 'file:///product.js' })
    await launched.close()
  })

  it('sends no link message before ready, and serve after the first link message', async () => {
    const { sent, sentAtReady } = makeLiveChild({ readyDelayMs: 30 })
    const launched = await childProcessLauncher()(start)
    expect(sentAtReady).toEqual(['start'])
    const types = sent.map((message) => message.t)
    expect(types.indexOf('serve')).toBeGreaterThan(types.indexOf('link'))
    await launched.close()
  })

  it('gives each line of the standard output and of the standard error to onLine', async () => {
    const { child } = makeLiveChild({ streams: true })
    const lines: string[] = []
    const launched = await childProcessLauncher()(start, { onLine: (line) => lines.push(line) })
    ;(child.stdout as PassThrough).write('out line\n')
    ;(child.stderr as PassThrough).write('error line\n')
    await vi.waitFor(() => {
      expect([...lines].sort()).toEqual(['error line', 'out line'])
    })
    await launched.close()
  })

  it('leaves two message listeners on the child after the start: the link and the pong', async () => {
    const { child } = makeLiveChild()
    const launched = await childProcessLauncher()(start)
    expect(child.listenerCount('message')).toBe(2)
    await launched.close()
  })

  it('rejects with a cause, kills the child, and removes the link listeners when the child sends failed', async () => {
    const { child } = makeLiveChild({ failServe: true })
    const error = await childProcessLauncher()(start).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ message: 'no port' })
    expect((error as Error).cause).toBeInstanceOf(Error)
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    expect(child.listenerCount('message')).toBe(0)
    expect(child.listenerCount('disconnect')).toBe(0)
  })

  it('keeps no start timer after the start', async () => {
    const { child } = makeLiveChild()
    const launched = await childProcessLauncher({ startMs: 40 })(start)
    await pause(100)
    expect(child.kill).not.toHaveBeenCalled()
    await launched.close()
  })

  it('kills a child that is not ready after 10 seconds, and not before', async () => {
    vi.useFakeTimers()
    const child = makeChild(() => undefined)
    const result = childProcessLauncher()(start).catch((caught: unknown) => caught)
    await vi.advanceTimersByTimeAsync(9999)
    expect(child.kill).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    expect(await result).toMatchObject({ message: 'The construct did not start in 10 seconds.' })
  })
})

describe('childProcessLauncher on the exit of the child', () => {
  beforeEach(() => {
    stubs.children.length = 0
  })

  it('gives the exit code unknown to ended when the child ends with no code and no signal', async () => {
    const { child } = makeLiveChild()
    const launched = await childProcessLauncher()(start)
    child.emit('close', null, null)
    expect(await launched.ended).toBe('The process of the construct ended with the exit code unknown.')
  })

  it('gives the error text to ended and kills the child when the child emits error after the start', async () => {
    const { child } = makeLiveChild()
    const launched = await childProcessLauncher()(start)
    child.emit('error', new Error('lost'))
    expect(await launched.ended).toBe('The process of the construct had an error: lost')
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  })
})

describe('childProcessLauncher on the ping', () => {
  beforeEach(() => {
    stubs.children.length = 0
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends one ping while no pong comes, and kills the child with the text of the limit', async () => {
    const { child, sent } = makeLiveChild({ answerPing: false })
    const launched = await childProcessLauncher({ pingMs: 20, answerMs: 200 })(start)
    await pause(120)
    expect(countOf(sent, 'ping')).toBe(1)
    expect(await launched.ended).toBe('The construct did not answer in 0.2 seconds.')
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  })

  it('sends a ping after each pong, with the time of the option between them', async () => {
    const { child, sent } = makeLiveChild({ answerPing: true })
    const launched = await childProcessLauncher({ pingMs: 20, answerMs: 1000 })(start)
    await pause(150)
    expect(countOf(sent, 'ping')).toBeGreaterThanOrEqual(3)
    expect(child.kill).not.toHaveBeenCalled()
    await launched.close()
  })

  it('sends the first ping after 1 second, and not before', async () => {
    vi.useFakeTimers()
    const { sent } = makeLiveChild()
    const launched = await childProcessLauncher()(start)
    await vi.advanceTimersByTimeAsync(999)
    expect(countOf(sent, 'ping')).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(countOf(sent, 'ping')).toBe(1)
    await launched.close()
  })

  it('keeps no timer when the child ends while a ping waits', async () => {
    vi.useFakeTimers()
    const { child } = makeLiveChild({ answerPing: false })
    await childProcessLauncher()(start)
    await vi.advanceTimersByTimeAsync(1000)
    child.emit('close', 0, null)
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('sends no ping after close() while the child has not ended', async () => {
    vi.useFakeTimers()
    const { sent } = makeLiveChild({ answerStop: false })
    const launched = await childProcessLauncher({ stopMs: 5000 })(start)
    await vi.advanceTimersByTimeAsync(2000)
    const before = countOf(sent, 'ping')
    void launched.close()
    await vi.advanceTimersByTimeAsync(3000)
    expect(countOf(sent, 'ping')).toBe(before)
  })
})

describe('childProcessLauncher on the limit of a submit', () => {
  beforeEach(() => {
    stubs.children.length = 0
  })

  const submitted = { type: 'time/set-running', payload: { running: false } }

  it('rejects a submit that gets no answer in the time of the option, and kills the child', async () => {
    const { child, state } = makeLiveChild({ answerPing: true })
    const launched = await childProcessLauncher({ answerMs: 50 })(start)
    state.mute = true
    const outcome = await Promise.race([
      launched.input.submit(submitted).catch((error: unknown) => (error as Error).message),
      pause(1000).then(() => 'late'),
    ])
    expect(outcome).toBe('The construct did not answer in 0.05 seconds.')
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  })

  it('does not kill the child after the answer of a submit', async () => {
    const { child } = makeLiveChild()
    const launched = await childProcessLauncher({ answerMs: 80 })(start)
    expect(await launched.input.submit(submitted)).toMatchObject({ ok: true })
    await pause(160)
    expect(child.kill).not.toHaveBeenCalled()
    await launched.close()
  })

  it('does not kill the child after a submit that rejects', async () => {
    const { child, state } = makeLiveChild()
    const launched = await childProcessLauncher({ answerMs: 80, pingMs: 60000 })(start)
    state.mute = true
    const pending = launched.input.submit(submitted).catch((error: unknown) => (error as Error).message)
    child.emit('disconnect')
    expect(await pending).not.toContain('did not answer')
    await pause(160)
    expect(child.kill).not.toHaveBeenCalled()
  })
})

describe('childProcessLauncher on close', () => {
  beforeEach(() => {
    stubs.children.length = 0
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends stop one time, gives one promise, and removes the link listeners', async () => {
    const { child, sent } = makeLiveChild()
    const launched = await childProcessLauncher()(start)
    const first = launched.close()
    const second = launched.close()
    expect(second).toBe(first)
    await first
    expect(countOf(sent, 'stop')).toBe(1)
    expect(child.listenerCount('message')).toBe(0)
    expect(child.listenerCount('disconnect')).toBe(0)
  })

  it('sends no stop and no kill for a child that ended before', async () => {
    const { child, sent } = makeLiveChild()
    const launched = await childProcessLauncher()(start)
    child.emit('close', 0, null)
    await launched.close()
    expect(countOf(sent, 'stop')).toBe(0)
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('kills a child that ignores stop with SIGKILL after stopMs', async () => {
    const { child } = makeLiveChild({ answerStop: false })
    const launched = await childProcessLauncher({ stopMs: 40 })(start)
    await launched.close()
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    expect(child.kill).toHaveBeenCalledTimes(1)
  })

  it('does not kill a child that ends in time after stop', async () => {
    const { child } = makeLiveChild({ answerStop: true })
    const launched = await childProcessLauncher({ stopMs: 60 })(start)
    await launched.close()
    await pause(120)
    expect(child.kill).not.toHaveBeenCalled()
  })

  it('kills a child that ignores stop after 2 seconds, and not before', async () => {
    vi.useFakeTimers()
    const { child } = makeLiveChild({ answerStop: false })
    const launched = await childProcessLauncher()(start)
    const closing = launched.close()
    await vi.advanceTimersByTimeAsync(1999)
    expect(child.kill).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    await closing
  })
})

describe('checkProductCode with a stub child', () => {
  beforeEach(() => {
    stubs.children.length = 0
    stubs.forks.length = 0
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('forks with no output pipe', async () => {
    makeChild((_message, _callback, self) => {
      queueMicrotask(() => self.emit('message', { t: 'checked', count: 1 }))
    })
    expect(await checkProductCode('file:///product.js')).toEqual({ ok: true, count: 1 })
    expect(stubs.forks[0][2]).toMatchObject({ stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  })

  it('gives load with the message of an error event', async () => {
    makeChild((_message, _callback, self) => {
      queueMicrotask(() => self.emit('error', new Error('boom')))
    })
    expect(await checkProductCode('file:///product.js')).toEqual({ ok: false, reason: 'load', message: 'boom' })
  })

  it('gives load with the exit text when the child ends with no answer', async () => {
    makeChild((_message, _callback, self) => {
      queueMicrotask(() => self.emit('close', 1, null))
    })
    expect(await checkProductCode('file:///product.js')).toEqual({
      ok: false,
      reason: 'load',
      message: 'The process of the construct ended with the exit code 1.',
    })
  })

  it('keeps no timer after the answer', async () => {
    vi.useFakeTimers()
    makeChild((_message, _callback, self) => {
      queueMicrotask(() => self.emit('message', { t: 'checked', count: 2 }))
    })
    expect(await checkProductCode('file:///product.js')).toEqual({ ok: true, count: 2 })
    expect(vi.getTimerCount()).toBe(0)
  })
})
