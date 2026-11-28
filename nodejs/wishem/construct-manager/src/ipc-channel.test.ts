import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { ipcChannel } from './ipc-channel.js'
import type { IpcEndpoint } from './ipc-channel.js'

/** An endpoint that records the sent messages, and that the test can feed. */
const makeEndpoint = () => {
  const emitter = new EventEmitter()
  const sent: object[] = []
  const endpoint = {
    send: (message) => {
      sent.push(message)
      return true
    },
    on: (event: string, listener: unknown) => {
      emitter.on(event, listener as (...args: unknown[]) => void)
    },
    off: (event: string, listener: unknown) => {
      emitter.off(event, listener as (...args: unknown[]) => void)
    },
  } as IpcEndpoint
  return { endpoint, sent, emitter }
}

describe('ipcChannel', () => {
  it('sends the texts of one turn as one link message, in order', async () => {
    const { endpoint, sent } = makeEndpoint()
    const channel = ipcChannel(endpoint)
    channel.send('a')
    channel.send('b')
    expect(sent).toEqual([])
    await Promise.resolve()
    channel.send('c')
    await Promise.resolve()
    expect(sent).toEqual([
      { t: 'link', texts: ['a', 'b'] },
      { t: 'link', texts: ['c'] },
    ])
  })

  it('gives the texts of one link message to the listener in one turn, in order', async () => {
    const { endpoint, emitter } = makeEndpoint()
    const channel = ipcChannel(endpoint)
    const seen: string[] = []
    let timerStarted = false
    channel.onMessage((text) => {
      seen.push(text)
      if (!timerStarted) {
        timerStarted = true
        setTimeout(() => {
          seen.push('timer')
        }, 0)
      }
    })
    emitter.emit('message', { t: 'link', texts: ['a', 'b', 'c'] })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(seen).toEqual(['a', 'b', 'c', 'timer'])
  })

  it('holds a message until the listener exists', () => {
    const { endpoint, emitter } = makeEndpoint()
    const channel = ipcChannel(endpoint)
    emitter.emit('message', { t: 'link', texts: ['a'] })
    const listener = vi.fn()
    channel.onMessage(listener)
    expect(listener).toHaveBeenCalledWith('a')
  })

  it('does not give a message that is not link to the listener', () => {
    const { endpoint, emitter } = makeEndpoint()
    const channel = ipcChannel(endpoint)
    const listener = vi.fn()
    channel.onMessage(listener)
    emitter.emit('message', { t: 'serve' })
    emitter.emit('message', { t: 'link', texts: 'a' })
    emitter.emit('message', 'link')
    emitter.emit('message', null)
    emitter.emit('message', { t: 'link', texts: [1] })
    expect(listener).not.toHaveBeenCalled()
  })

  it('runs the close listener one time on disconnect', () => {
    const { endpoint, emitter } = makeEndpoint()
    const channel = ipcChannel(endpoint)
    const onClose = vi.fn()
    channel.onClose(onClose)
    emitter.emit('disconnect')
    emitter.emit('disconnect')
    channel.close()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('runs the close listener one time on close, and sends nothing after it', async () => {
    const { endpoint, sent, emitter } = makeEndpoint()
    const channel = ipcChannel(endpoint)
    const onClose = vi.fn()
    const listener = vi.fn()
    channel.onClose(onClose)
    channel.onMessage(listener)
    channel.close()
    channel.close()
    channel.send('a')
    await Promise.resolve()
    emitter.emit('message', { t: 'link', texts: ['b'] })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(sent).toEqual([])
    expect(listener).not.toHaveBeenCalled()
  })

  it('drops a text that waits for the send when the channel closes', async () => {
    const { endpoint, sent } = makeEndpoint()
    const channel = ipcChannel(endpoint)
    channel.send('a')
    channel.close()
    await Promise.resolve()
    expect(sent).toEqual([])
  })

  it('runs the close listener that is set after a disconnect', async () => {
    const { endpoint, emitter } = makeEndpoint()
    const channel = ipcChannel(endpoint)
    emitter.emit('disconnect')
    const onClose = vi.fn()
    channel.onClose(onClose)
    await Promise.resolve()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
