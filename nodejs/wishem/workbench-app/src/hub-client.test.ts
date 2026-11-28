import { createStore, storeInputs, type Model } from '@thrashplay/wishem-core'
import {
  createChannelPair,
  createHub,
  serveLink,
  type Channel,
  type Hub,
  type Port,
  type WebSocketLike,
} from '@thrashplay/wishem-hub'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { connectHub, type HubClient, type HubClientOptions, type HubPorts } from './hub-client.js'

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
  /** A socket that ends only when the hub side ends it, like a close that is not yet done. */
  lazy = false
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
    if (this.lazy) {
      return
    }
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
  options: Omit<HubClientOptions, 'onPorts'>
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

type Options = Omit<HubClientOptions, 'onPorts'>

const storeOf = (port: Port) => port.read().store

describe('connectHub', () => {
  let env: Env
  let clients: HubClient[]
  let ports: Port[]
  let portPairs: HubPorts[]
  let warn: MockInstance<typeof console.warn>
  let error: MockInstance<typeof console.error>

  const onPorts = (pair: HubPorts) => {
    portPairs.push(pair)
    ports.push(pair.output)
  }

  /** Waits for `count` calls of `onPorts`. Fails by an assertion when they do not come. */
  const waitForPorts = async (count: number) => {
    for (let tries = 0; tries < 20 && ports.length < count; tries += 1) {
      await flush()
    }
    expect(ports).toHaveLength(count)
  }

  const connect = async (options: Options = env.options) => {
    const client = connectHub({ ...options, onPorts })
    clients.push(client)
    await waitForPorts(1)
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
    ports = []
    portPairs = []
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
    it('calls onPorts after the welcome message and not before', async () => {
      env.plan = ['manual']
      clients.push(connectHub({ ...env.options, onPorts }))
      env.last().held = true
      env.last().open()
      await flush()
      expect(env.last().sent).toHaveLength(1)
      expect(ports).toHaveLength(0)
      env.last().release()
      await waitForPorts(1)
      expect(storeOf(ports[0])).toEqual(modelOf('One'))
    })

    it('writes one warning, keeps trying, and calls onPorts when the hub answers', async () => {
      env.plan = ['fail', 'fail']
      clients.push(connectHub({ ...env.options, onPorts }))
      await flush()
      expect(warn).toHaveBeenCalledExactlyOnceWith(WARNING)
      expect(ports).toHaveLength(0)
      await flush(500)
      await flush(1000)
      expect(env.sockets).toHaveLength(3)
      expect(warn).toHaveBeenCalledTimes(1)
      await waitForPorts(1)
    })

    it('writes one error for a refusal, and tries again', async () => {
      const stopped = startHub('One')
      stopped.stop()
      env.hub = stopped
      clients.push(connectHub({ ...env.options, onPorts }))
      await flush()
      await flush(500)
      await flush(1000)
      expect(env.sockets).toHaveLength(3)
      expect(error).toHaveBeenCalledTimes(1)
      expect(String(error.mock.calls[0]?.[0])).toContain('stopped')
      expect(ports).toHaveLength(0)
      env.hub = startHub('Two')
      await flush(2000)
      await waitForPorts(1)
    })
  })

  describe('the subsystems of the page', () => {
    interface Hello {
      subsystems: { id: string; kind: string }[]
    }
    const helloOf = (socket: FakeSocket) => JSON.parse(socket.sent[0] ?? '{}') as Hello

    it('attaches an output subsystem and an input subsystem in one hello', async () => {
      await connect()
      expect(env.sockets).toHaveLength(1)
      const [output, input] = helloOf(env.last()).subsystems
      expect(output.kind).toBe('output')
      expect(input.kind).toBe('input')
      expect(output.id).toMatch(/^page-[0-9a-f]{16}$/)
      expect(input.id).toBe(`${output.id}-input`)
      expect(input.id).toMatch(/^page-[0-9a-f]{16}-input$/)
    })

    it('gives onPorts the output port and the input port of the link', async () => {
      await connect()
      const { output, input } = portPairs[0] ?? (undefined as never)
      expect(output.subsystem.kind).toBe('output')
      expect(input.subsystem.kind).toBe('input')
      const result = await input.submit(inputs.setField({ entity: E1, componentType: CT, field: FLD, value: 'Two' }))
      expect(result.ok).toBe(true)
      expect(env.hub.record().at(-1)?.source).toBe(input.subsystem.id)
      expect(storeOf(output)).toEqual(modelOf('Two'))
    })

    it('uses the same two IDs after a link ends', async () => {
      await connect()
      env.last().drop()
      await flush(500)
      await waitForPorts(2)
      expect(env.sockets).toHaveLength(2)
      expect(helloOf(env.sockets[1]).subsystems).toEqual(helloOf(env.sockets[0]).subsystems)
      expect(portPairs[1]?.input.subsystem.id).toBe(portPairs[0]?.input.subsystem.id)
    })

    it('writes one error and makes a new hex for both IDs after a refusal with id-in-use', async () => {
      await connect()
      const first = helloOf(env.last()).subsystems
      env.last().drop()
      await flush()
      const taken = env.hub.attach({ id: first[1]?.id ?? '', kind: 'input' })
      await flush(500)
      expect(error).toHaveBeenCalledTimes(1)
      expect(String(error.mock.calls[0]?.[0])).toContain('id-in-use')
      await flush(1000)
      await waitForPorts(2)
      const next = helloOf(env.last()).subsystems
      const hex = (id: string | undefined) => /^page-([0-9a-f]{16})/.exec(id ?? '')?.[1]
      expect(hex(next[0]?.id)).not.toBe(hex(first[0]?.id))
      expect(hex(next[1]?.id)).toBe(hex(next[0]?.id))
      expect(next[1]?.id).toMatch(/-input$/)
      taken.close()
    })

    it('writes no second error for a refusal with another reason in the same period', async () => {
      await connect()
      env.last().drop()
      await flush()
      const taken = env.hub.attach({ id: helloOf(env.last()).subsystems[0]?.id ?? '', kind: 'input' })
      await flush(500)
      expect(error).toHaveBeenCalledTimes(1)
      taken.close()
      env.hub.stop()
      await flush(1000)
      await flush(2000)
      expect(error).toHaveBeenCalledTimes(1)
    })

    it('gives two clients four different IDs', async () => {
      const second = makeEnv(env.hub)
      await connect()
      clients.push(connectHub({ ...second.options, onPorts }))
      await waitForPorts(2)
      const ids = [env.sockets[0], second.sockets[0]].flatMap((socket) =>
        helloOf(socket).subsystems.map((subsystem) => subsystem.id),
      )
      expect(new Set(ids).size).toBe(4)
      expect(second.sockets).toHaveLength(1)
    })

    it('adds no input to the record', async () => {
      await connect()
      expect(env.hub.record()).toHaveLength(0)
    })
  })

  describe('the port of a link', () => {
    it('is the port of the link, and gives the model of the hub', async () => {
      await connect()
      expect(storeOf(ports[0])).toEqual(modelOf('One'))
    })

    it('follows the hub while the link is open', async () => {
      await connect()
      const port = ports[0]
      const listener = vi.fn()
      port.subscribe(listener)
      await setTitle(env.hub, 'Two')
      await flush()
      expect(listener).toHaveBeenCalled()
      expect(storeOf(port)).toEqual(modelOf('Two'))
    })

    it('calls onPorts one time after each welcome, with the port of the new link', async () => {
      await connect()
      env.last().drop()
      await flush(500)
      expect(env.sockets).toHaveLength(2)
      await waitForPorts(2)
      expect(ports[1]).not.toBe(ports[0])
      expect(storeOf(ports[1])).toEqual(modelOf('One'))
    })

    it('gives the new title after the link comes back', async () => {
      await connectAndDrop()
      env.hub = startHub('Three')
      await flush(500)
      await waitForPorts(2)
      expect(storeOf(ports[1])).toEqual(modelOf('Three'))
    })

    it('keeps the last state in the port of a link that ended', async () => {
      await connectAndDrop()
      expect(storeOf(ports[0])).toEqual(modelOf('One'))
      expect(ports).toHaveLength(1)
    })
  })

  describe('after the link ends', () => {
    it('writes one warning for the loss', async () => {
      await connectAndDrop()
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

  describe('onPorts throws', () => {
    it('writes one error, keeps the link open, and calls onPorts again after the next welcome', async () => {
      let calls = 0
      const failing = (pair: HubPorts) => {
        calls += 1
        ports.push(pair.output)
        if (calls === 1) {
          throw new Error('boom')
        }
      }
      clients.push(connectHub({ ...env.options, onPorts: failing }))
      await waitForPorts(1)
      expect(error).toHaveBeenCalledTimes(1)
      expect(env.last().readyState).toBe(1)
      expect(env.last().closeCalls).toBe(0)
      expect(warn).not.toHaveBeenCalled()
      env.last().drop()
      await flush(500)
      await waitForPorts(2)
      expect(calls).toBe(2)
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

    it('inside onPortss: closes the link, calls onPorts no more, and writes no warning', async () => {
      const holder: { client?: HubClient } = {}
      const closing = (pair: HubPorts) => {
        ports.push(pair.output)
        holder.client?.close()
      }
      holder.client = connectHub({ ...env.options, onPorts: closing })
      clients.push(holder.client)
      await waitForPorts(1)
      await flush(10_000)
      expect(env.last().closeCalls).toBeGreaterThan(0)
      expect(env.last().readyState).toBe(3)
      expect(env.sockets).toHaveLength(1)
      expect(ports).toHaveLength(1)
      expect(warn).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
    })

    it('before the first welcome: calls no onPorts and writes no warning', async () => {
      env.plan = ['manual']
      const client = connectHub({ ...env.options, onPorts })
      clients.push(client)
      await flush()
      expect(env.sockets).toHaveLength(1)
      client.close()
      expect(env.last().closeCalls).toBeGreaterThan(0)
      await flush(10_000)
      expect(ports).toHaveLength(0)
      expect(env.sockets).toHaveLength(1)
      expect(warn).not.toHaveBeenCalled()
    })

    it('while a socket opens: closes the socket at once and calls no onPorts', async () => {
      const client = await connectAndDrop()
      env.plan = ['manual']
      await flush(500)
      expect(env.sockets).toHaveLength(2)
      client.close()
      expect(env.last().closeCalls).toBeGreaterThan(0)
      expect(env.last().readyState).toBe(3)
      await flush(10_000)
      expect(ports).toHaveLength(1)
      expect(env.sockets).toHaveLength(2)
      expect(warn).toHaveBeenCalledTimes(1)
    })

    it('closes a socket that opens after it ran, and sends no hello', async () => {
      const client = await connectAndDrop()
      env.plan = ['manual']
      await flush(500)
      const socket = env.last()
      socket.lazy = true
      client.close()
      expect(socket.closeCalls).toBe(1)
      socket.open()
      await flush(10_000)
      expect(socket.sent).toHaveLength(0)
      expect(socket.closeCalls).toBe(2)
      expect(ports).toHaveLength(1)
      expect(env.sockets).toHaveLength(2)
    })

    it('closes a link whose welcome comes after it ran, and calls no onPorts', async () => {
      const client = await connectAndDrop()
      env.plan = ['manual']
      await flush(500)
      const socket = env.last()
      socket.held = true
      socket.open()
      await flush()
      socket.lazy = true
      client.close()
      expect(socket.closeCalls).toBe(1)
      socket.release()
      await flush(10_000)
      expect(socket.closeCalls).toBe(2)
      expect(ports).toHaveLength(1)
      expect(env.sockets).toHaveLength(2)
    })

    it('during a delay: opens no link and calls no onPorts', async () => {
      const client = await connectAndDrop()
      const warnings = warn.mock.calls.length
      client.close()
      await flush(10_000)
      expect(env.sockets).toHaveLength(1)
      expect(ports).toHaveLength(1)
      expect(warn).toHaveBeenCalledTimes(warnings)
    })
  })

  describe('pagehide', () => {
    it('closes the link, opens no new one, and writes no warning', async () => {
      await connect()
      window.dispatchEvent(new Event('pagehide'))
      await flush(10_000)
      expect(env.last().closeCalls).toBeGreaterThan(0)
      expect(env.sockets).toHaveLength(1)
      expect(warn).not.toHaveBeenCalled()
      expect(ports).toHaveLength(1)
    })

    it('removes the listener when the client closes', async () => {
      const remove = vi.spyOn(window, 'removeEventListener')
      const client = await connect()
      client.close()
      expect(remove).toHaveBeenCalledWith('pagehide', expect.any(Function))
    })

    it('does nothing after close()', async () => {
      const client = await connect()
      client.close()
      const calls = env.last().closeCalls
      window.dispatchEvent(new Event('pagehide'))
      await flush(10_000)
      expect(env.last().closeCalls).toBe(calls)
      expect(env.sockets).toHaveLength(1)
      expect(warn).not.toHaveBeenCalled()
      expect(error).not.toHaveBeenCalled()
    })
  })
})
