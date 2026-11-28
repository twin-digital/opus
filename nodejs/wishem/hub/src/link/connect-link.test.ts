import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHub } from '../hub.js'
import type { Hub, ModelSubsystem, Port } from '../types.js'
import { createChannelPair } from './channel.js'
import type { Channel, WebSocketLike } from './channel.js'
import { connectLink } from './connect-link.js'
import type { ConnectLinkOptions, LinkClient } from './connect-link.js'
import type { LinkRefusedError } from './open-link.js'
import { serveLink } from './serve-link.js'

interface Counter {
  count: number
}

const counter: ModelSubsystem<Counter> = {
  id: 'counter',
  inputs: ['counter/add'],
  initial: { count: 0 },
  apply: (part, input) => ({ count: part.count + (input.payload as { by: number }).by }),
}

const startHub = (): Hub => {
  const hub = createHub({ subsystems: [counter] })
  hub.start()
  return hub
}

type Mode = 'open' | 'fail' | 'manual'

type Handler = (event: { data?: unknown }) => void

/** A socket that joins the client to `serveLink` of a hub. */
class FakeSocket implements WebSocketLike {
  readyState = 0
  closeCalls = 0
  readonly sent: string[] = []
  held = false
  /** A socket that ends only when the hub side ends it. */
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
  options: Pick<ConnectLinkOptions, 'url' | 'createSocket'> & Partial<ConnectLinkOptions>
  last: () => FakeSocket
}

const makeEnv = (hub: Hub): Env => {
  const env: Env = {
    hub,
    sockets: [],
    plan: [],
    options: { url: 'ws://link.test/link', createSocket: () => new FakeSocket('', hub) },
    last: () => {
      const socket = env.sockets.at(-1)
      if (!socket) {
        throw new Error('no socket')
      }
      return socket
    },
  }
  env.options = {
    url: 'ws://link.test/link',
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

const idsOf = (socket: FakeSocket) =>
  (JSON.parse(socket.sent[0] ?? '{}') as { subsystems: { id: string; kind: string }[] }).subsystems

describe('connectLink', () => {
  let env: Env
  let clients: LinkClient[]
  let links: (readonly Port[])[]
  let downs: number
  let refusals: LinkRefusedError[]
  let errors: unknown[]

  const handlers = (): Pick<ConnectLinkOptions, 'onLink' | 'onDown' | 'onRefused' | 'onError'> => ({
    onLink: (ports) => {
      links.push(ports)
    },
    onDown: () => {
      downs += 1
    },
    onRefused: (error) => {
      refusals.push(error)
    },
    onError: (cause) => {
      errors.push(cause)
    },
  })

  const waitForLinks = async (count: number) => {
    for (let tries = 0; tries < 20 && links.length < count; tries += 1) {
      await flush()
    }
    expect(links).toHaveLength(count)
  }

  const connect = (extra: Partial<ConnectLinkOptions> = {}) => {
    const client = connectLink({
      ...env.options,
      subsystems: [{ prefix: 'page', kind: 'output' }],
      ...handlers(),
      ...extra,
    })
    clients.push(client)
    return client
  }

  const connectAndDrop = async () => {
    const client = connect()
    await waitForLinks(1)
    env.last().drop()
    await flush()
    return client
  }

  beforeEach(() => {
    vi.useFakeTimers()
    env = makeEnv(startHub())
    clients = []
    links = []
    downs = 0
    refusals = []
    errors = []
  })

  afterEach(() => {
    clients.forEach((client) => {
      client.close()
    })
    vi.useRealTimers()
  })

  describe('the list of subsystems', () => {
    it('throws at the call when the list is empty', () => {
      expect(() => connectLink({ ...env.options, subsystems: [], ...handlers() })).toThrow()
      expect(env.sockets).toHaveLength(0)
    })

    it('calls createSocket with the address', async () => {
      connect({ url: 'ws://other.test/x' })
      await waitForLinks(1)
      expect(env.sockets[0]?.url).toBe('ws://other.test/x')
    })

    it('gives onLink one port for each subsystem, in the order of the options, after the welcome only', async () => {
      env.plan = ['manual']
      connect({
        subsystems: [
          { prefix: 'screen', kind: 'output' },
          { prefix: 'buttons', kind: 'input' },
        ],
      })
      env.last().held = true
      env.last().open()
      await flush()
      expect(env.last().sent).toHaveLength(1)
      expect(links).toHaveLength(0)
      env.last().release()
      await waitForLinks(1)
      const ports = links[0] ?? []
      expect(ports.map((port) => port.subsystem.kind)).toEqual(['output', 'input'])
      expect(ports[0]?.subsystem.id).toMatch(/^screen-[0-9a-f]{16}$/)
      expect(ports[1]?.subsystem.id).toMatch(/^buttons-[0-9a-f]{16}$/)
      const result = await ports[1]?.submit({ type: 'counter/add', payload: { by: 2 } })
      expect(result).toEqual({ ok: true, seq: 1 })
      expect(env.hub.record()[0]?.source).toBe(ports[1]?.subsystem.id)
      expect(ports[0]?.read()).toEqual({ counter: { count: 2 } })
    })

    it('attaches an output and an input subsystem on one link', async () => {
      connect({
        subsystems: [
          { prefix: 'output', kind: 'output' },
          { prefix: 'input', kind: 'input' },
        ],
      })
      await waitForLinks(1)
      expect(idsOf(env.last()).map((subsystem) => subsystem.kind)).toEqual(['output', 'input'])
    })

    it('uses an ID of the form prefix and 16 hex that is the same for each link', async () => {
      connect({
        subsystems: [
          { prefix: 'page', kind: 'output' },
          { prefix: 'page-input', kind: 'input' },
        ],
      })
      await waitForLinks(1)
      env.last().drop()
      await flush(500)
      await waitForLinks(2)
      const [first = [], second = []] = env.sockets.map((socket) => idsOf(socket).map((subsystem) => subsystem.id))
      expect(first).toHaveLength(2)
      expect(first[0]).toMatch(/^page-[0-9a-f]{16}$/)
      expect(first[1]).toMatch(/^page-input-[0-9a-f]{16}$/)
      expect(second).toEqual(first)
    })

    it('uses one hex for all IDs of the client, and puts the suffix after it', async () => {
      connect({
        subsystems: [
          { prefix: 'page', kind: 'output' },
          { prefix: 'page', suffix: '-input', kind: 'input' },
        ],
      })
      await waitForLinks(1)
      const [output, input] = idsOf(env.last()).map((subsystem) => subsystem.id)
      expect(output).toMatch(/^page-[0-9a-f]{16}$/)
      expect(input).toBe(`${output}-input`)
    })

    it('makes new IDs for all subsystems after a refusal with id-in-use, and keeps them after', async () => {
      connect({
        subsystems: [
          { prefix: 'page', kind: 'output' },
          { prefix: 'page-input', kind: 'input' },
        ],
      })
      await waitForLinks(1)
      const firstIds = idsOf(env.last()).map((subsystem) => subsystem.id)
      env.last().drop()
      await flush()
      const taken = env.hub.attach({ id: firstIds[0] ?? '', kind: 'input' })
      await flush(500)
      expect(refusals.map((error) => error.reason)).toEqual(['id-in-use'])
      expect(links).toHaveLength(1)
      await flush(1000)
      await waitForLinks(2)
      const thirdIds = idsOf(env.last()).map((subsystem) => subsystem.id)
      expect(thirdIds[0]).not.toBe(firstIds[0])
      expect(thirdIds[1]).not.toBe(firstIds[1])
      expect(thirdIds[0]).toMatch(/^page-[0-9a-f]{16}$/)
      taken.close()
      env.last().drop()
      await flush(500)
      await waitForLinks(3)
      expect(idsOf(env.last()).map((subsystem) => subsystem.id)).toEqual(thirdIds)
    })

    it('keeps the IDs after a refusal with another reason', async () => {
      connect()
      await waitForLinks(1)
      const firstIds = idsOf(env.last()).map((subsystem) => subsystem.id)
      env.last().drop()
      await flush()
      env.hub.stop()
      await flush(500)
      env.hub = startHub()
      await flush(1000)
      await waitForLinks(2)
      expect(refusals.map((error) => error.reason)).toEqual(['stopped'])
      expect(idsOf(env.last()).map((subsystem) => subsystem.id)).toEqual(firstIds)
    })

    it('gives two clients two IDs and both attach', async () => {
      const second = makeEnv(env.hub)
      connect()
      connectLink({
        ...second.options,
        subsystems: [{ prefix: 'page', kind: 'output' }],
        onLink: (ports) => {
          links.push(ports)
        },
      })
      await waitForLinks(2)
      expect(env.sockets[0]?.sent[0]).not.toBe(second.sockets[0]?.sent[0])
      expect(second.sockets).toHaveLength(1)
    })

    it('adds no input to the record', async () => {
      connect()
      await waitForLinks(1)
      expect(env.hub.record()).toHaveLength(0)
    })
  })

  describe('the ports of a link', () => {
    it('calls onLink one time after each welcome, with the ports of the new link', async () => {
      connect()
      await waitForLinks(1)
      env.last().drop()
      await flush(500)
      await waitForLinks(2)
      expect(links[1]?.[0]).not.toBe(links[0]?.[0])
    })

    it('keeps the last state in the port of a link that ended', async () => {
      connect()
      await waitForLinks(1)
      await env.hub.attach({ id: 'tester', kind: 'input' }).submit({ type: 'counter/add', payload: { by: 3 } })
      await flush()
      env.last().drop()
      await flush()
      expect(links[0]?.[0]?.read()).toEqual({ counter: { count: 3 } })
      expect(links).toHaveLength(1)
    })
  })

  describe('onDown and onRefused', () => {
    it('calls onDown one time at the start when the hub side is not reachable', async () => {
      env.plan = ['fail', 'fail']
      connect()
      await flush()
      expect(downs).toBe(1)
      expect(links).toHaveLength(0)
      await flush(500)
      await flush(1000)
      expect(env.sockets).toHaveLength(3)
      expect(downs).toBe(1)
      expect(refusals).toHaveLength(0)
      await waitForLinks(1)
    })

    it('calls onDown one time for the loss of a link', async () => {
      await connectAndDrop()
      expect(downs).toBe(1)
      env.plan = ['fail', 'fail', 'fail']
      await flush(500)
      await flush(1000)
      await flush(2000)
      expect(downs).toBe(1)
    })

    it('calls onDown again after a new welcome and a second loss', async () => {
      await connectAndDrop()
      await flush(500)
      expect(downs).toBe(1)
      env.last().drop()
      await flush()
      expect(downs).toBe(2)
    })

    it('calls onRefused one time for each period with no link, and tries again', async () => {
      const stopped = startHub()
      stopped.stop()
      env.hub = stopped
      connect()
      await flush()
      await flush(500)
      await flush(1000)
      expect(env.sockets).toHaveLength(3)
      expect(refusals).toHaveLength(1)
      expect(refusals[0]?.message).toContain('stopped')
      expect(links).toHaveLength(0)
      env.hub = startHub()
      await flush(2000)
      await waitForLinks(1)
      env.last().drop()
      await flush()
      env.hub.stop()
      await flush(500)
      await flush(1000)
      expect(refusals).toHaveLength(2)
    })

    it('needs no onDown and no onRefused', async () => {
      const stopped = startHub()
      stopped.stop()
      env.hub = stopped
      connectLink({
        ...env.options,
        subsystems: [{ prefix: 'page', kind: 'output' }],
        onLink: (ports) => {
          links.push(ports)
        },
      })
      await flush(500)
      expect(env.sockets).toHaveLength(2)
    })
  })

  describe('the waits', () => {
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
      expect(downs).toBe(1)
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

    it('uses the waits of the options', async () => {
      env.options = { ...env.options, firstDelayMs: 10, maxDelayMs: 30 }
      connect(env.options)
      await waitForLinks(1)
      env.last().drop()
      await flush()
      env.plan = ['fail', 'fail', 'fail']
      await flush(10)
      await flush(20)
      await flush(30)
      await flush(30)
      expect(env.sockets).toHaveLength(5)
    })
  })

  describe('a callback throws', () => {
    it('onLink: gives the error to onError, keeps the link open, and calls onLink after the next welcome', async () => {
      let calls = 0
      connect({
        onLink: (ports) => {
          calls += 1
          links.push(ports)
          if (calls === 1) {
            throw new Error('boom')
          }
        },
      })
      await waitForLinks(1)
      expect(errors).toHaveLength(1)
      expect((errors[0] as Error).message).toBe('boom')
      expect(env.last().readyState).toBe(1)
      expect(env.last().closeCalls).toBe(0)
      expect(downs).toBe(0)
      env.last().drop()
      await flush(500)
      await waitForLinks(2)
      expect(calls).toBe(2)
      expect(errors).toHaveLength(1)
    })

    it('onDown: gives the error to onError, and tries again', async () => {
      connect({
        onDown: () => {
          throw new Error('down')
        },
      })
      await waitForLinks(1)
      env.last().drop()
      await flush()
      expect(errors).toHaveLength(1)
      expect((errors[0] as Error).message).toBe('down')
      await flush(500)
      await waitForLinks(2)
    })

    it('a listener of the link: gives the error to onError', async () => {
      connect()
      await waitForLinks(1)
      links[0]?.[0]?.subscribe(() => {
        throw new Error('listener')
      })
      await env.hub.attach({ id: 'tester', kind: 'input' }).submit({ type: 'counter/add', payload: { by: 1 } })
      await flush()
      expect(errors.map((cause) => (cause as Error).message)).toEqual(['listener'])
    })

    it('onError: a throw changes nothing, and the client tries again', async () => {
      connect({
        onDown: () => {
          throw new Error('down')
        },
        onError: () => {
          throw new Error('error')
        },
      })
      await waitForLinks(1)
      env.last().drop()
      await flush(500)
      await waitForLinks(2)
    })

    it('onRefused: gives the error to onError, and tries again', async () => {
      const stopped = startHub()
      stopped.stop()
      env.hub = stopped
      connect({
        onRefused: () => {
          throw new Error('refused')
        },
      })
      await flush()
      expect(errors.map((cause) => (cause as Error).message)).toEqual(['refused'])
      await flush(500)
      expect(env.sockets).toHaveLength(2)
    })
  })

  describe('close', () => {
    it('closes the link and calls no onDown', async () => {
      const client = connect()
      await waitForLinks(1)
      client.close()
      await flush(10_000)
      expect(env.last().closeCalls).toBeGreaterThan(0)
      expect(env.sockets).toHaveLength(1)
      expect(downs).toBe(0)
    })

    it('does nothing the second time', async () => {
      const client = connect()
      await waitForLinks(1)
      client.close()
      const calls = env.last().closeCalls
      client.close()
      expect(env.last().closeCalls).toBe(calls)
    })

    it('does nothing the second time while a socket opens', async () => {
      env.plan = ['manual']
      const client = connect()
      await flush()
      client.close()
      client.close()
      expect(env.last().closeCalls).toBe(1)
    })

    it('during a wait: does not close the socket of the failed attempt again', async () => {
      env.plan = ['fail']
      const client = connect()
      await flush()
      expect(env.last().closeCalls).toBe(0)
      client.close()
      expect(env.last().closeCalls).toBe(0)
    })

    it('during a wait after a link ended: does not close the old socket again', async () => {
      const client = await connectAndDrop()
      const calls = env.last().closeCalls
      client.close()
      expect(env.last().closeCalls).toBe(calls)
    })

    it('inside onLink: closes the link, calls onLink no more, and calls no onDown', async () => {
      const holder: { client?: LinkClient } = {}
      holder.client = connect({
        onLink: (ports) => {
          links.push(ports)
          holder.client?.close()
        },
      })
      await waitForLinks(1)
      await flush(10_000)
      expect(env.last().closeCalls).toBeGreaterThan(0)
      expect(env.last().readyState).toBe(3)
      expect(env.sockets).toHaveLength(1)
      expect(links).toHaveLength(1)
      expect(downs).toBe(0)
      expect(errors).toHaveLength(0)
    })

    it('before the first welcome: calls no onLink and no onDown', async () => {
      env.plan = ['manual']
      const client = connect()
      await flush()
      expect(env.sockets).toHaveLength(1)
      client.close()
      expect(env.last().closeCalls).toBeGreaterThan(0)
      await flush(10_000)
      expect(links).toHaveLength(0)
      expect(env.sockets).toHaveLength(1)
      expect(downs).toBe(0)
    })

    it('while a socket opens: closes the socket at once and calls no onLink', async () => {
      const client = await connectAndDrop()
      env.plan = ['manual']
      await flush(500)
      expect(env.sockets).toHaveLength(2)
      client.close()
      expect(env.last().closeCalls).toBeGreaterThan(0)
      expect(env.last().readyState).toBe(3)
      await flush(10_000)
      expect(links).toHaveLength(1)
      expect(env.sockets).toHaveLength(2)
      expect(downs).toBe(1)
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
      expect(links).toHaveLength(1)
      expect(env.sockets).toHaveLength(2)
    })

    it('closes a link whose welcome comes after it ran, and calls no onLink', async () => {
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
      expect(links).toHaveLength(1)
      expect(env.sockets).toHaveLength(2)
    })

    it('during a wait: opens no link and calls no onLink', async () => {
      const client = await connectAndDrop()
      const before = downs
      client.close()
      await flush(10_000)
      expect(env.sockets).toHaveLength(1)
      expect(links).toHaveLength(1)
      expect(downs).toBe(before)
    })
  })
})
