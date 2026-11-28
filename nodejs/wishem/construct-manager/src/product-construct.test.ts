import { createServer, Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TIME_ID, timeInputs, type ClockTimer, type TimePart } from '@thrashplay/wishem-clock'
import { COUNT_FIELD, COUNTER_TYPE, SAMPLE_ENTITY, wrapStore } from '@thrashplay/wishem-sample-product'
import { createStore, type FieldValue, type Model } from '@thrashplay/wishem-core'
import { readModelFolder, serveHub } from '@thrashplay/wishem-host-nodejs'
import { createHub, hubInputs, openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import type { HubServer } from '@thrashplay/wishem-host-nodejs'
import type { Hub, ModelSubsystem, RemoteLink } from '@thrashplay/wishem-hub'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { startProductConstruct } from './product-construct.js'
import type { ProductConstruct, ProductConstructOptions } from './product-construct.js'

const MODEL_FOLDER = fileURLToPath(new URL('../../sample-product/model', import.meta.url))

let model: Model

beforeAll(async () => {
  model = (await readModelFolder(MODEL_FOLDER)).data as Model
})

/** A timer that the test calls, and a source of real time that the test sets. */
const makeClock = () => {
  let callback: (() => void) | undefined
  const intervals: number[] = []
  let active = 0
  let time = 0
  const timer: ClockTimer = {
    start: (next, intervalMs) => {
      callback = next
      intervals.push(intervalMs)
      active += 1
      return () => {
        active -= 1
      }
    },
  }
  return {
    timer,
    now: () => time,
    /** Moves real time by `ms` and calls the timer one time. */
    fire: (ms: number) => {
      time += ms
      callback?.()
    },
    intervals,
    get active() {
      return active
    },
  }
}

const countOf = (hub: Hub): FieldValue | undefined =>
  (hub.read().store as Model).entities.find((entity) => entity.id === SAMPLE_ENTITY)?.components[COUNTER_TYPE]?.[
    COUNT_FIELD
  ]

const timeOf = (hub: Hub) => hub.read()[TIME_ID] as TimePart

const portOf = (construct: ProductConstruct) => Number(new URL(construct.linkUrl).port)

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

describe('startProductConstruct', () => {
  let constructs: ProductConstruct[]
  let sockets: WebSocket[]
  let links: RemoteLink[]
  let servers: HubServer[]
  let folder: string

  const start = async (clock: ReturnType<typeof makeClock>, options: Partial<ProductConstructOptions> = {}) => {
    const construct = await startProductConstruct({
      id: 'play',
      model,
      wrapStore,
      running: true,
      timer: clock.timer,
      now: clock.now,
      ...options,
    })
    constructs.push(construct)
    return construct
  }

  const open = async (construct: ProductConstruct, subsystem: { id: string; kind: 'input' | 'output' }) => {
    const socket = new WebSocket(construct.linkUrl)
    sockets.push(socket)
    const link = await openLink(await webSocketChannel(socket), [subsystem])
    links.push(link)
    return link.ports[subsystem.id]
  }

  afterEach(async () => {
    for (const link of links) {
      link.close()
    }
    for (const socket of sockets) {
      socket.close()
    }
    for (const construct of constructs) {
      await construct.close()
    }
    for (const server of servers) {
      await server.close()
    }
    await rm(folder, { recursive: true, force: true })
  })

  const reset = async () => {
    constructs = []
    sockets = []
    links = []
    servers = []
    folder = await mkdtemp(join(tmpdir(), 'wishem-product-construct-'))
  }

  const setup = async () => {
    await reset()
    return makeClock()
  }

  it('joins the parts time and store, in this order, and the store holds the model', async () => {
    const construct = await start(await setup())
    expect(Object.keys(construct.hub.read())).toEqual(['time', 'store'])
    expect(construct.hub.read().store).toEqual(model)
    expect(construct.hub.status).toBe('running')
    expect(construct.id).toBe('play')
  })

  it('gives the count 5 after five steps of 50 ms with the rules of the sample product', async () => {
    const clock = await setup()
    const construct = await start(clock)
    for (let i = 0; i < 5; i++) {
      clock.fire(50)
    }
    expect(countOf(construct.hub)).toBe(5)
    expect(timeOf(construct.hub).ticks).toBe(5)
  })

  it('keeps the count with no wrapStore', async () => {
    const clock = await setup()
    const construct = await start(clock, { wrapStore: undefined })
    for (let i = 0; i < 5; i++) {
      clock.fire(50)
    }
    expect(countOf(construct.hub)).toBe(0)
    expect(timeOf(construct.hub).ticks).toBe(5)
  })

  it('gives the ticks the source clock', async () => {
    const clock = await setup()
    const construct = await start(clock)
    clock.fire(50)
    expect(construct.hub.record().map((input) => input.source)).toEqual(['clock'])
  })

  it('gives the step of the clock to the timer, default 50 ms', async () => {
    const clock = await setup()
    await start(clock)
    await start(clock, { stepMs: 25 })
    expect(clock.intervals).toEqual([50, 25])
  })

  it('gives an error of a listener to onError', async () => {
    const clock = await setup()
    const errors: unknown[] = []
    const construct = await start(clock, { onError: (error) => errors.push(error) })
    construct.hub.attach({ id: 'probe', kind: 'output' }).subscribe(() => {
      throw new Error('listener failed')
    })
    clock.fire(50)
    expect(errors).toHaveLength(1)
    expect((errors[0] as Error).message).toBe('listener failed')
  })

  it('starts paused with running false: no tick', async () => {
    const clock = await setup()
    const construct = await start(clock, { running: false })
    clock.fire(500)
    expect(timeOf(construct.hub)).toMatchObject({ running: false, ticks: 0 })
    expect(countOf(construct.hub)).toBe(0)
  })

  it('gives a welcome to a client of linkUrl', async () => {
    const construct = await start(await setup())
    expect(construct.linkUrl).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/link$/)
    const port = await open(construct, { id: 'viewer', kind: 'output' })
    expect(port.read()).toEqual(construct.hub.read())
  })

  it('refuses hub/rewind from a client with not-permitted and accepts time/advance', async () => {
    const construct = await start(await setup())
    const port = await open(construct, { id: 'client', kind: 'input' })
    const advance = await port.submit(timeInputs.advance(50))
    expect(advance).toMatchObject({ ok: true })
    const rewind = await port.submit(hubInputs.rewind(0))
    expect(rewind).toMatchObject({ ok: false, reason: 'not-permitted' })
    expect(timeOf(construct.hub).ticks).toBe(1)
  })

  it('lets the input port construct-manager rewind', async () => {
    const construct = await start(await setup())
    const manager = construct.hub.attach({ id: 'construct-manager', kind: 'input' })
    await manager.submit(timeInputs.advance(50))
    const result = await manager.submit(hubInputs.rewind(0))
    expect(result).toMatchObject({ ok: true })
    expect(timeOf(construct.hub).ticks).toBe(0)
  })

  it('rejects when wrapStore throws, and holds no timer', async () => {
    const clock = await setup()
    const failing = (): ModelSubsystem<Model> => {
      throw new Error('the rules failed')
    }
    await expect(start(clock, { wrapStore: failing })).rejects.toThrow('the rules failed')
    expect(clock.active).toBe(0)
  })

  it('rejects when the clock fails to start, and releases the port', async () => {
    const clock = await setup()
    const ports: number[] = []
    const address = vi.spyOn(Server.prototype, 'address')
    try {
      const timer: ClockTimer = {
        start: () => {
          for (const result of address.mock.results) {
            ports.push((result.value as AddressInfo).port)
          }
          throw new Error('the timer failed')
        },
      }
      await expect(start(clock, { timer })).rejects.toThrow('the timer failed')
    } finally {
      address.mockRestore()
    }
    expect(ports).toHaveLength(1)
    expect(await canListen(ports[0])).toBe(true)
    const next = await serveHub(createHub({ subsystems: [createStore({ model })] }), { port: ports[0] })
    servers.push(next)
  })

  it('stops the clock, gives stopping to each link, releases the port, and gives the same promise', async () => {
    const clock = await setup()
    const construct = await start(clock)
    const port = await open(construct, { id: 'viewer', kind: 'output' })
    const events: string[] = []
    port.subscribe((event) => {
      events.push(event.type)
    })
    const number = portOf(construct)
    expect(clock.active).toBe(1)
    const first = construct.close()
    expect(construct.close()).toBe(first)
    await first
    expect(events).toContain('stopping')
    expect(clock.active).toBe(0)
    expect(await canListen(number)).toBe(true)
    const next = await serveHub(createHub({ subsystems: [createStore({ model })] }), { port: number })
    servers.push(next)
    expect(new URL(next.linkUrl).port).toBe(String(number))
  })

  it('writes no file', async () => {
    const clock = await setup()
    const previous = process.cwd()
    process.chdir(folder)
    try {
      const construct = await start(clock)
      for (let i = 0; i < 3; i++) {
        clock.fire(50)
      }
      const manager = construct.hub.attach({ id: 'construct-manager', kind: 'input' })
      await manager.submit(hubInputs.rewind(1))
      await construct.close()
      expect(await readdir(folder)).toEqual([])
    } finally {
      process.chdir(previous)
    }
  })
})
