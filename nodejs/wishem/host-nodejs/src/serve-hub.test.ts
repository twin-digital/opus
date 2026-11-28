import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createTime } from '@thrashplay/wishem-clock'
import { createStore } from '@thrashplay/wishem-core'
import type { Model } from '@thrashplay/wishem-core'
import { createHub, LINK_PROTOCOL_VERSION, openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import type { Hub, HubEvent, RemoteLink } from '@thrashplay/wishem-hub'
import { afterEach, describe, expect, it } from 'vitest'
import { serveHub } from './serve-hub.js'
import type { HubServer } from './serve-hub.js'

const model: Model = { definitions: [], entities: [] }

const makeHub = () => createHub({ subsystems: [createTime(), createStore({ model })] })

const eventually = async (check: () => boolean, ms = 2000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('timeout')
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

const portOf = (server: HubServer) => Number(new URL(server.url).port)

const canListen = (port: number) =>
  new Promise<boolean>((resolve) => {
    const probe = createServer()
    probe.once('error', () => {
      resolve(false)
    })
    probe.listen(port, '127.0.0.1', () => {
      probe.close(() => {
        resolve(true)
      })
    })
  })

describe('serveHub', () => {
  let servers: HubServer[]
  let sockets: WebSocket[]
  let links: RemoteLink[]
  let blockers: ReturnType<typeof createServer>[]

  const serve = async (hub: Hub, port = 0) => {
    const server = await serveHub(hub, { port })
    servers.push(server)
    return server
  }

  const open = async (server: HubServer) => {
    const socket = new WebSocket(server.linkUrl)
    sockets.push(socket)
    const link = await openLink(await webSocketChannel(socket), [{ id: 'viewer', kind: 'output' }])
    links.push(link)
    return link
  }

  /** Gives the `welcome` message that the hub sends for a hello. */
  const welcomeOf = async (server: HubServer) => {
    const socket = new WebSocket(server.linkUrl)
    sockets.push(socket)
    const channel = await webSocketChannel(socket)
    const text = new Promise<string>((resolve) => {
      channel.onMessage(resolve)
    })
    channel.send(
      JSON.stringify({ t: 'hello', protocol: LINK_PROTOCOL_VERSION, subsystems: [{ id: 'probe', kind: 'output' }] }),
    )
    return JSON.parse(await text) as { t: string; status: string }
  }

  afterEach(async () => {
    links.forEach((link) => {
      link.close()
    })
    sockets.forEach((socket) => {
      socket.close()
    })
    await Promise.all(servers.map((server) => server.close()))
    await Promise.all(
      blockers.map(
        (blocker) =>
          new Promise<void>((resolve) =>
            blocker.close(() => {
              resolve()
            }),
          ),
      ),
    )
  })

  const setup = () => {
    servers = []
    sockets = []
    links = []
    blockers = []
  }

  describe('with a server', () => {
    it('names 127.0.0.1 and the selected port, and sends welcome with the parts time and store', async () => {
      setup()
      const hub = makeHub()
      const server = await serve(hub)
      hub.start()
      const port = portOf(server)
      expect(port).toBeGreaterThan(0)
      expect(server.url).toBe(`http://127.0.0.1:${port}`)
      expect(server.linkUrl).toBe(`ws://127.0.0.1:${port}/link`)
      const link = await open(server)
      expect(Object.keys(link.ports.viewer.read()).sort()).toEqual(['store', 'time'])
    })

    it('does not start the hub', async () => {
      setup()
      const hub = makeHub()
      const server = await serve(hub)
      expect(hub.status).toBe('created')
      expect((await welcomeOf(server)).status).toBe('created')
      const link = await open(server)
      const events: HubEvent[] = []
      link.ports.viewer.subscribe((event) => {
        events.push(event)
      })
      hub.start()
      await eventually(() => events.some((event) => event.type === 'started'))
    })

    it('refuses a foreign Origin with 403 and attaches nothing', async () => {
      setup()
      const hub = makeHub()
      const server = await serve(hub)
      hub.start()
      const { WebSocket: NodeSocket } = await import('ws')
      const socket = new NodeSocket(server.linkUrl, { headers: { Origin: 'https://example.com' } })
      const status = await new Promise<number>((resolve) => {
        socket.on('unexpected-response', (_request, response) => {
          resolve(response.statusCode ?? 0)
        })
        socket.on('error', () => undefined)
      })
      expect(status).toBe(403)
    })

    it('answers a plain request with 404 and a JSON error', async () => {
      setup()
      const server = await serve(makeHub())
      const response = await fetch(`${server.url}/x`)
      expect(response.status).toBe(404)
      expect(typeof ((await response.json()) as { error: unknown }).error).toBe('string')
    })
  })

  describe('with a port in use', () => {
    it('rejects with EADDRINUSE, attaches nothing, and works on port 0 afterwards', async () => {
      setup()
      const blocker = createServer()
      blockers.push(blocker)
      await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
      const { port } = blocker.address() as AddressInfo
      const hub = makeHub()
      await expect(serveHub(hub, { port })).rejects.toMatchObject({ code: 'EADDRINUSE' })
      expect(hub.status).toBe('created')
      const server = await serve(hub)
      expect(portOf(server)).not.toBe(port)
      hub.start()
      expect(Object.keys((await open(server)).ports.viewer.read()).sort()).toEqual(['store', 'time'])
    })
  })

  describe('close', () => {
    it('stops the hub, ends the link, and releases the port', async () => {
      setup()
      const hub = makeHub()
      const server = await serve(hub)
      hub.start()
      const link = await open(server)
      const events: HubEvent[] = []
      link.ports.viewer.subscribe((event) => {
        events.push(event)
      })
      const port = portOf(server)
      await server.close()
      expect(events.map(({ type }) => type)).toContain('stopping')
      await link.closed
      expect(hub.status).toBe('stopped')
      expect(await canListen(port)).toBe(true)
    })

    it('gives the same promise on two calls', async () => {
      setup()
      const hub = makeHub()
      const server = await serve(hub)
      hub.start()
      const first = server.close()
      expect(server.close()).toBe(first)
      await expect(first).resolves.toBeUndefined()
    })

    it('works when the hub never started, and releases the port', async () => {
      setup()
      const hub = makeHub()
      const server = await serve(hub)
      const port = portOf(server)
      await expect(server.close()).resolves.toBeUndefined()
      expect(hub.status).toBe('created')
      expect(await canListen(port)).toBe(true)
    })

    it('works after the caller stopped the hub', async () => {
      setup()
      const hub = makeHub()
      const server = await serve(hub)
      hub.start()
      hub.stop()
      await expect(server.close()).resolves.toBeUndefined()
    })

    it('works from inside a listener during an applied event', async () => {
      setup()
      const hub = makeHub()
      const server = await serve(hub)
      const input = hub.attach({ id: 'input', kind: 'input' })
      const watcher = hub.attach({ id: 'watcher', kind: 'output' })
      hub.start()
      let closing: Promise<void> | undefined
      watcher.subscribe((event) => {
        if (event.type === 'applied') {
          closing = server.close()
        }
      })
      await input.submit({ type: 'time/advance', payload: { ms: 10 } })
      expect(closing).toBeDefined()
      await expect(closing).resolves.toBeUndefined()
      expect(hub.status).toBe('stopped')
    })

    it('works from inside a listener of the event stopping', async () => {
      setup()
      const hub = makeHub()
      const server = await serve(hub)
      const watcher = hub.attach({ id: 'watcher', kind: 'output' })
      hub.start()
      const link = await open(server)
      const stoppings: string[] = []
      link.ports.viewer.subscribe((event) => {
        if (event.type === 'stopping') {
          stoppings.push(event.type)
        }
      })
      const port = portOf(server)
      let closing: Promise<void> | undefined
      watcher.subscribe((event) => {
        if (event.type === 'stopping') {
          closing = server.close()
        }
      })
      hub.stop()
      expect(closing).toBeDefined()
      await expect(closing).resolves.toBeUndefined()
      await link.closed
      expect(hub.status).toBe('stopped')
      expect(stoppings).toEqual(['stopping'])
      expect(await canListen(port)).toBe(true)
    })

    it('works after hub.stop in the same listener of an applied event', async () => {
      setup()
      const hub = makeHub()
      const server = await serve(hub)
      const input = hub.attach({ id: 'input', kind: 'input' })
      const watcher = hub.attach({ id: 'watcher', kind: 'output' })
      hub.start()
      const port = portOf(server)
      let closing: Promise<void> | undefined
      watcher.subscribe((event) => {
        if (event.type === 'applied') {
          hub.stop()
          closing = server.close()
        }
      })
      await input.submit({ type: 'time/advance', payload: { ms: 10 } })
      expect(closing).toBeDefined()
      await expect(closing).resolves.toBeUndefined()
      expect(hub.status).toBe('stopped')
      expect(await canListen(port)).toBe(true)
    })

    it('works after hub.stop in another listener of the same applied event', async () => {
      setup()
      const hub = makeHub()
      const server = await serve(hub)
      const input = hub.attach({ id: 'input', kind: 'input' })
      const first = hub.attach({ id: 'first', kind: 'output' })
      const second = hub.attach({ id: 'second', kind: 'output' })
      hub.start()
      const port = portOf(server)
      let closing: Promise<void> | undefined
      first.subscribe((event) => {
        if (event.type === 'applied') {
          hub.stop()
        }
      })
      second.subscribe((event) => {
        if (event.type === 'applied') {
          closing = server.close()
        }
      })
      await input.submit({ type: 'time/advance', payload: { ms: 10 } })
      expect(closing).toBeDefined()
      await expect(closing).resolves.toBeUndefined()
      expect(hub.status).toBe('stopped')
      expect(await canListen(port)).toBe(true)
    })
  })

  it('runs the example of the README', async () => {
    setup()
    const { serveHub: fromPackage } = await import('./index.js')
    const example = async () => {
      const hub = createHub({ subsystems: [createStore({ model })] })
      const server = await fromPackage(hub, { port: 0 })
      hub.start()
      const result = server.linkUrl
      await server.close()
      return result
    }
    expect(await example()).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/link$/)
  })
})
