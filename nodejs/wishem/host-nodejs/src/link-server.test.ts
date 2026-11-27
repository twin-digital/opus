import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createStore, storeInputs, validateModel } from '@thrashplay/wishem-core'
import type { Model } from '@thrashplay/wishem-core'
import { createHub, openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import type { Hub, HubEvent, RemoteLink, WebSocketLike } from '@thrashplay/wishem-hub'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { attachLinkServer, isAllowedOrigin, respondNotFound } from './link-server.js'
import type { LinkServer } from './link-server.js'

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

describe('isAllowedOrigin', () => {
  it.each([
    ['http://localhost:3000', true],
    ['http://[::1]:5173', true],
    ['https://127.0.0.1', true],
    ['http://127.0.0.1:5173', true],
    ['http://127.0.0.1.example.com', false],
    ['https://example.com', false],
    ['null', false],
    ['', false],
    [undefined, true],
  ])('gives %j -> %j', (origin, allowed) => {
    expect(isAllowedOrigin(origin)).toBe(allowed)
  })
})

describe('the server of the link', () => {
  let hub: Hub
  let server: Server
  let linkServer: LinkServer
  let port: number
  let sockets: WebSocket[]
  let links: RemoteLink[]
  const inputs = storeInputs()

  const model = (): Model => {
    const result = validateModel({
      definitions: [{ id: CT, label: 'AppBar', fields: [{ id: FLD, label: 'title', type: 'string' }] }],
      entities: [{ id: E, components: { [CT]: { [FLD]: 'Wishem' } } }],
    })
    if (!result.ok) {
      throw new Error('the fixture is not correct')
    }
    return result.model
  }

  const open = async (id: string, path = '/link', origin?: string) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`, origin === undefined ? {} : { origin })
    sockets.push(socket)
    const link = await openLink(await webSocketChannel(socket as unknown as WebSocketLike), [{ id, kind: 'output' }])
    links.push(link)
    return link
  }

  /** Gives the HTTP status of a refused upgrade. */
  const refusedStatus = (path: string, origin?: string) =>
    new Promise<number>((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`, origin === undefined ? {} : { origin })
      sockets.push(socket)
      socket.on('unexpected-response', (_request, response) => {
        resolve(response.statusCode ?? 0)
      })
      socket.on('open', () => {
        reject(new Error('the connection opened'))
      })
      socket.on('error', reject)
    })

  /** The hub has no attached subsystem when a new subsystem can take each ID that a client used. */
  const expectNothingAttached = (...ids: string[]) => {
    ids.forEach((id) => {
      expect(() => {
        hub.attach({ id, kind: 'output' }).close()
      }).not.toThrow()
    })
  }

  const sendTitle = (value: string) =>
    hub
      .attach({ id: `sender-${Math.random().toString(16).slice(2)}`, kind: 'input' })
      .submit(inputs.setField({ entity: E, componentType: CT, field: FLD, value }))

  beforeEach(async () => {
    sockets = []
    links = []
    hub = createHub({ subsystems: [createStore({ model: model() })] })
    hub.start()
    server = createServer(respondNotFound)
    linkServer = attachLinkServer(server, hub)
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve)
    })
    port = (server.address() as AddressInfo).port
  })

  afterEach(async () => {
    links.forEach((link) => {
      link.close()
    })
    sockets.forEach((socket) => {
      socket.terminate()
    })
    await linkServer.close()
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve()
      })
      server.closeAllConnections()
    })
  })

  describe('The server carries the link at /link', () => {
    it('gives welcome with the part store to a client', async () => {
      const link = await open('page-a')
      const part = link.ports['page-a'].read().store as Model
      expect(part.definitions.map(({ label }) => label)).toEqual(['AppBar'])
      expect(part.entities).toHaveLength(1)
    })

    it('sends one applied message to each of two links', async () => {
      const one = await open('page-a')
      const two = await open('page-b')
      const events: HubEvent[][] = [[], []]
      one.ports['page-a'].subscribe((event) => events[0]?.push(event))
      two.ports['page-b'].subscribe((event) => events[1]?.push(event))
      await sendTitle('Hello')
      await eventually(() => events.every((list) => list.some(({ type }) => type === 'applied')))
      expect(events.map((list) => list.filter(({ type }) => type === 'applied').length)).toEqual([1, 1])
    })

    it('continues after a link closes', async () => {
      const one = await open('page-a')
      const two = await open('page-b')
      const events: HubEvent[] = []
      two.ports['page-b'].subscribe((event) => events.push(event))
      one.close()
      await one.closed
      await sendTitle('After close')
      await eventually(() => events.some(({ type }) => type === 'applied'))
      expect((two.ports['page-b'].read().store as Model).entities[0].components[CT][FLD]).toBe('After close')
    })
  })

  describe('The server refuses a link from a page of a different site', () => {
    it('answers 403 for a page of a different site, and attaches nothing', async () => {
      expect(await refusedStatus('/link', 'https://example.com')).toBe(403)
      expectNothingAttached('page-a')
    })

    it('opens a link for the page of the workbench', async () => {
      await open('page-a', '/link', 'http://127.0.0.1:5173')
    })

    it('opens a link for a program with no Origin header', async () => {
      await open('page-a')
    })

    it('answers 403 for an origin that is not a URL', async () => {
      expect(await refusedStatus('/link', 'null')).toBe(403)
      expectNothingAttached('page-a')
    })
  })

  describe('Each other request gets status 404', () => {
    it('answers 404 with a JSON error for a path that is not known', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/snapshot`)
      expect(response.status).toBe(404)
      expect(response.headers.get('content-type')).toBe('application/json')
      expect(await response.json()).toEqual({ error: 'No such path: /snapshot' })
    })

    it('answers 404 for a plain request to the path of the link', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/link`)
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: 'No such path: /link' })
    })

    it('answers 404 for a WebSocket at a different path, and attaches nothing', async () => {
      expect(await refusedStatus('/links')).toBe(404)
      expectNothingAttached('page-a')
    })
  })

  describe('close', () => {
    it('terminates each open socket and gives one promise for each call', async () => {
      const link = await open('page-a')
      const first = linkServer.close()
      expect(linkServer.close()).toBe(first)
      await first
      await link.closed
      expect(sockets.every((socket) => socket.readyState === WebSocket.CLOSED)).toBe(true)
    })
  })
})
