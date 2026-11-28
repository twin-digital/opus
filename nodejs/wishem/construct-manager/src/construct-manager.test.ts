import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { TIME_ID, type ClockTimer, type TimePart } from '@thrashplay/wishem-clock'
import { createStore, type Model } from '@thrashplay/wishem-core'
import { readModelFolder } from '@thrashplay/wishem-host-nodejs'
import { createHub, hubInputs, InputRefusedError, openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import type { Hub, HubEvent, Input, ModelSubsystem, Port, RemoteLink } from '@thrashplay/wishem-hub'
import {
  COLOR_FIELD,
  COLOR_TYPE,
  COUNT_FIELD,
  COUNTER_TYPE,
  SAMPLE_ENTITY,
  wrapStore,
} from '@thrashplay/wishem-sample-product'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { attachConstructManager } from './construct-manager.js'
import type { ConstructManager, ConstructManagerOptions } from './construct-manager.js'
import { constructInputs, createConstructList } from './construct-list.js'
import type { ConstructEntry, ConstructList } from './construct-list.js'
import { CONSTRUCT_MANAGER_ID, CONSTRUCT_MANAGER_READER_ID } from './ids.js'
import type { WrapStore } from './product-construct.js'

const MODEL_FOLDER = fileURLToPath(new URL('../../sample-product/model', import.meta.url))

let model: Model

beforeAll(async () => {
  model = (await readModelFolder(MODEL_FOLDER)).data as Model
})

/** A timer that the test calls for each running clock, and a source of real time that the test sets. */
const makeClock = () => {
  const callbacks = new Set<() => void>()
  let time = 0
  const timer: ClockTimer = {
    start: (callback) => {
      callbacks.add(callback)
      return () => {
        callbacks.delete(callback)
      }
    },
  }
  return {
    timer,
    now: () => time,
    fire: (ms: number) => {
      time += ms
      for (const callback of [...callbacks]) {
        callback()
      }
    },
  }
}

const eventually = async (check: () => boolean, ms = 2000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('timeout')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 60))

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

const portOf = (link: string) => Number(new URL(link).port)

const colorOf = (hub: Hub) =>
  (hub.read().store as Model).entities.find((e) => e.id === SAMPLE_ENTITY)?.components[COLOR_TYPE]?.[COLOR_FIELD]

const countOf = (hub: Hub) =>
  (hub.read().store as Model).entities.find((e) => e.id === SAMPLE_ENTITY)?.components[COUNTER_TYPE]?.[COUNT_FIELD]

const timeOf = (hub: Hub) => hub.read()[TIME_ID] as TimePart

const setColor = (value: string): Input => ({
  type: 'product/set-field',
  payload: { entity: SAMPLE_ENTITY, componentType: COLOR_TYPE, field: COLOR_FIELD, value },
})

const setCount = (store: string, value: string): Input => ({
  type: `${store}/set-field`,
  payload: { entity: SAMPLE_ENTITY, componentType: COUNTER_TYPE, field: COUNT_FIELD, value },
})

/** Wraps the rules of the sample product and refuses a color of `bad`. */
const picky: WrapStore = (store) => {
  const wrapped = wrapStore(store)
  return {
    ...wrapped,
    apply: (part, input, context) => {
      const payload = input.payload as { value?: unknown } | null
      if (input.type === 'store/set-field' && payload?.value === 'bad') {
        throw new InputRefusedError([{ message: 'The color is bad', path: ['value'] }])
      }
      return wrapped.apply(part, input, context)
    },
  } satisfies ModelSubsystem<Model>
}

describe('attachConstructManager', () => {
  let clock: ReturnType<typeof makeClock>
  let hub: Hub
  let tester: Port
  let manager: ConstructManager
  let lines: string[]
  let sockets: WebSocket[]
  let links: RemoteLink[]

  const setup = (options: Partial<ConstructManagerOptions> = {}) => {
    clock = makeClock()
    lines = []
    sockets = []
    links = []
    hub = createHub({
      subsystems: [createStore(), createStore({ id: 'product', model }), createConstructList()],
    })
    hub.start()
    tester = hub.attach({ id: 'tester', kind: 'input' })
    manager = attachConstructManager({
      hub,
      wrapStore,
      log: (line) => lines.push(line),
      timer: clock.timer,
      now: clock.now,
      ...options,
    })
  }

  afterEach(async () => {
    for (const link of links) {
      link.close()
    }
    for (const socket of sockets) {
      socket.close()
    }
    await manager.close()
    hub.stop()
  })

  const entry = (id: string): ConstructEntry | undefined => (hub.read().constructs as ConstructList).constructs[id]

  const reports = () => hub.record().filter((input) => input.type === 'constructs/report')

  const construct = (id: string) => {
    const found = manager.running.get(id)
    if (!found) {
      throw new Error(`The construct ${id} does not run.`)
    }
    return found
  }

  const start = async (id = 'play', running?: boolean) => {
    const result = await tester.submit(constructInputs.start(id, running === undefined ? {} : { running }))
    expect(result.ok).toBe(true)
    await eventually(() => {
      const status = entry(id)?.status
      return status === 'running' || status === 'failed'
    })
  }

  const send = async (input: Input, id = 'play') => {
    const result = await tester.submit(constructInputs.send(id, input))
    expect(result.ok).toBe(true)
    await eventually(() => entry(id)?.lastSend !== undefined && result.ok && entry(id)?.lastSend?.seq === result.seq)
    return result.ok ? result.seq : -1
  }

  const open = async (link: string) => {
    const socket = new WebSocket(link)
    sockets.push(socket)
    const remote = await openLink(await webSocketChannel(socket), [{ id: 'viewer', kind: 'output' }])
    links.push(remote)
    return remote.ports.viewer
  }

  it('attaches the subsystems construct-manager and construct-manager-reader', async () => {
    setup()
    expect(() => hub.attach({ id: CONSTRUCT_MANAGER_ID, kind: 'input' })).toThrow(/in use/)
    expect(() => hub.attach({ id: CONSTRUCT_MANAGER_READER_ID, kind: 'output' })).toThrow(/in use/)
    await start()
    expect(reports().length).toBeGreaterThan(0)
    expect(reports().every((input) => input.source === CONSTRUCT_MANAGER_ID)).toBe(true)
  })

  it('throws when an ID is in use and keeps no port', () => {
    setup()
    expect(() => attachConstructManager({ hub })).toThrow(/in use/)
  })

  it('starts a construct that reports running with a link that a client can open', async () => {
    setup()
    await start()
    const play = entry('play')
    expect(play).toMatchObject({ want: 'running', status: 'running', time: 'running' })
    expect(play?.link).toMatch(/^ws:\/\/127\.0\.0.1:\d+\/link$/)
    const viewer = await open(play?.link ?? '')
    expect(viewer.read()).toEqual(construct('play').hub.read())
    expect(manager.running.size).toBe(1)
  })

  it('starts paused when the start says running false', async () => {
    setup()
    await start('play', false)
    expect(entry('play')?.time).toBe('paused')
    clock.fire(500)
    expect(timeOf(construct('play').hub).ticks).toBe(0)
  })

  it('runs two constructs with their own links, and an input to one changes only that one', async () => {
    setup()
    await start('play')
    await start('check')
    expect(entry('play')?.link).not.toBe(entry('check')?.link)
    await send(setCount('store', '100'), 'play')
    expect(countOf(construct('play').hub)).toBe('100')
    expect(countOf(construct('check').hub)).toBe('0')
  })

  it('reports failed when the start fails, and the workbench continues', async () => {
    setup({
      wrapStore: () => {
        throw new Error('the rules failed')
      },
    })
    await start()
    expect(entry('play')).toMatchObject({ status: 'failed', message: 'the rules failed' })
    expect(entry('play')?.link).toBeUndefined()
    expect(manager.running.size).toBe(0)
    expect(hub.status).toBe('running')
    const result = await tester.submit(setColor('#b91c1c'))
    expect(result.ok).toBe(true)
    await settle()
    expect(reports()).toHaveLength(1)
  })

  it('starts a failed construct again after a stop and a start', async () => {
    let calls = 0
    setup({
      wrapStore: (store) => {
        calls += 1
        if (calls === 1) {
          throw new Error('the rules failed')
        }
        return wrapStore(store)
      },
    })
    await start()
    expect(entry('play')).toMatchObject({ want: 'running', status: 'failed' })
    expect((await tester.submit(constructInputs.stop('play'))).ok).toBe(true)
    expect((await tester.submit(constructInputs.start('play'))).ok).toBe(true)
    expect(entry('play')?.status).toBe('pending')
    await eventually(() => entry('play')?.status === 'running')
    const statuses = reports().map((input) => (input.payload as { status: string }).status)
    expect(statuses).toEqual(['failed', 'running'])
    expect(entry('play')?.link).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/link$/)
    expect(manager.running.has('play')).toBe(true)
  })

  it('sends one set-field for a changed value, and keeps the count that the ticks advanced', async () => {
    setup()
    await start()
    for (let i = 0; i < 3; i++) {
      clock.fire(50)
    }
    await tester.submit(setColor('#b91c1c'))
    await eventually(() => colorOf(construct('play').hub) === '#b91c1c')
    const changes = construct('play')
      .hub.record()
      .filter((input) => input.type === 'store/set-field')
    expect(changes).toHaveLength(1)
    expect(changes[0]?.source).toBe(CONSTRUCT_MANAGER_ID)
    expect(countOf(construct('play').hub)).toBe('3')
  })

  it('sends one replace-model for a change of a label', async () => {
    setup()
    await start()
    clock.fire(50)
    const changed: Model = structuredClone(model)
    changed.definitions[0] = { ...changed.definitions[0], label: 'Renamed' }
    await tester.submit({ type: 'product/replace-model', payload: { model: changed } })
    await eventually(() =>
      construct('play')
        .hub.record()
        .some((input) => input.type === 'store/replace-model'),
    )
    const record = construct('play').hub.record()
    expect(record.filter((input) => input.type === 'store/replace-model')).toHaveLength(1)
    expect((construct('play').hub.read().store as Model).definitions[0]?.label).toBe('Renamed')
    expect(countOf(construct('play').hub)).toBe('0')
  })

  it('sends the difference after a rewind of the workbench, and does not rewind the product construct', async () => {
    setup()
    await start()
    const before = hub.seq
    await tester.submit(setColor('#b91c1c'))
    await eventually(() => colorOf(construct('play').hub) === '#b91c1c')
    await tester.submit(hubInputs.rewind(before))
    await eventually(() => colorOf(construct('play').hub) !== '#b91c1c')
    const record = construct('play').hub.record()
    expect(record.filter((input) => input.type === 'store/set-field')).toHaveLength(2)
    expect(record.some((input) => input.type === 'hub/rewind')).toBe(false)
  })

  it('reports the message of a refused change and sends the next change', async () => {
    setup({ wrapStore: picky })
    await start()
    await tester.submit(setColor('bad'))
    await eventually(() => entry('play')?.message !== undefined)
    expect(entry('play')?.message).toContain('The color is bad')
    expect(lines).toContain(
      `wishem: construct play: the change of the product was refused: ${entry('play')?.message ?? ''}`,
    )
    await tester.submit(setColor('#15803d'))
    await eventually(() => colorOf(construct('play').hub) === '#15803d')
  })

  it('passes a pause, and reports the time state and the result under the sequence number', async () => {
    setup()
    await start()
    const seq = await send({ type: 'time/set-running', payload: { running: false } })
    expect(timeOf(construct('play').hub).running).toBe(false)
    expect(entry('play')).toMatchObject({ time: 'paused', lastSend: { seq, result: { ok: true } } })
    clock.fire(500)
    expect(timeOf(construct('play').hub).ticks).toBe(0)
  })

  it('passes a step to a paused construct', async () => {
    setup()
    await start('play', false)
    await send({ type: 'time/advance', payload: { ms: 50 } })
    expect(countOf(construct('play').hub)).toBe('1')
  })

  it('passes a rewind to a product construct and changes no file', async () => {
    setup()
    await start()
    for (let i = 0; i < 4; i++) {
      clock.fire(50)
    }
    await send({ type: 'hub/rewind', payload: { seq: 1 } })
    expect(timeOf(construct('play').hub).ticks).toBe(1)
    expect(countOf(construct('play').hub)).toBe('1')
  })

  it('reports an unknown type', async () => {
    setup()
    await start()
    await send({ type: 'sound/play', payload: {} })
    expect(entry('play')?.lastSend?.result).toMatchObject({ ok: false, reason: 'unknown-type' })
  })

  it('reports the time state when running changes in the product construct, and nothing for a tick', async () => {
    setup()
    await start()
    const before = reports().length
    for (let i = 0; i < 5; i++) {
      clock.fire(50)
    }
    await settle()
    expect(reports()).toHaveLength(before)
    const client = await openInput(entry('play')?.link ?? '')
    await client.submit({ type: 'time/set-running', payload: { running: false } })
    await eventually(() => entry('play')?.time === 'paused')
    expect(reports()).toHaveLength(before + 1)
  })

  const openInput = async (link: string) => {
    const socket = new WebSocket(link)
    sockets.push(socket)
    const remote = await openLink(await webSocketChannel(socket), [{ id: 'client', kind: 'input' }])
    links.push(remote)
    return remote.ports.client
  }

  it('passes nothing again after a rewind of the workbench past a send', async () => {
    setup()
    await start()
    const before = hub.seq
    await send({ type: 'time/set-running', payload: { running: false } })
    const length = construct('play').hub.record().length
    await tester.submit(hubInputs.rewind(before))
    await eventually(() => entry('play')?.time === 'paused' && hub.seq > before)
    await settle()
    expect(construct('play').hub.record()).toHaveLength(length)
  })

  it('stops a construct: stopping to the links, a free port, the status stopped', async () => {
    setup()
    await start()
    const link = entry('play')?.link ?? ''
    const viewer = await open(link)
    const events: HubEvent['type'][] = []
    viewer.subscribe((event) => events.push(event.type))
    await tester.submit(constructInputs.stop('play'))
    await eventually(() => entry('play')?.status === 'stopped')
    expect(events).toContain('stopping')
    expect(await canListen(portOf(link))).toBe(true)
    expect(entry('play')?.link).toBeUndefined()
    expect(manager.running.size).toBe(0)
  })

  it('starts a new construct from the product model after a stop and a start', async () => {
    setup()
    await start()
    for (let i = 0; i < 3; i++) {
      clock.fire(50)
    }
    expect(countOf(construct('play').hub)).toBe('3')
    await tester.submit(constructInputs.stop('play'))
    await eventually(() => entry('play')?.status === 'stopped')
    await start()
    expect(countOf(construct('play').hub)).toBe('0')
    expect(construct('play').hub.seq).toBe(0)
  })

  it('stops a construct after a rewind of the workbench before its start, and sends no report for it', async () => {
    setup()
    await start()
    await tester.submit(hubInputs.rewind(0))
    await eventually(() => manager.running.size === 0)
    await settle()
    expect(entry('play')).toBeUndefined()
    expect(hub.record().at(-1)?.type).toBe('hub/rewind')
  })

  it('reports the real status after a rewind to a false status', async () => {
    setup()
    await start()
    await tester.submit(constructInputs.stop('play'))
    await eventually(() => entry('play')?.status === 'stopped')
    const seq = hub.record().find((input) => input.type === 'constructs/stop')?.seq ?? -1
    await tester.submit(hubInputs.rewind(seq))
    await eventually(() => hub.seq > seq && hub.record().at(-1)?.type === 'constructs/report')
    await settle()
    expect(entry('play')).toMatchObject({ want: 'stopped', status: 'stopped' })
  })

  it('stops a construct that a stop reaches while the start runs', async () => {
    setup()
    await tester.submit(constructInputs.start('play'))
    await tester.submit(constructInputs.stop('play'))
    await eventually(() => entry('play')?.status === 'stopped')
    const statuses = reports().map((input) => (input.payload as { status: string }).status)
    expect(statuses).toEqual(['running', 'stopped'])
    expect(manager.running.size).toBe(0)
  })

  it('stops each construct on close, frees the ports, and sends no report after it', async () => {
    setup()
    await start('play')
    await start('check')
    const ports = [entry('play')?.link ?? '', entry('check')?.link ?? ''].map(portOf)
    const length = hub.record().length
    const first = manager.close()
    expect(manager.close()).toBe(first)
    await first
    expect(manager.running.size).toBe(0)
    for (const port of ports) {
      expect(await canListen(port)).toBe(true)
    }
    const input = hub.attach({ id: CONSTRUCT_MANAGER_ID, kind: 'input' })
    const reader = hub.attach({ id: CONSTRUCT_MANAGER_READER_ID, kind: 'output' })
    input.close()
    reader.close()
    await settle()
    expect(hub.record()).toHaveLength(length)
  })

  it('closes the new construct when close runs while the start runs', async () => {
    setup()
    await tester.submit(constructInputs.start('play'))
    await manager.close()
    expect(manager.running.size).toBe(0)
    expect(reports().filter((input) => (input.payload as { status: string }).status === 'running')).toHaveLength(0)
  })

  it('prints a line for a start, a stop, a failed start, and a refused change', async () => {
    setup({ wrapStore: picky })
    await start()
    const link = entry('play')?.link ?? ''
    expect(lines).toContain(`wishem: construct play runs, link at ${link}`)
    await tester.submit(setColor('bad'))
    await eventually(() => lines.some((line) => line.includes('the change of the product was refused')))
    await tester.submit(constructInputs.stop('play'))
    await eventually(() => entry('play')?.status === 'stopped')
    expect(lines).toContain('wishem: construct play stopped')
  })

  it('prints the line of a failed start', async () => {
    setup({
      wrapStore: () => {
        throw new Error('the rules failed')
      },
    })
    await start()
    expect(lines).toContain('wishem: construct play failed: the rules failed')
  })
})
