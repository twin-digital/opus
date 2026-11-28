import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const stubs = vi.hoisted(() => ({ children: [] as unknown[] }))

vi.mock('node:child_process', () => ({
  fork: () => {
    const child = stubs.children.at(-1)
    if (child === undefined) {
      throw new Error('No stub child.')
    }
    return child
  },
}))

const { childProcessLauncher } = await import('./launchers.js')

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

const start = { id: 'play', model: { entities: [] } as never, running: true }

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
