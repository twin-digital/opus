import { createServer } from 'node:http'
import type { FSWatcher, PathLike } from 'node:fs'
import { watch } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import type { AddressInfo } from 'node:net'
import { networkInterfaces, tmpdir } from 'node:os'
import path from 'node:path'
import { ModelError, storeInputs } from '@thrashplay/wishem-core'
import type { Model } from '@thrashplay/wishem-core'
import { createHub, hubInputs, LinkRefusedError, openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import type { Hub, HubEvent, Port, RemoteLink, WebSocketLike } from '@thrashplay/wishem-hub'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { FILES_ID } from './model-folder-storage.js'
import { readModelFolder } from './read-model-folder.js'
import { PRODUCT_FILES_ID, PRODUCT_FILES_WRITER_ID, PRODUCT_ID, startConstruct } from './start-construct.js'
import type { Construct } from './start-construct.js'

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, watch: vi.fn(actual.watch) }
})

vi.mock('@thrashplay/wishem-hub', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@thrashplay/wishem-hub')>()
  return { ...actual, createHub: vi.fn(actual.createHub) }
})

vi.mock('./read-model-folder.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./read-model-folder.js')>()
  return { ...actual, readModelFolder: vi.fn(actual.readModelFolder) }
})

const actualReadModelFolder = (await vi.importActual<typeof import('./read-model-folder.js')>('./read-model-folder.js'))
  .readModelFolder
const actualCreateHub = (await vi.importActual<typeof import('@thrashplay/wishem-hub')>('@thrashplay/wishem-hub'))
  .createHub
const actualWatch = (await vi.importActual<typeof import('node:fs')>('node:fs')).watch

const CT = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const FLD = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const E = 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2'

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const eventually = async (check: () => boolean | Promise<boolean>, ms = 2000) => {
  const deadline = Date.now() + ms
  while (!(await check())) {
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

  it('starts again from a folder after a client added a component type with an entity', async () => {
    const other = 'ct_7a1c2d3e-4b5f-4a6b-8c7d-9e0f1a2b3c4d'
    const field = 'fld_1d2e3f40-5a6b-4c7d-8e9f-a0b1c2d3e4f5'
    const first = await start()
    const socket = new WebSocket(first.linkUrl)
    sockets.push(socket)
    const link = await openLink(await webSocketChannel(socket as unknown as WebSocketLike), [
      { id: 'page-a', kind: 'input' },
    ])
    links.push(link)
    const model: Model = {
      definitions: [definition, { id: other, label: 'Card', fields: [{ id: field, label: 'text', type: 'string' }] }],
      entities: [
        ...(first.hub.read().store as Model).entities,
        { id: 'e_d1e2f3a4-b5c6-4d7e-8f90-a1b2c3d4e5f6', components: { [other]: { [field]: 'x' } } },
      ],
    } as Model
    const outcome = await link.ports['page-a'].submit({ type: 'store/replace-model', payload: { model } })
    expect(outcome.ok).toBe(true)
    await first.close()
    expect(lines.some((line) => line.includes('state.json is not written'))).toBe(true)
    expect(lines.some((line) => line.includes('does not hold the last changes of the store'))).toBe(true)
    const again = await start()
    expect((again.hub.read().store as Model).definitions).toHaveLength(1)
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

describe('startConstruct with a product', () => {
  const COLOR_CT = 'ct_d85ac719-7dd0-45d8-bf98-0da9e6ab0512'
  const COLOR_FLD = 'fld_694d6cb2-97e8-444e-961e-aa76744837fb'
  const COUNTER_CT = 'ct_6af38bd9-a91d-49d9-9370-fa4e6c04769d'
  const COUNT_FLD = 'fld_ef085a2e-22ef-4409-bac4-9cd5648d0705'
  const PRODUCT_E = 'e_99969ed3-f499-4dbb-bf6d-958db4542884'

  const colorDefinition = {
    id: COLOR_CT,
    label: 'Color',
    fields: [{ id: COLOR_FLD, label: 'value', type: 'string' }],
  }
  const counterDefinition = (label: string) => ({
    id: COUNTER_CT,
    label,
    fields: [{ id: COUNT_FLD, label: 'count', type: 'string' }],
  })
  const productState = (count: string) => ({
    entities: [
      { id: PRODUCT_E, components: { [COLOR_CT]: { [COLOR_FLD]: '#1d4ed8' }, [COUNTER_CT]: { [COUNT_FLD]: count } } },
    ],
  })

  let folder: string
  let productFolder: string
  let lines: string[]
  let construct: Construct | undefined

  const writeModel = async (target: string, definitions: object[], stateValue: object) => {
    await mkdir(path.join(target, 'definitions'), { recursive: true })
    for (const item of definitions) {
      await writeFile(path.join(target, 'definitions', `${(item as { id: string }).id}.json`), JSON.stringify(item))
    }
    await writeFile(path.join(target, 'state.json'), JSON.stringify(stateValue))
  }

  const start = async (
    options: { folder?: string; port?: number; product?: string; onWatchError?: (error: Error) => void } = {},
  ) => {
    construct = await startConstruct({
      folder,
      product: productFolder,
      port: 0,
      log: (line) => lines.push(line),
      ...options,
    })
    return construct
  }

  const part = (target: Construct, id: string) => target.hub.read()[id] as Model
  const count = (target: Construct) => part(target, 'product').entities[0]?.components[COUNTER_CT]?.[COUNT_FLD]
  const workbenchTitle = (target: Construct) => part(target, 'store').entities[0]?.components[CT]?.[FLD]
  const fileHas = async (target: string, text: string) =>
    (await readFile(path.join(target, 'state.json'), 'utf8')).includes(text)
  const client = (target: Construct) => target.hub.attach({ id: 'client', kind: 'input' })
  const setCount = (port: Port, value: string) =>
    port.submit(
      storeInputs('product').setField({ entity: PRODUCT_E, componentType: COUNTER_CT, field: COUNT_FLD, value }),
    )
  const setTitle = (port: Port, value: string) =>
    port.submit(storeInputs().setField({ entity: E, componentType: CT, field: FLD, value }))
  const relabelProduct = (target: Construct, port: Port) =>
    port.submit(
      storeInputs('product').replaceModel({
        definitions: [colorDefinition, counterDefinition('Renamed')],
        entities: part(target, 'product').entities,
      } as Model),
    )
  const productFile = () => path.join(productFolder, 'state.json')

  /** Records the ID of each port that the hub gives out, each time that the port closes. */
  const trackClosedPorts = () => {
    const closed: string[] = []
    vi.mocked(createHub).mockImplementationOnce((options) => {
      const hub = actualCreateHub(options)
      const attach = hub.attach.bind(hub)
      hub.attach = (request: Parameters<Hub['attach']>[0]) => {
        const port = attach(request)
        const close = port.close.bind(port)
        port.close = () => {
          closed.push(request.id)
          close()
        }
        return port
      }
      return hub
    })
    return closed
  }
  const FOUR_IDS = [FILES_ID, 'files-writer', PRODUCT_FILES_ID, PRODUCT_FILES_WRITER_ID].sort()

  beforeEach(async () => {
    lines = []
    construct = undefined
    vi.mocked(createHub).mockClear()
    vi.mocked(watch).mockReset()
    vi.mocked(watch).mockImplementation(actualWatch)
    vi.mocked(readModelFolder).mockReset()
    vi.mocked(readModelFolder).mockImplementation(actualReadModelFolder)
    folder = await mkdtemp(path.join(tmpdir(), 'wishem-construct-'))
    productFolder = await mkdtemp(path.join(tmpdir(), 'wishem-product-'))
    await writeModel(folder, [definition], state('Wishem'))
    await writeModel(productFolder, [colorDefinition, counterDefinition('Counter')], productState('0'))
  })

  afterEach(async () => {
    await construct?.close()
    vi.mocked(readModelFolder).mockImplementation(actualReadModelFolder)
    await rm(folder, { recursive: true, force: true })
    await rm(productFolder, { recursive: true, force: true })
  })

  describe('A warning of the product that has no source', () => {
    const DUPLICATE = 'ct_7a1c2d3e-4b5f-4a6b-8c7d-9e0f1a2b3c4d'
    const duplicateLabel = { ...counterDefinition('Counter'), id: DUPLICATE, fields: [] }
    const warnings = () => lines.filter((line) => line.includes('warning'))

    it('names the product when the warning is found at the start', async () => {
      await writeModel(
        productFolder,
        [colorDefinition, counterDefinition('Counter'), duplicateLabel],
        productState('0'),
      )
      await start()
      expect(warnings()).toHaveLength(1)
      expect(warnings()[0]).toMatch(/^wishem: product: warning: /)
    })

    it('names the product when a change of the files causes the warning', async () => {
      await start()
      await writeFile(path.join(productFolder, 'definitions', 'dup.json'), JSON.stringify(duplicateLabel))
      await eventually(() => warnings().length === 1)
      expect(warnings()[0]).toMatch(/^wishem: product: warning: /)
    })

    it('does not name the product for a warning of the workbench', async () => {
      await writeFile(
        path.join(folder, 'definitions', 'dup.json'),
        JSON.stringify({ ...definition, id: DUPLICATE, fields: [] }),
      )
      await start()
      expect(warnings()).toHaveLength(1)
      expect(warnings()[0]).toMatch(/^wishem: warning: /)
    })
  })

  describe('A mounted product is a second store', () => {
    it('holds the workbench in the part store and the product in the part product', async () => {
      const started = await start()
      expect(part(started, 'store').definitions.map(({ label }) => label)).toEqual(['AppBar'])
      expect(
        part(started, 'product')
          .definitions.map(({ label }) => label)
          .sort(),
      ).toEqual(['Color', 'Counter'])
      expect(part(started, 'product').entities).toHaveLength(1)
    })

    it('exports the IDs of the product', () => {
      expect([PRODUCT_ID, PRODUCT_FILES_ID, PRODUCT_FILES_WRITER_ID]).toEqual([
        'product',
        'product-files',
        'product-files-writer',
      ])
    })

    it('changes the part product and not the part store for an input to the product', async () => {
      const started = await start()
      const before = part(started, 'store')
      expect((await setCount(client(started), '7')).ok).toBe(true)
      expect(count(started)).toBe('7')
      expect(part(started, 'store')).toBe(before)
    })

    it('changes the part store and not the part product for an input to the workbench', async () => {
      const started = await start()
      const before = part(started, 'product')
      expect(before.entities).toHaveLength(1)
      expect((await setTitle(client(started), 'Second')).ok).toBe(true)
      expect(part(started, 'product')).toBe(before)
    })

    it('has no part product and refuses a product input when no product is mounted', async () => {
      const started = await start({ product: undefined })
      expect(Object.keys(started.hub.read())).not.toContain('product')
      const outcome = await setCount(client(started), '7')
      expect(outcome).toMatchObject({ ok: false, reason: 'unknown-type' })
    })

    it('refuses a product entity with a component of the workbench', async () => {
      const started = await start()
      const before = part(started, 'product')
      const port = client(started)
      const id = 'e_d1e2f3a4-b5c6-4d7e-8f90-a1b2c3d4e5f6'
      const outcome = await port.submit(storeInputs('product').addEntity({ id, components: { [CT]: { [FLD]: 'x' } } }))
      expect(outcome).toMatchObject({ ok: false, reason: 'invalid' })
      expect(part(started, 'product')).toBe(before)
      const control = await port.submit(
        storeInputs('product').addEntity({ id, components: { [COUNTER_CT]: { [COUNT_FLD]: '1' } } }),
      )
      expect(control.ok).toBe(true)
    })
  })

  describe('Each model has its own model folder', () => {
    it('follows a hand edit of the product with one product/replace-model input', async () => {
      const started = await start()
      const before = part(started, 'store')
      await writeFile(productFile(), JSON.stringify(productState('5')))
      await eventually(() => count(started) === '5')
      await pause(200)
      expect(started.hub.record().map(({ type, source }) => [type, source])).toEqual([
        ['product/replace-model', PRODUCT_FILES_ID],
      ])
      expect(part(started, 'store')).toBe(before)
    })

    it('writes the product input to the product folder only', async () => {
      const started = await start()
      await setCount(client(started), '7')
      await eventually(() => fileHas(productFolder, '"7"'))
      await pause(200)
      expect(JSON.parse(await readFile(path.join(folder, 'state.json'), 'utf8'))).toEqual(state('Wishem'))
    })

    it('writes the workbench input to the model folder only', async () => {
      const started = await start()
      await setTitle(client(started), 'Second')
      await eventually(() => fileHas(folder, 'Second'))
      await pause(200)
      expect(JSON.parse(await readFile(productFile(), 'utf8'))).toEqual(productState('0'))
    })

    it('gives the failure of the product watch to onWatchError', async () => {
      const onWatchError = vi.fn()
      await start({ onWatchError })
      const index = vi.mocked(watch).mock.calls.findIndex(([target]) => String(target).startsWith(productFolder))
      const watcher = vi.mocked(watch).mock.results[index]?.value as FSWatcher
      const failure = new Error('product watch failed')
      watcher.emit('error', failure)
      expect(onWatchError).toHaveBeenCalledWith(failure)
    })

    it('keeps the count of the product after a stop and a start', async () => {
      const first = await start()
      await setCount(client(first), '9')
      await first.close()
      const again = await start()
      expect(count(again)).toBe('9')
    })

    it('restores the product with a rewind and writes its file', async () => {
      const started = await start()
      const port = client(started)
      const before = started.hub.record().at(-1)?.seq ?? 0
      await setCount(port, '3')
      await eventually(() => fileHas(productFolder, '"3"'))
      expect((await port.submit(hubInputs.rewind(before))).ok).toBe(true)
      await eventually(() => fileHas(productFolder, '"0"'))
      expect(count(started)).toBe('0')
      expect(JSON.parse(await readFile(path.join(folder, 'state.json'), 'utf8'))).toEqual(state('Wishem'))
    })

    it('restores the two models with one rewind and writes the two files', async () => {
      const started = await start()
      const port = client(started)
      const before = started.hub.record().at(-1)?.seq ?? 0
      await setTitle(port, 'Second')
      await setCount(port, '3')
      await eventually(async () => (await fileHas(folder, 'Second')) && (await fileHas(productFolder, '"3"')))
      expect((await port.submit(hubInputs.rewind(before))).ok).toBe(true)
      await eventually(async () => (await fileHas(folder, 'Wishem')) && (await fileHas(productFolder, '"0"')))
    })

    it('rejects with an Error for the same folder, before it reads a folder', async () => {
      const missing = path.join(folder, 'missing')
      const error: unknown = await start({ folder: missing, product: missing }).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(Error)
      expect(error).not.toBeInstanceOf(ModelError)
      expect((error as Error).message).toBe('the product folder and the model folder are the same folder')
      expect(vi.mocked(readModelFolder)).not.toHaveBeenCalled()
      expect(vi.mocked(createHub)).not.toHaveBeenCalled()
    })

    it('rejects for the same folder that is given in two spellings', async () => {
      const spelled = `${folder}/../${path.basename(folder)}`
      await expect(start({ product: spelled })).rejects.toThrow('are the same folder')
    })

    it('starts with a product folder inside the model folder and sends no product input for a hand edit of the model', async () => {
      const nested = path.join(folder, 'product')
      await writeModel(nested, [colorDefinition, counterDefinition('Counter')], productState('0'))
      const started = await start({ product: nested })
      await writeFile(path.join(folder, 'state.json'), JSON.stringify(state('By hand')))
      await eventually(() => workbenchTitle(started) === 'By hand')
      await pause(200)
      expect(started.hub.record().map(({ type }) => type)).toEqual(['store/replace-model'])
      await writeFile(path.join(nested, 'state.json'), JSON.stringify(productState('4')))
      await eventually(() => count(started) === '4')
      await pause(200)
      expect(started.hub.record().map(({ type }) => type)).toEqual(['store/replace-model', 'product/replace-model'])
    })
  })

  describe('A product that is not correct at the start', () => {
    it('rejects with a ModelError whose problem names the absolute path of the file', async () => {
      await writeFile(productFile(), '{ nope')
      const error: unknown = await start().catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(ModelError)
      expect((error as ModelError).problems.map(({ source }) => source)).toEqual([productFile()])
      expect(vi.mocked(createHub)).not.toHaveBeenCalled()
      expect(vi.mocked(watch)).not.toHaveBeenCalled()
    })

    it('rejects with a problem of the product that uses a component type of the workbench', async () => {
      await writeFile(
        productFile(),
        JSON.stringify({ entities: [{ id: PRODUCT_E, components: { [CT]: { [FLD]: 'x' } } }] }),
      )
      const error: unknown = await start().catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(ModelError)
      const sources = (error as ModelError).problems.map(({ source }) => source)
      expect(sources.length).toBeGreaterThan(0)
      expect(sources.every((source) => source === productFile())).toBe(true)
    })

    it('rejects with the problems of the two folders, the product with the absolute path', async () => {
      await writeFile(path.join(folder, 'state.json'), '{')
      await writeFile(productFile(), '{')
      const error: unknown = await start().catch((caught: unknown) => caught)
      expect((error as ModelError).problems.map(({ source }) => source)).toEqual(['state.json', productFile()])
    })

    it('rejects with a problem that names a product folder that does not exist', async () => {
      const missing = path.join(productFolder, 'missing')
      const error: unknown = await start({ product: missing }).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(ModelError)
      expect((error as ModelError).problems[0]?.source).toBe(missing)
    })

    it('names the absolute path for a product folder that is given as a relative path', async () => {
      await writeFile(productFile(), '{')
      const error: unknown = await start({ product: path.relative(process.cwd(), productFolder) }).catch(
        (caught: unknown) => caught,
      )
      expect((error as ModelError).problems[0]?.source).toBe(productFile())
    })

    it('names the absolute path for a relative product folder that does not exist', async () => {
      const missing = path.join('wishem-no-such-product', 'model')
      const error: unknown = await start({ product: missing }).catch((caught: unknown) => caught)
      expect(error).toBeInstanceOf(ModelError)
      expect((error as ModelError).problems[0]?.source).toBe(path.resolve(missing))
    })
  })

  describe('The construct closes each part', () => {
    it('closes the storage subsystem of the model folder when the product storage cannot attach', async () => {
      const closed: string[] = []
      vi.mocked(createHub).mockImplementationOnce((options) => {
        const hub = actualCreateHub(options)
        const attach = hub.attach.bind(hub)
        hub.attach = (request: Parameters<Hub['attach']>[0]) => {
          if (request.id === PRODUCT_FILES_WRITER_ID) {
            throw new Error('no product writer')
          }
          const port = attach(request)
          const close = port.close.bind(port)
          port.close = () => {
            closed.push(request.id)
            close()
          }
          return port
        }
        return hub
      })
      await expect(start()).rejects.toThrow('no product writer')
      expect([...closed].sort()).toEqual([FILES_ID, 'files-writer', PRODUCT_FILES_ID].sort())
    })

    it('gives one promise for close() called two times and closes each port of the four subsystems one time', async () => {
      const closed = trackClosedPorts()
      const started = await start()
      const one = started.close()
      expect(started.close()).toBe(one)
      await one
      await started.close()
      expect([...closed].sort()).toEqual(FOUR_IDS)
    })

    it('waits for a read of the product folder', async () => {
      const started = await start()
      let release: () => void = () => undefined
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      vi.mocked(readModelFolder).mockImplementation(async (target) => {
        const result = await actualReadModelFolder(target)
        if (target === productFolder) {
          await gate
        }
        return result
      })
      vi.mocked(readModelFolder).mockClear()
      await writeFile(productFile(), JSON.stringify(productState('6')))
      await eventually(() => vi.mocked(readModelFolder).mock.calls.some(([target]) => target === productFolder))
      let closed = false
      const closing = started.close().then(() => {
        closed = true
      })
      await pause(200)
      expect(closed).toBe(false)
      release()
      await closing
      expect(closed).toBe(true)
    })

    it('closes the two storage subsystems and leaves no watcher for a port in use', async () => {
      const closed = trackClosedPorts()
      const blocker = createServer()
      await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
      const { port } = blocker.address() as AddressInfo
      try {
        await expect(start({ port })).rejects.toMatchObject({ code: 'EADDRINUSE' })
        expect(vi.mocked(watch)).not.toHaveBeenCalled()
        expect([...closed].sort()).toEqual(FOUR_IDS)
      } finally {
        await new Promise<void>((resolve) =>
          blocker.close(() => {
            resolve()
          }),
        )
      }
    })

    it('stops the hub and closes each part when the watch of the product folder cannot start', async () => {
      const port = await freePort()
      const opened: FSWatcher[] = []
      vi.mocked(watch).mockImplementation((target: PathLike, ...rest: unknown[]) => {
        if (String(target).startsWith(productFolder)) {
          throw new Error('no product watch')
        }
        const watcher = (actualWatch as (...args: unknown[]) => FSWatcher)(target, ...rest)
        vi.spyOn(watcher, 'close')
        opened.push(watcher)
        return watcher
      })
      const closed = trackClosedPorts()
      await expect(start({ port })).rejects.toThrow('no product watch')
      const hub = vi.mocked(createHub).mock.results[0]?.value as Hub
      expect(hub.status).toBe('stopped')
      expect(opened.length).toBeGreaterThan(0)
      opened.forEach((watcher) => {
        expect(watcher.close).toHaveBeenCalled()
      })
      expect(await canListen(port)).toBe(true)
      expect([...closed].sort()).toEqual(FOUR_IDS)
    })
  })

  describe('The lines about the product start with wishem: product: ', () => {
    const isProblem = (line: string) => line.startsWith('wishem: problem in ')

    it('prints the last correct model and the correct model again for the product', async () => {
      await start()
      await writeFile(productFile(), '{')
      await eventually(() => lines.includes('wishem: product: the last correct model stays'))
      expect(lines.filter(isProblem)).toEqual([
        `wishem: problem in ${productFile()}: the text is not valid JSON (line 1)`,
      ])
      expect(lines).not.toContain('wishem: the last correct model stays')
      await writeFile(productFile(), JSON.stringify(productState('2')))
      await eventually(() => lines.some((line) => line.startsWith('wishem: product: the model is correct: ')))
      expect(lines.filter((line) => line.startsWith('wishem: the model is correct'))).toEqual([])
    })

    it('keeps the lines of the workbench model as they are', async () => {
      await start()
      await writeFile(path.join(folder, 'state.json'), '{')
      await eventually(() => lines.includes('wishem: the last correct model stays'))
      expect(lines.filter(isProblem)).toEqual(['wishem: problem in state.json: the text is not valid JSON (line 1)'])
      expect(lines.filter((line) => line.startsWith('wishem: product: '))).toEqual([])
    })

    it('prints the hold of the product with the prefix and not the hold of the workbench', async () => {
      const started = await start()
      expect((await relabelProduct(started, client(started))).ok).toBe(true)
      await eventually(() => lines.some((line) => line.includes('state.json is not written')))
      const held = lines.filter((line) => line.includes('state.json is not written'))
      expect(held).toHaveLength(1)
      expect(held[0]?.startsWith('wishem: product: ')).toBe(true)
    })

    it('prints the stop with a hold of the product with the prefix, and one line only', async () => {
      const started = await start()
      await relabelProduct(started, client(started))
      await started.close()
      const lost = lines.filter((line) => line.includes('does not hold the last changes of the store'))
      expect(lost).toHaveLength(1)
      expect(lost[0]?.startsWith('wishem: product: ')).toBe(true)
    })

    it('names the absolute path of a failed product write', async () => {
      const started = await start()
      await rm(productFolder, { recursive: true, force: true })
      await setCount(client(started), '8')
      await eventually(() => lines.some((line) => line.includes('cannot write')))
      const failed = lines.filter((line) => line.includes('cannot write'))
      expect(failed[0]?.startsWith(`wishem: product: cannot write ${productFile()}: `)).toBe(true)
    })
  })
})
