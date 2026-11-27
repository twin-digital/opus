import { describe, expect, it, vi } from 'vitest'
import { createChannelPair, webSocketChannel } from './channel.js'
import type { WebSocketLike } from './channel.js'

const tick = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
}

describe('createChannelPair', () => {
  it('delivers a message in a later microtask', async () => {
    const [a, b] = createChannelPair()
    const got: string[] = []
    b.onMessage((text) => got.push(text))
    a.send('one')
    expect(got).toEqual([])
    await tick()
    expect(got).toEqual(['one'])
  })

  it('keeps the order of the messages in each direction', async () => {
    const [a, b] = createChannelPair()
    const atA: string[] = []
    const atB: string[] = []
    a.onMessage((text) => atA.push(text))
    b.onMessage((text) => atB.push(text))
    a.send('1')
    b.send('x')
    a.send('2')
    b.send('y')
    a.send('3')
    await tick()
    expect(atB).toEqual(['1', '2', '3'])
    expect(atA).toEqual(['x', 'y'])
  })

  it('holds a message that arrives before the listener', async () => {
    const [a, b] = createChannelPair()
    a.send('early')
    a.send('early2')
    await tick()
    const got: string[] = []
    b.onMessage((text) => got.push(text))
    expect(got).toEqual(['early', 'early2'])
    a.send('late')
    await tick()
    expect(got).toEqual(['early', 'early2', 'late'])
  })

  it('runs the close listener of both sides one time', async () => {
    const [a, b] = createChannelPair()
    const closeA = vi.fn()
    const closeB = vi.fn()
    a.onClose(closeA)
    b.onClose(closeB)
    a.close()
    expect(closeA).not.toHaveBeenCalled()
    await tick()
    expect(closeA).toHaveBeenCalledTimes(1)
    expect(closeB).toHaveBeenCalledTimes(1)
  })

  it('does nothing for a second close, also from the other side', async () => {
    const [a, b] = createChannelPair()
    const closeA = vi.fn()
    const closeB = vi.fn()
    a.onClose(closeA)
    b.onClose(closeB)
    a.close()
    a.close()
    b.close()
    await tick()
    b.close()
    expect(closeA).toHaveBeenCalledTimes(1)
    expect(closeB).toHaveBeenCalledTimes(1)
  })

  it('does nothing for a send after a close', async () => {
    const [a, b] = createChannelPair()
    const got: string[] = []
    a.onMessage((text) => got.push(text))
    b.onMessage((text) => got.push(text))
    a.close()
    a.send('x')
    b.send('y')
    await tick()
    expect(got).toEqual([])
  })

  it('delivers the messages before a close ahead of the close listener', async () => {
    const [a, b] = createChannelPair()
    const order: string[] = []
    b.onMessage((text) => order.push(text))
    b.onClose(() => order.push('close'))
    a.send('1')
    a.send('2')
    a.close()
    await tick()
    expect(order).toEqual(['1', '2', 'close'])
  })

  it('runs a close listener that is registered after the close', async () => {
    const [a, b] = createChannelPair()
    a.close()
    await tick()
    const closeB = vi.fn()
    b.onClose(closeB)
    await tick()
    expect(closeB).toHaveBeenCalledTimes(1)
  })

  it('does not give a held message to a second message listener', async () => {
    const [a, b] = createChannelPair()
    a.send('early')
    await tick()
    const first: string[] = []
    const second: string[] = []
    b.onMessage((text) => first.push(text))
    b.onMessage((text) => second.push(text))
    expect(first).toEqual(['early'])
    expect(second).toEqual([])
  })

  it('does not run a late close listener in the call of onClose', async () => {
    const [a, b] = createChannelPair()
    a.close()
    await tick()
    const closeB = vi.fn()
    b.onClose(closeB)
    expect(closeB).not.toHaveBeenCalled()
  })

  it('allows a send from inside a message listener', async () => {
    const [a, b] = createChannelPair()
    const got: string[] = []
    b.onMessage((text) => {
      b.send(`echo ${text}`)
    })
    a.onMessage((text) => got.push(text))
    a.send('hi')
    await tick()
    expect(got).toEqual(['echo hi'])
  })
})

type Handler = (event: { data?: unknown }) => void

const fakeSocket = (readyState: number) => {
  const handlers: Record<string, Handler[]> = {}
  const socket = {
    readyState,
    sent: [] as string[],
    closeCalls: 0,
    send(data: string) {
      socket.sent.push(data)
    },
    close() {
      socket.closeCalls += 1
    },
    addEventListener(type: string, listener: Handler) {
      ;(handlers[type] ??= []).push(listener)
    },
  }
  const fire = (type: string, event: { data?: unknown } = {}) => {
    for (const handler of handlers[type] ?? []) {
      handler(event)
    }
  }
  return { socket: socket satisfies WebSocketLike, fire }
}

describe('webSocketChannel', () => {
  it('resolves at once for an open socket', async () => {
    const { socket } = fakeSocket(1)
    const channel = await webSocketChannel(socket)
    channel.send('hi')
    expect(socket.sent).toEqual(['hi'])
  })

  it('resolves when the socket opens', async () => {
    const { socket, fire } = fakeSocket(0)
    const promise = webSocketChannel(socket)
    fire('open')
    const channel = await promise
    channel.send('hi')
    expect(socket.sent).toEqual(['hi'])
  })

  it('rejects when the socket fails before it opens', async () => {
    const { socket, fire } = fakeSocket(0)
    const promise = webSocketChannel(socket)
    fire('error')
    await expect(promise).rejects.toBeInstanceOf(Error)
  })

  it('rejects when the socket closes before it opens', async () => {
    const { socket, fire } = fakeSocket(0)
    const promise = webSocketChannel(socket)
    fire('close')
    await expect(promise).rejects.toBeInstanceOf(Error)
  })

  it('gives a text message to the listener and ignores other data', async () => {
    const { socket, fire } = fakeSocket(1)
    const channel = await webSocketChannel(socket)
    const got: string[] = []
    channel.onMessage((text) => got.push(text))
    fire('message', { data: 'a' })
    fire('message', { data: new Uint8Array([1]) })
    fire('message', {})
    fire('message', { data: 5 })
    fire('message', { data: 'b' })
    expect(got).toEqual(['a', 'b'])
  })

  it('holds a message that arrives before the listener', async () => {
    const { socket, fire } = fakeSocket(0)
    const promise = webSocketChannel(socket)
    fire('open')
    fire('message', { data: 'early' })
    const channel = await promise
    const got: string[] = []
    channel.onMessage((text) => got.push(text))
    expect(got).toEqual(['early'])
  })

  it('runs the close listener one time for an error and a close after open', async () => {
    const { socket, fire } = fakeSocket(1)
    const channel = await webSocketChannel(socket)
    const onClose = vi.fn()
    channel.onClose(onClose)
    fire('error')
    fire('close')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('runs the close listener one time for two close events', async () => {
    const { socket, fire } = fakeSocket(1)
    const channel = await webSocketChannel(socket)
    const onClose = vi.fn()
    channel.onClose(onClose)
    fire('close')
    fire('close')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes the socket one time and does nothing for a send after a close', async () => {
    const { socket, fire } = fakeSocket(1)
    const channel = await webSocketChannel(socket)
    const onClose = vi.fn()
    channel.onClose(onClose)
    channel.close()
    channel.close()
    channel.send('x')
    expect(socket.closeCalls).toBe(1)
    expect(socket.sent).toEqual([])
    fire('close')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('runs a close listener that is registered after the close', async () => {
    const { socket, fire } = fakeSocket(1)
    const channel = await webSocketChannel(socket)
    fire('close')
    const onClose = vi.fn()
    channel.onClose(onClose)
    await tick()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('gives no message to the listener after the close', async () => {
    const { socket, fire } = fakeSocket(1)
    const channel = await webSocketChannel(socket)
    const got: string[] = []
    channel.onMessage((text) => got.push(text))
    fire('close')
    fire('message', { data: 'late' })
    expect(got).toEqual([])
  })

  it('runs the close listener for a socket that closes after the open event', async () => {
    const { socket, fire } = fakeSocket(0)
    const promise = webSocketChannel(socket)
    fire('open')
    const channel = await promise
    const onClose = vi.fn()
    channel.onClose(onClose)
    fire('close')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not send on the socket after a close event', async () => {
    const { socket, fire } = fakeSocket(1)
    const channel = await webSocketChannel(socket)
    fire('close')
    channel.send('x')
    channel.close()
    expect(socket.sent).toEqual([])
    expect(socket.closeCalls).toBe(0)
  })
})
