import { createStore, storeInputs, type Model } from '@thrashplay/wishem-core'
import {
  createChannelPair,
  createHub,
  serveLink,
  type Channel,
  type Hub,
  type WebSocketLike,
} from '@thrashplay/wishem-hub'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { connectHub, type HubClient, type HubClientOptions } from './hub-client.js'

const CT = 'ct_aaaaaaaa-0000-4000-8000-000000000001'
const FLD = 'fld_aaaaaaaa-0000-4000-8000-000000000011'
const E1 = 'e_aaaaaaaa-0000-4000-8000-000000000021'
const WARNING = 'wishem: the hub is not reachable. The page tries again.'

const modelOf = (title: string): Model => ({
  definitions: [{ id: CT, label: 'A', fields: [{ id: FLD, label: 'title', type: 'string' }] }],
  entities: [{ id: E1, components: { [CT]: { [FLD]: title } } }],
})

const inputs = storeInputs()

const startHub = (title: string): Hub => {
  const hub = createHub({ subsystems: [createStore({ model: modelOf(title) })] })
  hub.start()
  return hub
}

const setTitle = async (hub: Hub, title: string) => {
  const port = hub.attach({ id: 'tester', kind: 'input' })
  const result = await port.submit(inputs.setField({ entity: E1, componentType: CT, field: FLD, value: title }))
  port.close()
  expect(result.ok).toBe(true)
}

type Mode = 'open' | 'fail' | 'manual'

type Handler = (event: { data?: unknown }) => void

/** A socket that joins the page to `serveLink` of a hub. */
class FakeSocket implements WebSocketLike {
  readyState = 0
  closeCalls = 0
  readonly sent: string[] = []
  held = false
  private readonly handlers: Record<string, Handler[]> = {}
  private readonly heldMessages: string[] = []
  private client: Channel | undefined
  private server: Channel | undefined

  readonly url: string
  private readonly hub: Hub

  constructor(url: string, hub: Hub) {
    this.url = url
    this.hub = hub
  }

  addEventListener = (type: string, listener: Handler) => {
    this.handlers[type] = [...(this.handlers[type] ?? []), listener]
  }

  send = (data: string) => {
    this.sent.push(data)
    if (this.held) {
      this.heldMessages.push(data)
    } else {
      this.client?.send(data)
    }
  }

  close = () => {
    this.closeCalls += 1
    if (this.readyState === 0) {
      this.readyState = 3
      this.emit('close')
    } else {
      this.client?.close()
    }
  }

  open = () => {
    if (this.readyState !== 0) {
      return
    }
    this.readyState = 1
    const [client, server] = createChannelPair()
    this.client = client
    this.server = server
    client.onMessage((text) => {
      this.emit('message', text)
    })
    client.onClose(() => {
      this.readyState = 3
      this.emit('close')
    })
    serveLink(this.hub, server)
    this.emit('open')
  }

  fail = () => {
    if (this.readyState !== 0) {
      return
    }
    this.readyState = 3
    this.emit('error')
    this.emit('close')
  }

  /** The hub side ends the link. */
  drop = () => {
    this.server?.close()
  }

  release = () => {
    this.held = false
    for (const text of this.heldMessages.splice(0)) {
      this.client?.send(text)
    }
  }

  private emit = (type: string, data?: unknown) => {
    for (const handler of this.handlers[type] ?? []) {
      handler({ data })
    }
  }
}

interface Env {
  hub: Hub
  sockets: FakeSocket[]
  plan: Mode[]
  options: HubClientOptions
  last: () => FakeSocket
}

const makeEnv = (hub: Hub): Env => {
  const env: Env = {
    hub,
    sockets: [],
    plan: [],
    options: {},
    last: () => {
      const socket = env.sockets.at(-1)
      if (!socket) {
        throw new Error('no socket')
      }
      return socket
    },
  }
  env.options = {
    url: 'ws://page.test/link',
    createSocket: (url) => {
      const socket = new FakeSocket(url, env.hub)
      env.sockets.push(socket)
      const mode = env.plan.shift() ?? 'open'
      queueMicrotask(() => {
        if (mode === 'open') {
          socket.open()
        } else if (mode === 'fail') {
          socket.fail()
        }
      })
      return socket
    },
  }
  return env
}

const flush = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('connectHub', () => {
  let env: Env
  let clients: HubClient[]
  let warn: MockInstance<typeof console.warn>
  let error: MockInstance<typeof console.error>

  const connect = async (options: HubClientOptions = env.options) => {
    const client = await connectHub(options)
    clients.push(client)
    return client
  }

  /** Connects, and drops the first link so that the client waits for its first delay. */
  const connectAndDrop = async () => {
    const client = await connect()
    env.last().drop()
    await flush()
    return client
  }

  beforeEach(() => {
    vi.useFakeTimers()
    env = makeEnv(startHub('One'))
    clients = []
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    clients.forEach((client) => {
      client.close()
    })
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('the address', () => {
    it('uses ws: and the host of the page for http:', async () => {
      vi.stubGlobal('location', { protocol: 'http:', host: 'page.test:5173' })
      const createSocket = vi.fn(env.options.createSocket)
      await connect({ createSocket })
      expect(createSocket).toHaveBeenCalledWith('ws://page.test:5173/link')
    })

    it('uses wss: for https:', async () => {
      vi.stubGlobal('location', { protocol: 'https:', host: 'page.test' })
      const createSocket = vi.fn(env.options.createSocket)
      await connect({ createSocket })
      expect(createSocket).toHaveBeenCalledWith('wss://page.test/link')
    })

    it('uses the given address', async () => {
      const createSocket = vi.fn(env.options.createSocket)
      await connect({ createSocket, url: 'ws://other.test/x' })
      expect(createSocket).toHaveBeenCalledWith('ws://other.test/x')
    })
  })

  describe('before the first link', () => {
    it('resolves after the welcome message and not before', async () => {
      env.plan = ['manual']
      let resolved = false
      const promise = connectHub(env.options).then((client) => {
        resolved = true
        clients.push(client)
        return client
      })
      env.last().held = true
      env.last().open()
      await flush()
      expect(env.last().sent).toHaveLength(1)
      expect(resolved).toBe(false)
      env.last().release()
      const client = await promise
      expect(resolved).toBe(true)
      expect(client.getSnapshot()).toEqual(modelOf('One'))
    })

    it('writes one warning, keeps trying, and resolves when the hub answers', async () => {
      env.plan = ['fail', 'fail']
      let resolved = false
      void connectHub(env.options).then((client) => {
        resolved = true
        clients.push(client)
      })
      await flush()
      expect(warn).toHaveBeenCalledExactlyOnceWith(WARNING)
      await flush(500)
      await flush(1000)
      expect(env.sockets).toHaveLength(3)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(resolved).toBe(true)
    })

    it('writes one error for a refusal, and tries again', async () => {
      const stopped = startHub('One')
      stopped.stop()
      env.hub = stopped
      let resolved = false
      void connectHub(env.options).then((client) => {
        resolved = true
        clients.push(client)
      })
      await flush()
      await flush(500)
      await flush(1000)
      expect(env.sockets).toHaveLength(3)
      expect(error).toHaveBeenCalledTimes(1)
      expect(String(error.mock.calls[0]?.[0])).toContain('stopped')
      expect(resolved).toBe(false)
      env.hub = startHub('Two')
      await flush(2000)
      expect(resolved).toBe(true)
    })
  })

  describe('the subsystem of the page', () => {
    it('attaches one output subsystem with an ID that is new for each link', async () => {
      await connect()
      env.last().drop()
      await flush(500)
      const ids = env.sockets.map((socket) => {
        const hello = JSON.parse(socket.sent[0] ?? '{}') as { subsystems: { id: string; kind: string }[] }
        expect(hello.subsystems).toHaveLength(1)
        expect(hello.subsystems[0]?.kind).toBe('output')
        return hello.subsystems[0]?.id ?? ''
      })
      expect(ids).toHaveLength(2)
      ids.forEach((id) => {
        expect(id).toMatch(/^page-[0-9a-f]{16}$/)
      })
      expect(ids[0]).not.toBe(ids[1])
    })

    it('gives two clients two IDs and both attach', async () => {
      const second = makeEnv(env.hub)
      await connect()
      clients.push(await connectHub(second.options))
      expect(env.sockets[0]?.sent[0]).not.toBe(second.sockets[0]?.sent[0])
      expect(second.sockets).toHaveLength(1)
    })

    it('adds no input to the record', async () => {
      await connect()
      expect(env.hub.record()).toHaveLength(0)
    })
  })

  describe('the reader', () => {
    it('gives the same object until the part is a different object', async () => {
      const client = await connect()
      const first = client.getSnapshot()
      expect(client.getSnapshot()).toBe(first)
      await setTitle(env.hub, 'Two')
      await flush()
      expect(client.getSnapshot()).not.toBe(first)
      expect(client.getSnapshot()).toEqual(modelOf('Two'))
    })

    it('calls no listener for an applied event with the same part', async () => {
      const client = await connect()
      const listener = vi.fn()
      client.subscribe(listener)
      const first = client.getSnapshot()
      await setTitle(env.hub, 'One')
      await flush()
      expect(listener).not.toHaveBeenCalled()
      expect(client.getSnapshot()).toBe(first)
    })

    it('calls each listener one time with the new model', async () => {
      const client = await connect()
      const one = vi.fn()
      const two = vi.fn()
      client.subscribe(one)
      client.subscribe(two)
      await setTitle(env.hub, 'Two')
      await flush()
      expect(one).toHaveBeenCalledExactlyOnceWith(modelOf('Two'))
      expect(two).toHaveBeenCalledExactlyOnceWith(modelOf('Two'))
    })

    it('does not call a listener that was removed', async () => {
      const client = await connect()
      const listener = vi.fn()
      const stop = client.subscribe(listener)
      stop()
      await setTitle(env.hub, 'Two')
      await flush()
      expect(listener).not.toHaveBeenCalled()
    })

    it('keeps two registrations of one function separate', async () => {
      const client = await connect()
      const listener = vi.fn()
      const stop = client.subscribe(listener)
      client.subscribe(listener)
      stop()
      await setTitle(env.hub, 'Two')
      await flush()
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('calls the other listeners and writes one error when a listener throws', async () => {
      const client = await connect()
      const other = vi.fn()
      client.subscribe(() => {
        throw new Error('boom')
      })
      client.subscribe(other)
      await setTitle(env.hub, 'Two')
      await flush()
      expect(other).toHaveBeenCalledTimes(1)
      expect(error).toHaveBeenCalledTimes(1)
    })

    it('calls each listener one time after a new welcome with an equal model', async () => {
      const client = await connect()
      const first = client.getSnapshot()
      const one = vi.fn()
      const two = vi.fn()
      client.subscribe(one)
      client.subscribe(two)
      env.last().drop()
      await flush(500)
      expect(env.sockets).toHaveLength(2)
      expect(one).toHaveBeenCalledExactlyOnceWith(modelOf('One'))
      expect(two).toHaveBeenCalledTimes(1)
      expect(client.getSnapshot()).not.toBe(first)
      expect(client.getSnapshot()).toEqual(first)
    })

    it('gives the new title after the link comes back', async () => {
      const client = await connectAndDrop()
      env.hub = startHub('Three')
      await flush(500)
      expect(client.getSnapshot()).toEqual(modelOf('Three'))
    })

    it('does not call a removed listener after a new welcome', async () => {
      const client = await connect()
      const listener = vi.fn()
      client.subscribe(listener)()
      env.last().drop()
      await flush(500)
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('after the link ends', () => {
    it('keeps the picture and writes one warning for the loss', async () => {
      const client = await connectAndDrop()
      expect(client.getSnapshot()).toEqual(modelOf('One'))
      expect(warn).toHaveBeenCalledExactlyOnceWith(WARNING)
    })

    it('writes the warning again after a new welcome and a second loss', async () => {
      await connectAndDrop()
      await flush(500)
      expect(warn).toHaveBeenCalledTimes(1)
      env.last().drop()
      await flush()
      expect(warn).toHaveBeenCalledTimes(2)
    })

    it('waits 500 ms, 1 s, 2 s, 4 s, and then 5 s', async () => {
      await connectAndDrop()
      env.plan = ['fail', 'fail', 'fail', 'fail', 'fail']
      for (const delay of [500, 1000, 2000, 4000, 5000, 5000]) {
        const before = env.sockets.length
        await flush(delay - 1)
        expect(env.sockets).toHaveLength(before)
        await flush(1)
        expect(env.sockets).toHaveLength(before + 1)
      }
      expect(warn).toHaveBeenCalledTimes(1)
    })

    it('starts at 500 ms again after a new welcome', async () => {
      await connectAndDrop()
      env.plan = ['fail', 'fail']
      await flush(500)
      await flush(1000)
      await flush(2000)
      expect(env.sockets).toHaveLength(4)
      env.last().drop()
      await flush(499)
      expect(env.sockets).toHaveLength(4)
      await flush(1)
      expect(env.sockets).toHaveLength(5)
    })

    it('uses the delays of the options', async () => {
      env.options = { ...env.options, firstDelayMs: 10, maxDelayMs: 30 }
      await connectAndDrop()
      env.plan = ['fail', 'fail', 'fail']
      await flush(10)
      await flush(20)
      await flush(30)
      await flush(30)
      expect(env.sockets).toHaveLength(5)
    })

    it('writes one error for a refusal and tries again', async () => {
      await connectAndDrop()
      const stopped = startHub('One')
      stopped.stop()
      env.hub = stopped
      await flush(500)
      await flush(1000)
      expect(env.sockets).toHaveLength(3)
      expect(error).toHaveBeenCalledTimes(1)
    })
  })

  describe('close', () => {
    it('closes the link and writes no warning', async () => {
      const client = await connect()
      client.close()
      await flush(10_000)
      expect(env.last().closeCalls).toBeGreaterThan(0)
      expect(env.sockets).toHaveLength(1)
      expect(warn).not.toHaveBeenCalled()
    })

    it('does nothing the second time', async () => {
      const remove = vi.spyOn(window, 'removeEventListener')
      const client = await connect()
      client.close()
      const calls = env.last().closeCalls
      const removed = remove.mock.calls.length
      client.close()
      expect(env.last().closeCalls).toBe(calls)
      expect(remove.mock.calls).toHaveLength(removed)
    })

    it('closes the new link at once when it runs while a socket opens', async () => {
      const client = await connectAndDrop()
      const listener = vi.fn()
      client.subscribe(listener)
      env.plan = ['manual']
      await flush(500)
      expect(env.sockets).toHaveLength(2)
      client.close()
      env.last().open()
      await flush(10_000)
      expect(env.last().closeCalls).toBeGreaterThan(0)
      expect(env.last().readyState).toBe(3)
      expect(listener).not.toHaveBeenCalled()
      expect(env.sockets).toHaveLength(2)
    })

    it('closes the new link at once when it runs while the hello waits for the welcome', async () => {
      const client = await connectAndDrop()
      const listener = vi.fn()
      client.subscribe(listener)
      const first = client.getSnapshot()
      env.plan = ['manual']
      await flush(500)
      env.last().held = true
      env.last().open()
      await flush()
      client.close()
      env.last().release()
      await flush(10_000)
      expect(env.last().readyState).toBe(3)
      expect(listener).not.toHaveBeenCalled()
      expect(client.getSnapshot()).toBe(first)
      expect(env.sockets).toHaveLength(2)
    })

    it('opens no link when it runs while a delay runs', async () => {
      const client = await connectAndDrop()
      client.close()
      await flush(10_000)
      expect(env.sockets).toHaveLength(1)
    })
  })

  describe('pagehide', () => {
    it('closes the link, opens no new one, and writes no warning', async () => {
      const client = await connect()
      const listener = vi.fn()
      client.subscribe(listener)
      window.dispatchEvent(new Event('pagehide'))
      await flush(10_000)
      expect(env.last().closeCalls).toBeGreaterThan(0)
      expect(env.sockets).toHaveLength(1)
      expect(warn).not.toHaveBeenCalled()
      expect(listener).not.toHaveBeenCalled()
    })

    it('removes the listener when the client closes', async () => {
      const remove = vi.spyOn(window, 'removeEventListener')
      const client = await connect()
      client.close()
      expect(remove).toHaveBeenCalledWith('pagehide', expect.any(Function))
    })
  })
})
