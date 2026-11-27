import { createServer } from 'node:http'
import type { watch as watchType } from 'node:fs'
import { watch } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import type { AddressInfo } from 'node:net'
import { networkInterfaces, tmpdir } from 'node:os'
import path from 'node:path'
import { ModelError } from '@thrashplay/wishem-core'
import type { Model } from '@thrashplay/wishem-core'
import { createHub, LinkRefusedError, openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import type { Hub, HubEvent, RemoteLink, WebSocketLike } from '@thrashplay/wishem-hub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { FILES_ID } from './model-folder-storage.js'
import { startConstruct } from './start-construct.js'
import type { Construct } from './start-construct.js'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, watch: vi.fn(actual.watch) }
})

vi.mock('@thrashplay/wishem-hub', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@thrashplay/wishem-hub')>()
  return { ...actual, createHub: vi.fn(actual.createHub) }
})

const actualWatch = (await vi.importActual<typeof import('node:fs')>('node:fs')).watch

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

const definition = { id: CT, label: 'AppBar', fields: [{ id: FLD, label: 'title', type: 'string' }] }
const state = (title: string) => ({ entities: [{ id: E, components: { [CT]: { [FLD]: title } } }] })

/** Gives a port that no program uses now. */
const freePort = async () => {
  const probe = createServer()
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
  const { port } = probe.address() as AddressInfo
  await new Promise<void>((resolve) =>
    probe.close(() => {
      resolve()
    }),
  )
  return port
}

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

describe('startConstruct', () => {
  let folder: string
  let lines: string[]
  let construct: Construct | undefined
  let sockets: WebSocket[]
  let links: RemoteLink[]

  const start = async (options: { port?: number } = {}) => {
    construct = await startConstruct({ folder, port: 0, log: (line) => lines.push(line), ...options })
    return construct
  }

  const open = async (target: Construct, id: string) => {
    const socket = new WebSocket(target.linkUrl)
    sockets.push(socket)
    const link = await openLink(await webSocketChannel(socket as unknown as WebSocketLike), [{ id, kind: 'output' }])
    links.push(link)
    return link
  }

  beforeEach(async () => {
    lines = []
    sockets = []
    links = []
    construct = undefined
    vi.mocked(createHub).mockClear()
    vi.mocked(watch).mockReset()
    vi.mocked(watch).mockImplementation(actualWatch)
    folder = await mkdtemp(path.join(tmpdir(), 'wishem-construct-'))
    await mkdir(path.join(folder, 'definitions'))
    await writeFile(path.join(folder, 'definitions', `${CT}.json`), JSON.stringify(definition))
    await writeFile(path.join(folder, 'state.json'), JSON.stringify(state('Wishem')))
  })

  afterEach(async () => {
    links.forEach((link) => {
      link.close()
    })
    sockets.forEach((socket) => {
      socket.terminate()
    })
    await construct?.close()
    await rm(folder, { recursive: true, force: true })
  })

  describe('The server is local', () => {
    it('opens a link for a program on the same computer', async () => {
      const started = await start()
      const link = await open(started, 'page-a')
      const part = link.ports['page-a'].read().store as Model
      expect(part.definitions).toHaveLength(1)
      expect((started.hub.read().store as Model).entities).toHaveLength(1)
    })

    it('listens only on the loopback address', async () => {
      const started = await start()
      const address = new URL(started.url)
      expect(address.hostname).toBe('127.0.0.1')
      const other = await new Promise<string>((resolve) => {
        const socket = new WebSocket(`ws://127.0.0.2:${address.port}/link`)
        socket.on('open', () => {
          resolve('open')
        })
        socket.on('error', () => {
          resolve('refused')
        })
      })
      expect(other).toBe('refused')
      const external = Object.values(networkInterfaces())
        .flat()
        .find((item) => item?.family === 'IPv4' && !item.internal)
      if (external === undefined) {
        return
      }
      const outcome = await new Promise<string>((resolve) => {
        const socket = new WebSocket(`ws://${external.address}:${address.port}/link`)
        socket.on('open', () => {
          resolve('open')
        })
        socket.on('error', () => {
          resolve('refused')
        })
      })
      expect(outcome).toBe('refused')
    })
  })

  describe('The server stops each link cleanly', () => {
    it('sends stopping, closes the link, and frees the port', async () => {
      const port = await freePort()
      const started = await start({ port })
      const link = await open(started, 'page-a')
      const events: HubEvent[] = []
      link.ports['page-a'].subscribe((event) => events.push(event))
      await started.close()
      await link.closed
      expect(events.map(({ type }) => type)).toContain('stopping')
      expect(await canListen(port)).toBe(true)
    })

    it('refuses a hello after the hub stopped and before the port is released', async () => {
      const started = await start()
      started.hub.stop()
      await expect(open(started, 'page-a')).rejects.toSatisfy(
        (error: unknown) => error instanceof LinkRefusedError && error.reason === 'stopped',
      )
    })

    it('refuses a client that connects during close()', async () => {
      const started = await start()
      const closing = started.close()
      expect(started.hub.status).toBe('stopped')
      const outcome = await open(started, 'page-a').then(
        () => 'opened',
        (error: unknown) => (error instanceof LinkRefusedError ? error.reason : 'connection refused'),
      )
      await closing
      expect(['stopped', 'connection refused']).toContain(outcome)
    })

    it('closes an HTTP connection that sends a partial request without a wait', async () => {
      const started = await start()
      const client = connect(Number(new URL(started.url).port), '127.0.0.1')
      await new Promise<void>((resolve) => client.once('connect', resolve))
      client.on('error', () => undefined)
      client.write('GET /x HTTP/1.1\r\nHost: 127.0.0.1\r\n')
      await pause(50)
      const outcome = await Promise.race([started.close().then(() => 'closed'), pause(1500).then(() => 'waiting')])
      client.destroy()
      expect(outcome).toBe('closed')
    })

    it('closes the connection of a link with a close frame', async () => {
      const started = await start()
      const socket = new WebSocket(started.linkUrl)
      sockets.push(socket)
      const code = new Promise<number>((resolve) => socket.once('close', resolve))
      await new Promise<void>((resolve) => socket.once('open', resolve))
      await started.close()
      expect(await code).not.toBe(1006)
    })

    it('writes an input that arrives directly before close()', async () => {
      const started = await start()
      const sender = started.hub.attach({ id: 'sender', kind: 'input' })
      await sender.submit({
        type: 'store/set-field',
        payload: { entity: E, componentType: CT, field: FLD, value: 'Last words' },
      })
      await started.close()
      const text = await readFile(path.join(folder, 'state.json'), 'utf8')
      expect(text).toContain('Last words')
    })

    it('gives the same promise for each call of close()', async () => {
      const started = await start()
      const one = started.close()
      expect(started.close()).toBe(one)
      await one
      await started.close()
    })
  })

  it('rejects with a ModelError whose problems name their files', async () => {
    await writeFile(path.join(folder, 'state.json'), JSON.stringify({ entities: [{ id: 'bad' }] }))
    const error: unknown = await start().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ModelError)
    const problems = (error as ModelError).problems
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.every((problem) => problem.source === 'state.json')).toBe(true)
    expect(vi.mocked(watch)).not.toHaveBeenCalled()
    expect(vi.mocked(createHub)).not.toHaveBeenCalled()
  })

  it('rejects when a file is not valid JSON, and names the file', async () => {
    await writeFile(path.join(folder, 'state.json'), '{ "entities": [')
    const error: unknown = await start().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ModelError)
    expect((error as ModelError).problems[0]?.source).toBe('state.json')
  })

  it('rejects for a port in use, and leaves no watch and no subsystem', async () => {
    const blocker = createServer()
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
    const { port } = blocker.address() as AddressInfo
    try {
      await expect(start({ port })).rejects.toMatchObject({ code: 'EADDRINUSE' })
      expect(vi.mocked(watch)).not.toHaveBeenCalled()
      const hub = vi.mocked(createHub).mock.results[0]?.value as Hub
      expect(hub.status).toBe('created')
      expect(() => {
        hub.attach({ id: FILES_ID, kind: 'input' }).close()
      }).not.toThrow()
    } finally {
      await new Promise<void>((resolve) =>
        blocker.close(() => {
          resolve()
        }),
      )
    }
  })

  it('stops the hub and closes the server when the watch cannot start', async () => {
    const port = await freePort()
    vi.mocked(watch).mockImplementation(() => {
      throw new Error('no watch')
    })
    await expect(start({ port })).rejects.toThrow('no watch')
    const hub = vi.mocked(createHub).mock.results[0]?.value as Hub
    expect(hub.status).toBe('stopped')
    expect(await canListen(port)).toBe(true)
  })

  it('prints to the terminal when no log function is given', async () => {
    const other = 'ct_7a1c2d3e-4b5f-4a6b-8c7d-9e0f1a2b3c4d'
    await writeFile(
      path.join(folder, 'definitions', 'other.json'),
      JSON.stringify({ id: other, label: 'AppBar', fields: [] }),
    )
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      construct = await startConstruct({ folder, port: 0 })
      expect(spy.mock.calls.some(([line]) => String(line).includes('warning'))).toBe(true)
    } finally {
      spy.mockRestore()
    }
  })

  it('gives url and linkUrl with the port that the system selected', async () => {
    const started = await start()
    const { port } = new URL(started.url)
    expect(Number(port)).toBeGreaterThan(0)
    expect(started.url).toBe(`http://127.0.0.1:${port}`)
    expect(started.linkUrl).toBe(`ws://127.0.0.1:${port}/link`)
  })

  it('prints the failure of a listener', async () => {
    const started = await start()
    expect(started.hub.status).toBe('running')
    expect(lines.filter((line) => line.includes('a listener failed'))).toEqual([])
    started.hub.attach({ id: 'bad-listener', kind: 'output' }).subscribe(() => {
      throw new Error('listener boom')
    })
    await started.hub.attach({ id: 'sender', kind: 'input' }).submit({
      type: 'store/set-field',
      payload: { entity: E, componentType: CT, field: FLD, value: 'x' },
    })
    expect(lines).toContain('wishem: a listener failed: listener boom')
  })

  it('prints the warning of the first model once, and not again when nothing changes', async () => {
    const other = 'ct_7a1c2d3e-4b5f-4a6b-8c7d-9e0f1a2b3c4d'
    await writeFile(
      path.join(folder, 'definitions', 'other.json'),
      JSON.stringify({ id: other, label: 'AppBar', fields: [] }),
    )
    await start()
    expect(lines.filter((line) => line.includes('warning'))).toHaveLength(1)
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(lines.filter((line) => line.includes('warning'))).toHaveLength(1)
  })

  it('sends a hand edit of a file to a client of the link in less than 2 seconds', async () => {
    const started = await start()
    const link = await open(started, 'page-a')
    const port = link.ports['page-a']
    let seen = false
    port.subscribe((event) => {
      if (event.type === 'applied') {
        const entity = (port.read().store as Model).entities[0]
        seen = entity.components[CT][FLD] === 'By hand'
      }
    })
    const begin = Date.now()
    await writeFile(path.join(folder, 'state.json'), JSON.stringify(state('By hand')))
    await eventually(() => seen)
    expect(Date.now() - begin).toBeLessThan(2000)
  })

  it('runs the example of the README', async () => {
    const { startConstruct: fromPackage } = await import('./index.js')
    const example = async (model: string) => {
      const running = await fromPackage({ folder: model, port: 0, log: () => undefined })
      const result = { link: running.linkUrl, store: running.hub.read().store }
      await running.close()
      return result
    }
    const result = await example(folder)
    expect(result.link).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/link$/)
    expect((result.store as Model).entities).toHaveLength(1)
  })
})
