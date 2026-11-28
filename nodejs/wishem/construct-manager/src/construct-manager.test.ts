import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { TIME_ID, type ClockTimer, type TimePart } from '@thrashplay/wishem-clock'
import { createStore, type Entity, type Model } from '@thrashplay/wishem-core'
import { readModelFolder } from '@thrashplay/wishem-host-nodejs'
import { createHub, hubInputs, openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import type { Hub, HubEvent, Input, Port, RemoteLink } from '@thrashplay/wishem-hub'
import type { NativeBehavior } from '@thrashplay/wishem-update'
import {
  COLOR_FIELD,
  COLOR_TYPE,
  COUNT_FIELD,
  COUNTER_TYPE,
  SAMPLE_ENTITY,
  behaviors,
} from '@thrashplay/wishem-sample-product'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { attachConstructManager } from './construct-manager.js'
import type { ConstructManager, ConstructManagerOptions } from './construct-manager.js'
import { inProcessLauncher } from './launchers.js'
import type { InProcessConstruct, InProcessLauncherOptions, ProductConstructLauncher } from './launchers.js'
import { constructInputs, createConstructList } from './construct-list.js'
import type { ConstructEntry, ConstructList } from './construct-list.js'
import { CONSTRUCT_MANAGER_ID, CONSTRUCT_MANAGER_READER_ID } from './ids.js'

const MODEL_FOLDER = fileURLToPath(new URL('../../sample-product/model', import.meta.url))

let model: Model

beforeAll(async () => {
  model = (await readModelFolder(MODEL_FOLDER)).data as Model
})

/** A timer that the test calls for each running clock, and a source of real time that the test sets. */
const makeClock = () => {
  const callbacks = new Set<() => void>()
  const intervals: number[] = []
  let time = 0
  const timer: ClockTimer = {
    start: (callback, intervalMs) => {
      callbacks.add(callback)
      intervals.push(intervalMs)
      return () => {
        callbacks.delete(callback)
      }
    },
  }
  return {
    timer,
    intervals,
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

const setCount = (store: string, value: number): Input => ({
  type: `${store}/set-field`,
  payload: { entity: SAMPLE_ENTITY, componentType: COUNTER_TYPE, field: COUNT_FIELD, value },
})

const duplicates = [behaviors[0], behaviors[0]]

const SECOND = 'e_22222222-2222-4222-8222-222222222222'
const THIRD = 'e_33333333-3333-4333-8333-333333333333'
const LINK_TYPE = 'ct_cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const TARGET_FIELD = 'fld_dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const TARGETS_FIELD = 'fld_eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

const counter = (id: string, count: number): Entity => ({
  id,
  components: { [COUNTER_TYPE]: { [COUNT_FIELD]: count } },
})

const linkTo = (id: string, other?: string): Entity => ({
  id,
  components: {
    [LINK_TYPE]: other === undefined ? {} : { [TARGET_FIELD]: other, [TARGETS_FIELD]: [other] },
  },
})

const withEntities = (base: Model, ...entities: Entity[]): Model => ({ ...structuredClone(base), entities })

const idsOf = (hub: Hub) => (hub.read().store as Model).entities.map((e) => e.id)

const countOfEntity = (hub: Hub, id: string) =>
  (hub.read().store as Model).entities.find((e) => e.id === id)?.components[COUNTER_TYPE]?.[COUNT_FIELD]

const addEntity = (entity: Entity): Input => ({ type: 'product/add-entity', payload: { entity } })

const removeEntity = (id: string): Input => ({ type: 'product/remove-entity', payload: { entity: id } })

const replaceModel = (next: Model): Input => ({ type: 'product/replace-model', payload: { model: next } })

const setCountOf = (id: string, value: number): Input => ({
  type: 'store/set-field',
  payload: { entity: id, componentType: COUNTER_TYPE, field: COUNT_FIELD, value },
})

const sampleEntity = (): Entity => structuredClone(model.entities.find((e) => e.id === SAMPLE_ENTITY) as Entity)

const linkModel = (): Model => ({
  ...structuredClone(model),
  definitions: [
    ...structuredClone(model.definitions),
    {
      id: LINK_TYPE,
      label: 'Link',
      fields: [
        { id: TARGET_FIELD, label: 'target', type: 'reference' },
        { id: TARGETS_FIELD, label: 'targets', type: 'reference-list' },
      ],
    },
  ],
})

/** A behavior of the component type Color that throws an error from the read of its type after `fault.armed` is set. */
const fault = { armed: false }
const exploding: NativeBehavior = {
  id: 'test/explode',
  get componentType() {
    if (fault.armed) {
      throw new Error('boom')
    }
    return COLOR_TYPE
  },
  update: (fields) => fields,
}

type TestOptions = Partial<ConstructManagerOptions> & Pick<InProcessLauncherOptions, 'behaviors' | 'stepMs'>

describe('attachConstructManager', () => {
  let clock: ReturnType<typeof makeClock>
  let hub: Hub
  let tester: Port
  let manager: ConstructManager
  let lines: string[]
  let sockets: WebSocket[]
  let links: RemoteLink[]

  const attachManager = ({ behaviors: list = behaviors, stepMs, ...rest }: TestOptions) =>
    attachConstructManager({
      hub,
      log: (line) => lines.push(line),
      launch: inProcessLauncher({
        behaviors: list,
        ...(stepMs === undefined ? {} : { stepMs }),
        timer: clock.timer,
        now: clock.now,
      }),
      ...rest,
    })

  const setup = (options: TestOptions = {}, productModel: Model = model) => {
    clock = makeClock()
    lines = []
    sockets = []
    links = []
    hub = createHub({
      subsystems: [createStore(), createStore({ id: 'product', model: productModel }), createConstructList()],
    })
    hub.start()
    tester = hub.attach({ id: 'tester', kind: 'input' })
    manager = attachManager(options)
  }

  /** Runs `prepare` on the hub before the construct manager attaches. */
  const setupLate = async (prepare: () => Promise<void>, options: () => TestOptions = () => ({})) => {
    clock = makeClock()
    lines = []
    sockets = []
    links = []
    hub = createHub({
      subsystems: [createStore(), createStore({ id: 'product', model }), createConstructList()],
    })
    hub.start()
    tester = hub.attach({ id: 'tester', kind: 'input' })
    await prepare()
    manager = attachManager(options())
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
    return found as InProcessConstruct
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
    expect(CONSTRUCT_MANAGER_ID).toBe('construct-manager')
    expect(CONSTRUCT_MANAGER_READER_ID).toBe('construct-manager-reader')
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

  it('closes the input port when the reader port is in use', () => {
    setup()
    const other = createHub({
      subsystems: [createStore(), createStore({ id: 'product', model }), createConstructList()],
    })
    other.start()
    other.attach({ id: CONSTRUCT_MANAGER_READER_ID, kind: 'output' })
    expect(() => attachConstructManager({ hub: other })).toThrow(/in use/)
    expect(() => other.attach({ id: CONSTRUCT_MANAGER_ID, kind: 'input' })).not.toThrow()
    other.stop()
  })

  it('logs the error of a pass', async () => {
    setup()
    const bare = createHub({ subsystems: [createStore(), createStore({ id: 'product', model })] })
    bare.start()
    const bareLines: string[] = []
    const bareManager = attachConstructManager({ hub: bare, log: (line) => bareLines.push(line) })
    await eventually(() => bareLines.length > 0)
    await bareManager.close()
    bare.stop()
    expect(bareLines[0]).toMatch(/^wishem: construct manager: /)
  })

  it('starts the constructs that the list wants when it attaches', async () => {
    await setupLate(async () => {
      await tester.submit(constructInputs.start('play'))
    })
    await eventually(() => entry('play')?.status === 'running')
    expect(manager.running.has('play')).toBe(true)
  })

  it('reports stopped for an entry that is not wanted to run and has no construct', async () => {
    await setupLate(async () => {
      await tester.submit(constructInputs.start('play'))
      await tester.submit(constructInputs.stop('play'))
      expect(entry('play')).toMatchObject({ want: 'stopped', status: 'pending' })
    })
    await eventually(() => entry('play')?.status === 'stopped')
    expect(manager.running.size).toBe(0)
  })

  it('starts no construct after a close that comes while a start runs, and keeps none', async () => {
    let calls = 0
    let closing: Promise<void> | undefined
    await setupLate(
      async () => {
        await tester.submit(constructInputs.start('play'))
        await tester.submit(constructInputs.start('check'))
      },
      () => ({
        behaviors: new Proxy([...behaviors], {
          get: (target, property, receiver) => {
            if (property === 'forEach') {
              calls += 1
              closing ??= manager.close()
            }
            return Reflect.get(target, property, receiver) as unknown
          },
        }),
      }),
    )
    await eventually(() => closing !== undefined)
    await closing
    await settle()
    expect(calls).toBe(1)
    expect(manager.running.size).toBe(0)
  })

  it('sends no change of the product after a close', async () => {
    setup()
    await start()
    const play = construct('play')
    const submitted = tester.submit(setColor('#b91c1c'))
    const closed = manager.close()
    await submitted
    await closed
    expect(play.hub.record().filter((input) => input.type === 'store/set-field')).toHaveLength(0)
  })

  it('ignores a send that reaches a stopped construct, and logs no error', async () => {
    setup()
    await start()
    const pause: Input = { type: 'time/set-running', payload: { running: false } }
    await Promise.all([
      tester.submit(constructInputs.send('play', pause)),
      tester.submit(constructInputs.send('play', pause)),
      tester.submit(constructInputs.stop('play')),
    ])
    await eventually(() => entry('play')?.status === 'stopped')
    await settle()
    expect(lines.filter((line) => line.startsWith('wishem: construct manager:'))).toEqual([])
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
    await send(setCount('store', 100), 'play')
    expect(countOf(construct('play').hub)).toBe(100)
    expect(countOf(construct('check').hub)).toBe(0)
  })

  it('reports failed when the start fails, and the workbench continues', async () => {
    setup({
      behaviors: duplicates,
    })
    await start()
    expect(entry('play')).toMatchObject({
      status: 'failed',
      message: 'Two behaviors have the id "sample-product/count".',
    })
    expect(entry('play')?.link).toBeUndefined()
    expect(manager.running.size).toBe(0)
    expect(hub.status).toBe('running')
    const result = await tester.submit(setColor('#b91c1c'))
    expect(result.ok).toBe(true)
    await settle()
    expect(reports()).toHaveLength(1)
  })

  it('starts a failed construct again after a stop and a start', async () => {
    const list = [...duplicates]
    setup({ behaviors: list })
    await start()
    expect(entry('play')).toMatchObject({ want: 'running', status: 'failed' })
    list.pop()
    expect((await tester.submit(constructInputs.stop('play'))).ok).toBe(true)
    expect((await tester.submit(constructInputs.start('play'))).ok).toBe(true)
    expect(entry('play')?.status).toBe('pending')
    await eventually(() => entry('play')?.status === 'running')
    const statuses = reports().map((input) => (input.payload as { status: string }).status)
    expect(statuses).toEqual(['failed', 'running'])
    expect(entry('play')?.link).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/link$/)
    expect(manager.running.has('play')).toBe(true)
  })

  it('keeps the new start when a stop and a start come while the end of the old construct is reported', async () => {
    clock = makeClock()
    lines = []
    sockets = []
    links = []
    hub = createHub({
      subsystems: [createStore(), createStore({ id: 'product', model }), createConstructList()],
    })
    hub.start()
    tester = hub.attach({ id: 'tester', kind: 'input' })
    const inner = inProcessLauncher({ behaviors, timer: clock.timer, now: clock.now })
    let endNow: (message: string) => void = () => undefined
    let releaseClose: () => void = () => undefined
    let first = true
    manager = attachConstructManager({
      hub,
      log: (line) => lines.push(line),
      launch: async (startArgs, hooks) => {
        const launched = await inner(startArgs, hooks)
        if (!first) {
          return launched
        }
        first = false
        const gate = new Promise<void>((resolve) => {
          releaseClose = resolve
        })
        const ended = new Promise<string>((resolve) => {
          endNow = resolve
        })
        return {
          id: launched.id,
          linkUrl: launched.linkUrl,
          pid: launched.pid,
          input: launched.input,
          reader: launched.reader,
          ended,
          close: async () => {
            await gate
            await launched.close()
          },
        }
      },
    })
    await start()
    endNow('The process of the construct ended with the exit code 3.')
    await settle()
    expect((await tester.submit(constructInputs.stop('play'))).ok).toBe(true)
    expect((await tester.submit(constructInputs.start('play'))).ok).toBe(true)
    releaseClose()
    await eventually(() => entry('play')?.status === 'running')
    await settle()
    expect(entry('play')).toMatchObject({ want: 'running', status: 'running' })
    expect(manager.running.has('play')).toBe(true)
  })

  /** Sets up the hub and a manager with a launcher that wraps `inProcessLauncher`. */
  const setupWrapped = (
    options: { closeRejects?: boolean; log?: (line: string) => void; hold?: Promise<void> } = {},
  ) => {
    clock = makeClock()
    lines = []
    sockets = []
    links = []
    hub = createHub({
      subsystems: [createStore(), createStore({ id: 'product', model }), createConstructList()],
    })
    hub.start()
    tester = hub.attach({ id: 'tester', kind: 'input' })
    const inner = inProcessLauncher({ behaviors, timer: clock.timer, now: clock.now })
    const ends: ((message: string) => void)[] = []
    const calls = { launch: 0, close: 0 }
    const launch: ProductConstructLauncher = async (startArgs, hooks) => {
      calls.launch += 1
      if (options.hold !== undefined && calls.launch === 1) {
        await options.hold
      }
      const launched = await inner(startArgs, hooks)
      const ended = new Promise<string>((resolve) => {
        ends.push(resolve)
      })
      return {
        id: launched.id,
        linkUrl: launched.linkUrl,
        pid: launched.pid,
        input: launched.input,
        reader: launched.reader,
        ended,
        close: async () => {
          calls.close += 1
          await launched.close()
          if (options.closeRejects === true) {
            throw new Error('close broke')
          }
        },
      }
    }
    manager = attachConstructManager({
      hub,
      log: options.log ?? ((line) => lines.push(line)),
      launch,
    })
    return { ends, calls }
  }

  it('closes the construct, logs the end, and reports failed when the close of the ended construct rejects', async () => {
    const { ends, calls } = setupWrapped({ closeRejects: true })
    await start()
    ends[0]('gone')
    await eventually(() => entry('play')?.status === 'failed')
    expect(entry('play')).toMatchObject({ status: 'failed', message: 'gone' })
    expect(calls.close).toBe(1)
    expect(lines).toContain('wishem: construct play failed: gone')
    expect(manager.running.has('play')).toBe(false)
  })

  it('ignores the end of a construct that a stop and a start replaced', async () => {
    const { ends } = setupWrapped()
    await start()
    expect((await tester.submit(constructInputs.stop('play'))).ok).toBe(true)
    expect((await tester.submit(constructInputs.start('play'))).ok).toBe(true)
    await eventually(() => entry('play')?.status === 'running' && ends.length === 2)
    ends[0]('old end')
    await settle()
    expect(entry('play')).toMatchObject({ want: 'running', status: 'running' })
    expect(manager.running.has('play')).toBe(true)
    expect(lines.join('\n')).not.toContain('old end')
  })

  it('keeps the new start when a stop and a start come while the first start fails', async () => {
    let release: () => void = () => undefined
    const hold = new Promise<void>((_resolve, reject) => {
      release = () => {
        reject(new Error('late failure'))
      }
    })
    const { calls } = setupWrapped({ hold })
    expect((await tester.submit(constructInputs.start('play'))).ok).toBe(true)
    await eventually(() => calls.launch === 1)
    expect((await tester.submit(constructInputs.stop('play'))).ok).toBe(true)
    expect((await tester.submit(constructInputs.start('play'))).ok).toBe(true)
    release()
    await eventually(() => entry('play')?.status === 'running')
    expect(entry('play')?.message).toBeUndefined()
    expect(calls.launch).toBe(2)
    expect(lines).toContain('wishem: construct play failed: late failure')
  })

  it('goes on after an error in the handling of an end', async () => {
    let broken = true
    const { ends } = setupWrapped({
      log: (line) => {
        if (broken && line === 'wishem: construct play failed: gone') {
          broken = false
          throw new Error('log broke')
        }
        lines.push(line)
      },
    })
    await start()
    ends[0]('gone')
    await eventually(() => lines.includes('wishem: construct manager: log broke'))
    expect((await tester.submit(constructInputs.stop('play'))).ok).toBe(true)
    expect((await tester.submit(constructInputs.start('play'))).ok).toBe(true)
    await eventually(() => entry('play')?.status === 'running')
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
    expect(countOf(construct('play').hub)).toBe(3)
  })

  it('sends clear-field for a removed value, and keeps the count that a send set', async () => {
    setup()
    await start('play', false)
    await send(setCount('store', 25))
    await tester.submit({
      type: 'product/clear-field',
      payload: { entity: SAMPLE_ENTITY, componentType: COLOR_TYPE, field: COLOR_FIELD },
    })
    await eventually(() =>
      construct('play')
        .hub.record()
        .some((input) => input.type === 'store/clear-field'),
    )
    const record = construct('play').hub.record()
    const clears = record.filter((input) => input.type === 'store/clear-field')
    expect(clears).toHaveLength(1)
    expect(clears[0]?.source).toBe(CONSTRUCT_MANAGER_ID)
    expect(colorOf(construct('play').hub)).toBeUndefined()
    expect(countOf(construct('play').hub)).toBe(25)
  })

  it('sends clear-field and no replace-model for a hand edit that removes the color', async () => {
    setup()
    await start('play', false)
    const edited: Model = structuredClone(model)
    const sample = edited.entities.find((e) => e.id === SAMPLE_ENTITY)
    if (sample) {
      const { [COLOR_FIELD]: _color, ...rest } = sample.components[COLOR_TYPE]
      sample.components[COLOR_TYPE] = rest
    }
    await tester.submit({ type: 'product/replace-model', payload: { model: edited } })
    await eventually(() =>
      construct('play')
        .hub.record()
        .some((input) => input.type === 'store/clear-field'),
    )
    const record = construct('play').hub.record()
    expect(record.some((input) => input.type === 'store/replace-model')).toBe(false)
  })

  it('sends set-field with the earlier value after a rewind past a clear', async () => {
    setup()
    await start()
    const before = hub.seq
    await tester.submit({
      type: 'product/clear-field',
      payload: { entity: SAMPLE_ENTITY, componentType: COLOR_TYPE, field: COLOR_FIELD },
    })
    await eventually(() => colorOf(construct('play').hub) === undefined)
    await tester.submit(hubInputs.rewind(before))
    await eventually(() => colorOf(construct('play').hub) !== undefined)
    const sets = construct('play')
      .hub.record()
      .filter((input) => input.type === 'store/set-field')
    expect(sets).toHaveLength(1)
    expect((sets[0]?.payload as { value: unknown }).value).toBe(
      model.entities.find((e) => e.id === SAMPLE_ENTITY)?.components[COLOR_TYPE]?.[COLOR_FIELD],
    )
  })

  it('sends clear-field after a rewind past a set of a new value', async () => {
    setup()
    await start()
    await tester.submit({
      type: 'product/clear-field',
      payload: { entity: SAMPLE_ENTITY, componentType: COLOR_TYPE, field: COLOR_FIELD },
    })
    await eventually(() => colorOf(construct('play').hub) === undefined)
    const before = hub.seq
    await tester.submit(setColor('#b91c1c'))
    await eventually(() => colorOf(construct('play').hub) === '#b91c1c')
    await tester.submit(hubInputs.rewind(before))
    await eventually(() => colorOf(construct('play').hub) === undefined)
    const clears = construct('play')
      .hub.record()
      .filter((input) => input.type === 'store/clear-field')
    expect(clears).toHaveLength(2)
    expect((clears[1].payload as { field: string }).field).toBe(COLOR_FIELD)
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
    expect(countOf(construct('play').hub)).toBe(0)
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

  describe('the entities of the product model', () => {
    /** The types of the store inputs that the construct got, from the record position `from`. */
    const storeTypes = (from = 0) =>
      construct('play')
        .hub.record()
        .slice(from)
        .map((recorded) => recorded.type)
        .filter((type) => type.startsWith('store/'))

    const recordLength = () => construct('play').hub.record().length

    const storeInputsOf = (type: string) =>
      construct('play')
        .hub.record()
        .filter((recorded) => recorded.type === type)

    /** Starts a paused construct with the count 25. */
    const startWith25 = async (productModel?: Model) => {
      setup({}, productModel)
      await start('play', false)
      await send(setCount('store', 25))
    }

    const live = (ids: string[]) => eventually(() => idsOf(construct('play').hub).join() === ids.join())

    it('sends one add-entity for a new entity, keeps the count, and holds the new entity last', async () => {
      await startWith25()
      await tester.submit(addEntity(counter(SECOND, 1000)))
      await live([SAMPLE_ENTITY, SECOND])
      const adds = storeInputsOf('store/add-entity')
      expect(adds).toHaveLength(1)
      expect(adds[0]?.source).toBe(CONSTRUCT_MANAGER_ID)
      expect(storeInputsOf('store/replace-model')).toHaveLength(0)
      expect(countOf(construct('play').hub)).toBe(25)
      expect(countOfEntity(construct('play').hub, SECOND)).toBe(1000)
      await send({ type: 'time/advance', payload: { ms: 50 } })
      expect(countOf(construct('play').hub)).toBe(26)
      expect(countOfEntity(construct('play').hub, SECOND)).toBe(1001)
    })

    it('sends one remove-entity and no replace-model for a replace-model that removes an entity', async () => {
      await startWith25()
      await tester.submit(addEntity(counter(SECOND, 1000)))
      await live([SAMPLE_ENTITY, SECOND])
      await tester.submit(replaceModel(model))
      await live([SAMPLE_ENTITY])
      expect(storeInputsOf('store/remove-entity')).toHaveLength(1)
      expect(storeInputsOf('store/replace-model')).toHaveLength(0)
      expect(countOf(construct('play').hub)).toBe(25)
    })

    it('sends add-entity with the index 0 for an entity before the sample entity, in the order of the product', async () => {
      await startWith25()
      await tester.submit(replaceModel(withEntities(model, counter(SECOND, 1000), sampleEntity())))
      await live([SECOND, SAMPLE_ENTITY])
      const adds = storeInputsOf('store/add-entity')
      expect(adds).toHaveLength(1)
      expect((adds[0]?.payload as { index?: number }).index).toBe(0)
      expect(storeInputsOf('store/replace-model')).toHaveLength(0)
      expect(countOf(construct('play').hub)).toBe(25)
    })

    it('puts a removed entity back at its index after a rewind, with the authored values and the live counts', async () => {
      await startWith25()
      await tester.submit(addEntity(counter(SECOND, 1000)))
      await tester.submit(addEntity(counter(THIRD, 2000)))
      await live([SAMPLE_ENTITY, SECOND, THIRD])
      await send(setCountOf(THIRD, 77))
      const before = hub.seq
      await tester.submit(removeEntity(SECOND))
      await live([SAMPLE_ENTITY, THIRD])
      await tester.submit(hubInputs.rewind(before))
      await live([SAMPLE_ENTITY, SECOND, THIRD])
      const last = storeInputsOf('store/add-entity').at(-1)?.payload as { entity: Entity; index?: number }
      expect(last.index).toBe(1)
      expect(last.entity).toEqual(counter(SECOND, 1000))
      expect(countOf(construct('play').hub)).toBe(25)
      expect(countOfEntity(construct('play').hub, THIRD)).toBe(77)
      expect(countOfEntity(construct('play').hub, SECOND)).toBe(1000)
    })

    it('sends remove-entity after a rewind past an addition', async () => {
      await startWith25()
      const before = hub.seq
      await tester.submit(addEntity(counter(SECOND, 1000)))
      await live([SAMPLE_ENTITY, SECOND])
      await tester.submit(hubInputs.rewind(before))
      await live([SAMPLE_ENTITY])
      expect(storeInputsOf('store/remove-entity')).toHaveLength(1)
      expect(countOf(construct('play').hub)).toBe(25)
    })

    it('sends add-entity, set-field, and remove-entity for one change with an addition, a removal, and a color', async () => {
      await startWith25()
      await tester.submit(addEntity(counter(SECOND, 1000)))
      await live([SAMPLE_ENTITY, SECOND])
      const from = recordLength()
      const changed = withEntities(model, sampleEntity(), counter(THIRD, 3000))
      changed.entities[0].components[COLOR_TYPE] = { [COLOR_FIELD]: '#b91c1c' }
      await tester.submit(replaceModel(changed))
      await live([SAMPLE_ENTITY, THIRD])
      await eventually(() => colorOf(construct('play').hub) === '#b91c1c')
      expect(storeTypes(from)).toEqual(['store/add-entity', 'store/set-field', 'store/remove-entity'])
      expect(countOf(construct('play').hub)).toBe(25)
    })

    it('sends one replace-model for a new order of the entities', async () => {
      await startWith25()
      await tester.submit(addEntity(counter(SECOND, 1000)))
      await live([SAMPLE_ENTITY, SECOND])
      await tester.submit(replaceModel(withEntities(model, counter(SECOND, 1000), sampleEntity())))
      await live([SECOND, SAMPLE_ENTITY])
      expect(storeInputsOf('store/replace-model')).toHaveLength(1)
    })

    it('sends one replace-model for an addition with a new label of a component type', async () => {
      await startWith25()
      const changed = withEntities(model, sampleEntity(), counter(SECOND, 1000))
      changed.definitions[0] = { ...changed.definitions[0], label: 'Renamed' }
      await tester.submit(replaceModel(changed))
      await live([SAMPLE_ENTITY, SECOND])
      expect(storeInputsOf('store/replace-model')).toHaveLength(1)
      expect(storeInputsOf('store/add-entity')).toHaveLength(0)
    })

    it('adds and removes two entities that name each other in a reference and a list, with no refusal', async () => {
      const base = linkModel()
      await startWith25(base)
      const from = recordLength()
      await tester.submit(
        replaceModel(withEntities(base, sampleEntity(), linkTo(SECOND, THIRD), linkTo(THIRD, SECOND))),
      )
      await live([SAMPLE_ENTITY, SECOND, THIRD])
      await eventually(() => storeTypes(from).length === 4)
      expect(storeTypes(from)).toEqual(['store/add-entity', 'store/add-entity', 'store/set-field', 'store/set-field'])
      const mark = recordLength()
      await tester.submit(replaceModel(base))
      await live([SAMPLE_ENTITY])
      expect(storeTypes(mark)).toEqual([
        'store/clear-field',
        'store/clear-field',
        'store/clear-field',
        'store/clear-field',
        'store/remove-entity',
        'store/remove-entity',
      ])
      expect(entry('play')?.message).toBeUndefined()
      expect(lines.filter((line) => line.includes('refused'))).toEqual([])
      expect(countOf(construct('play').hub)).toBe(25)
    })
  })

  it('reports the message of a refused change and sends the next change', async () => {
    setup()
    await start()
    await send({ type: 'store/remove-entity', payload: { entity: SAMPLE_ENTITY } })
    await tester.submit(setColor('#b91c1c'))
    await eventually(() => entry('play')?.message !== undefined)
    const refusal = `No entity has the ID "${SAMPLE_ENTITY}"`
    expect(entry('play')?.message).toBe(refusal)
    expect(lines).toContain(`wishem: construct play: the change of the product was refused: ${refusal}`)
    await send({ type: 'store/replace-model', payload: { model } })
    await tester.submit(setColor('#15803d'))
    await eventually(() => colorOf(construct('play').hub) === '#15803d')
  })

  it('runs the behaviors: the count of a construct grows with the ticks', async () => {
    setup()
    await start()
    for (let i = 0; i < 3; i++) {
      clock.fire(50)
    }
    expect(countOf(construct('play').hub)).toBe(3)
  })

  it('keeps the count of the model with no behaviors, and the part time advances', async () => {
    setup({ behaviors: [] })
    await start()
    clock.fire(50)
    clock.fire(50)
    expect(countOf(construct('play').hub)).toBe(0)
    expect(timeOf(construct('play').hub).ticks).toBe(2)
  })

  it('gives a pass of time/advance with ok false and invalid for a behavior that throws, and names it', async () => {
    const broken = {
      id: 'test/broken',
      componentType: COUNTER_TYPE,
      update: () => {
        throw new Error('it broke')
      },
    }
    setup({ behaviors: [broken] })
    await start()
    const manager2 = construct('play').hub.attach({ id: 'probe', kind: 'input' })
    const result = await manager2.submit({ type: 'time/advance', payload: { ms: 50 } })
    expect(result).toMatchObject({ ok: false, reason: 'invalid' })
    expect(result).toMatchObject({ problems: [{ path: ['behaviors', 'test/broken', expect.any(String)] }] })
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

  it('joins the problems of a refused change', async () => {
    setup()
    await start()
    await send({ type: 'store/replace-model', payload: { model: { definitions: [], entities: [] } } })
    await tester.submit(setColor('#b91c1c'))
    await eventually(() => entry('play')?.message !== undefined)
    expect(entry('play')?.message).toMatch(/^No entity has the ID "[^"]+"; No component type has the ID "[^"]+"$/)
  })

  it('reports the reason of a refused change that has no problem', async () => {
    setup()
    await start()
    construct('play').hub.stop()
    await tester.submit(setColor('#b91c1c'))
    await eventually(() => entry('play')?.message !== undefined)
    expect(entry('play')?.message).toBe('not-running')
  })

  it('reports the error of a pass that throws', async () => {
    setup({ behaviors: [exploding] })
    await start()
    fault.armed = true
    await send({ type: 'time/advance', payload: { ms: 50 } })
    fault.armed = false
    expect(entry('play')?.lastSend?.result).toEqual({ ok: false, reason: 'error', message: 'boom' })
  })

  it('gives the step of the clock to each construct', async () => {
    setup({ stepMs: 25 })
    await start()
    expect(clock.intervals).toEqual([25])
  })

  it('logs an error of the product construct', async () => {
    setup()
    await start()
    construct('play')
      .hub.attach({ id: 'probe', kind: 'output' })
      .subscribe(() => {
        throw new Error('listener failed')
      })
    clock.fire(50)
    expect(lines).toContain('wishem: construct play: listener failed')
  })

  it('passes a step to a paused construct', async () => {
    setup()
    await start('play', false)
    await send({ type: 'time/advance', payload: { ms: 50 } })
    expect(countOf(construct('play').hub)).toBe(1)
  })

  it('passes a rewind to a product construct and changes no file', async () => {
    setup()
    await start()
    for (let i = 0; i < 4; i++) {
      clock.fire(50)
    }
    await send({ type: 'hub/rewind', payload: { seq: 1 } })
    expect(timeOf(construct('play').hub).ticks).toBe(1)
    expect(countOf(construct('play').hub)).toBe(1)
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

  describe('a step back', () => {
    const tickSeqs = () =>
      construct('play')
        .hub.record()
        .filter((recorded) => recorded.type === 'time/advance')
        .map((recorded) => recorded.seq)

    /** Fires `count` ticks, then pauses through `constructs/send`. */
    const runPaused = async (count: number) => {
      await start()
      for (let i = 0; i < count; i++) {
        clock.fire(50)
      }
      await send({ type: 'time/set-running', payload: { running: false } })
    }

    /** Sends `constructs/rewind` and waits for its result in the list. */
    const back = async (ticks: number) => {
      const result = await tester.submit(constructInputs.rewind({ construct: 'play', ticks }))
      expect(result.ok).toBe(true)
      const seq = result.ok ? result.seq : -1
      await eventually(() => entry('play')?.lastSend?.seq === seq)
      return seq
    }

    it('steps back one tick and reports ok under the sequence number of the input', async () => {
      setup()
      await runPaused(12)
      expect(timeOf(construct('play').hub).ticks).toBe(12)
      const seq = await back(1)
      expect(timeOf(construct('play').hub).ticks).toBe(11)
      expect(countOf(construct('play').hub)).toBe(11)
      expect(entry('play')?.lastSend).toMatchObject({ seq, result: { ok: true } })
    })

    it('steps back to tick 0 when the count is larger than the history', async () => {
      setup()
      await runPaused(3)
      await back(10)
      expect(timeOf(construct('play').hub).ticks).toBe(0)
      expect(countOf(construct('play').hub)).toBe(0)
    })

    it('steps back two times', async () => {
      setup()
      await runPaused(12)
      await back(1)
      await back(1)
      expect(timeOf(construct('play').hub).ticks).toBe(10)
    })

    it('steps back after a step', async () => {
      setup()
      await runPaused(12)
      await send({ type: 'time/advance', payload: { ms: 50 } })
      expect(timeOf(construct('play').hub).ticks).toBe(13)
      await back(1)
      expect(timeOf(construct('play').hub).ticks).toBe(12)
    })

    it('reports invalid and changes nothing when the construct has no tick', async () => {
      setup()
      await start('play', false)
      const length = construct('play').hub.record().length
      await back(1)
      expect(entry('play')?.lastSend?.result).toMatchObject({
        ok: false,
        reason: 'invalid',
        problems: [{ message: 'The construct has no tick to step back.', path: ['payload', 'ticks'] }],
      })
      expect(construct('play').hub.record()).toHaveLength(length)
    })

    it('keeps the pause: no tick comes after the step back', async () => {
      setup()
      await runPaused(5)
      await back(1)
      expect(timeOf(construct('play').hub).running).toBe(false)
      for (let i = 0; i < 20; i++) {
        clock.fire(50)
      }
      await settle()
      expect(timeOf(construct('play').hub).ticks).toBe(4)
    })

    it('keeps a change of the product and the count before the last tick', async () => {
      setup()
      await runPaused(12)
      await tester.submit(setColor('#b91c1c'))
      await eventually(() => colorOf(construct('play').hub) === '#b91c1c')
      await back(1)
      expect(colorOf(construct('play').hub)).toBe('#b91c1c')
      expect(countOf(construct('play').hub)).toBe(11)
      expect(timeOf(construct('play').hub).ticks).toBe(11)
    })

    it('keeps running when the construct runs', async () => {
      setup()
      await start()
      for (let i = 0; i < 5; i++) {
        clock.fire(50)
      }
      await back(1)
      expect(timeOf(construct('play').hub).running).toBe(true)
      expect(timeOf(construct('play').hub).ticks).toBe(4)
      clock.fire(50)
      await eventually(() => timeOf(construct('play').hub).ticks === 5)
    })

    it('keeps running after a step back across a paused stretch', async () => {
      setup()
      await start()
      clock.fire(50)
      await send({ type: 'time/set-running', payload: { running: false } })
      await send({ type: 'time/advance', payload: { ms: 50 } })
      await send({ type: 'time/advance', payload: { ms: 50 } })
      await send({ type: 'time/set-running', payload: { running: true } })
      for (let i = 0; i < 3; i++) {
        clock.fire(50)
      }
      await eventually(() => timeOf(construct('play').hub).ticks === 6)
      await back(4)
      expect(timeOf(construct('play').hub).running).toBe(true)
      expect(entry('play')?.time).toBe('running')
      clock.fire(50)
      await eventually(() => timeOf(construct('play').hub).ticks === 3)
    })

    it('sends only the difference of the product after a rewind of the workbench past a step back', async () => {
      setup()
      await runPaused(4)
      const original = colorOf(construct('play').hub)
      const before = hub.seq
      await tester.submit(setColor('#b91c1c'))
      await eventually(() => colorOf(construct('play').hub) === '#b91c1c')
      await back(1)
      const length = construct('play').hub.record().length
      await tester.submit(hubInputs.rewind(before))
      await eventually(() => construct('play').hub.record().length > length)
      await settle()
      const types = construct('play')
        .hub.record()
        .slice(length)
        .map((recorded) => recorded.type)
      expect(types).toEqual(['store/set-field'])
      expect(colorOf(construct('play').hub)).toBe(original)
    })

    it('removes the ticks after the target of a hub/rewind that constructs/send passes', async () => {
      setup()
      await runPaused(6)
      const third = tickSeqs()[2]
      await send({ type: 'hub/rewind', payload: { seq: third } })
      expect(timeOf(construct('play').hub).ticks).toBe(3)
      await back(1)
      expect(timeOf(construct('play').hub).ticks).toBe(2)
    })

    it('logs no error of the construct manager when the construct has no tick', async () => {
      setup()
      await start('play', false)
      await back(1)
      await settle()
      expect(lines.filter((line) => line.includes('construct manager:'))).toEqual([])
    })

    it('sends no change when the product did not change after the last tick', async () => {
      setup()
      await start()
      await tester.submit(setColor('#b91c1c'))
      await eventually(() => colorOf(construct('play').hub) === '#b91c1c')
      for (let i = 0; i < 3; i++) {
        clock.fire(50)
      }
      await send({ type: 'time/set-running', payload: { running: false } })
      const from = construct('play').hub.record().length
      await back(1)
      const types = construct('play')
        .hub.record()
        .slice(from)
        .map((recorded) => recorded.type)
      expect(types).toEqual(['hub/rewind', 'time/set-running'])
    })

    it('logs a change after the step back that the construct refuses', async () => {
      setup()
      await start()
      await send({ type: 'store/remove-entity', payload: { entity: SAMPLE_ENTITY } })
      for (let i = 0; i < 3; i++) {
        clock.fire(50)
      }
      await send({ type: 'time/set-running', payload: { running: false } })
      await tester.submit(setColor('#b91c1c'))
      await eventually(() => entry('play')?.message !== undefined)
      await back(1)
      expect(lines).toContain(
        `wishem: construct play: a change after the step back was refused: No entity has the ID "${SAMPLE_ENTITY}"`,
      )
    })

    it('reports the error of a step back that throws', async () => {
      setup({ behaviors: [exploding] })
      await runPaused(3)
      fault.armed = true
      await back(1)
      fault.armed = false
      expect(entry('play')?.lastSend?.result).toEqual({ ok: false, reason: 'error', message: 'boom' })
    })

    it('adds an entity after a step back, with the count before the last tick and the new entity last', async () => {
      setup()
      await runPaused(5)
      await tester.submit(addEntity(counter(SECOND, 1000)))
      await eventually(() => idsOf(construct('play').hub).length === 2)
      const from = construct('play').hub.record().length
      await back(1)
      const types = construct('play')
        .hub.record()
        .slice(from)
        .map((recorded) => recorded.type)
      expect(types.slice(0, 3)).toEqual(['hub/rewind', 'store/add-entity', 'time/set-running'])
      expect(timeOf(construct('play').hub).ticks).toBe(4)
      expect(countOf(construct('play').hub)).toBe(4)
      expect(idsOf(construct('play').hub)).toEqual([SAMPLE_ENTITY, SECOND])
    })

    it('applies the rewind, the changes, and the pause with no tick between them', async () => {
      setup()
      await runPaused(5)
      await tester.submit(setColor('#b91c1c'))
      await eventually(() => colorOf(construct('play').hub) === '#b91c1c')
      const spy = construct('play').hub.attach({ id: 'spy', kind: 'output' })
      let fired = 0
      spy.subscribe((event) => {
        if (event.type === 'applied' && fired++ < 5) {
          queueMicrotask(() => {
            clock.fire(50)
          })
        }
      })
      const from = construct('play').hub.record().length
      await back(1)
      await settle()
      const types = construct('play')
        .hub.record()
        .slice(from)
        .map((recorded) => recorded.type)
      expect(types.slice(0, 3)).toEqual(['hub/rewind', 'store/set-field', 'time/set-running'])
      expect(timeOf(construct('play').hub).ticks).toBe(4)
    })
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
    expect(countOf(construct('play').hub)).toBe(3)
    await tester.submit(constructInputs.stop('play'))
    await eventually(() => entry('play')?.status === 'stopped')
    await start()
    expect(countOf(construct('play').hub)).toBe(0)
    expect(construct('play').hub.seq).toBe(0)
  })

  it('logs the error of a close and goes on with the stop', async () => {
    setup()
    await start()
    const play = construct('play')
    const close = play.close.bind(play)
    play.close = async () => {
      await close()
      throw new Error('close failed')
    }
    await tester.submit(constructInputs.stop('play'))
    await eventually(() => entry('play')?.status === 'stopped')
    expect(lines).toContain('wishem: construct play: close failed')
    expect(lines).toContain('wishem: construct play stopped')
  })

  it('reports the link of the live construct after a rewind to a report with an old link', async () => {
    setup()
    await start()
    const first = entry('play')?.link ?? ''
    const seq = reports().find((input) => (input.payload as { link?: string }).link === first)?.seq ?? -1
    await tester.submit(constructInputs.stop('play'))
    await eventually(() => entry('play')?.status === 'stopped')
    await start()
    const second = construct('play')
    await tester.submit(hubInputs.rewind(seq))
    await eventually(() => hub.seq > seq && manager.running.get('play') !== second)
    await eventually(
      () => entry('play')?.status === 'running' && entry('play')?.link === manager.running.get('play')?.linkUrl,
    )
    expect(entry('play')).toMatchObject({ want: 'running', status: 'running', link: construct('play').linkUrl })
    expect(entry('play')?.link).not.toBe(second.linkUrl)
  })

  const startSeqs = () =>
    hub
      .record()
      .filter((input) => input.type === 'constructs/start')
      .map((input) => input.seq)

  it('starts a new construct when a stop and a start are applied in one pass', async () => {
    setup()
    await start('play', false)
    for (let i = 0; i < 3; i++) {
      clock.fire(50)
    }
    const old = construct('play')
    const oldLink = old.linkUrl
    const viewer = await open(oldLink)
    const events: HubEvent['type'][] = []
    viewer.subscribe((event) => events.push(event.type))
    const results = await Promise.all([
      tester.submit(constructInputs.stop('play')),
      tester.submit(constructInputs.start('play', { running: false })),
    ])
    expect(results.every((result) => result.ok)).toBe(true)
    await eventually(() => manager.running.get('play') !== undefined && manager.running.get('play') !== old)
    await eventually(() => entry('play')?.status === 'running' && entry('play')?.link !== oldLink)
    const fresh = construct('play')
    expect(fresh.linkUrl).not.toBe(oldLink)
    expect(entry('play')?.link).toBe(fresh.linkUrl)
    expect(events).toContain('stopping')
    expect(await canListen(portOf(oldLink))).toBe(true)
    expect(fresh.hub.seq).toBe(0)
    expect(timeOf(fresh.hub)).toMatchObject({ ticks: 0, running: false })
    expect(countOf(fresh.hub)).toBe(0)
    const stopped = lines.indexOf('wishem: construct play stopped')
    expect(stopped).toBeGreaterThan(-1)
    expect(lines.slice(stopped + 1).some((line) => line.startsWith('wishem: construct play runs, link at '))).toBe(true)
    expect(lines.filter((line) => line.startsWith('wishem: construct play runs, '))).toHaveLength(2)
  })

  it('starts a new construct after a rewind to a different start', async () => {
    setup()
    await start()
    const [first] = startSeqs()
    const oldLink = construct('play').linkUrl
    await tester.submit(constructInputs.stop('play'))
    await eventually(() => entry('play')?.status === 'stopped')
    await start()
    const second = construct('play')
    expect(entry('play')?.startSeq).not.toBe(first)
    await tester.submit(hubInputs.rewind(first))
    await eventually(() => entry('play')?.startSeq === first && manager.running.get('play') !== second)
    await eventually(() => entry('play')?.status === 'running' && entry('play')?.link === construct('play').linkUrl)
    expect(construct('play')).not.toBe(second)
    expect(construct('play').linkUrl).not.toBe(second.linkUrl)
    expect(construct('play').linkUrl).not.toBe(oldLink)
    expect(entry('play')?.startSeq).toBe(first)
  })

  it('keeps one live construct for the last start when a stop and a start reach a running start', async () => {
    setup()
    await tester.submit(constructInputs.start('play'))
    await tester.submit(constructInputs.stop('play'))
    await tester.submit(constructInputs.start('play'))
    const last = startSeqs().at(-1)
    await eventually(
      () => entry('play')?.status === 'running' && entry('play')?.link === manager.running.get('play')?.linkUrl,
    )
    await settle()
    expect(manager.running.size).toBe(1)
    expect(entry('play')).toMatchObject({ startSeq: last, status: 'running', want: 'running' })
    expect(entry('play')?.link).toBe(construct('play').linkUrl)
  })

  it('keeps the same construct for two starts with no stop', async () => {
    setup()
    await start()
    const before = construct('play')
    await tester.submit(constructInputs.start('play'))
    await settle()
    expect(construct('play')).toBe(before)
    expect(lines.filter((line) => line.startsWith('wishem: construct play runs, '))).toHaveLength(1)
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
    setup()
    await start()
    const link = entry('play')?.link ?? ''
    expect(lines).toContain(`wishem: construct play runs, link at ${link}`)
    await send({ type: 'store/remove-entity', payload: { entity: SAMPLE_ENTITY } })
    await tester.submit(setColor('#b91c1c'))
    await eventually(() => lines.some((line) => line.includes('the change of the product was refused')))
    await tester.submit(constructInputs.stop('play'))
    await eventually(() => entry('play')?.status === 'stopped')
    expect(lines).toContain('wishem: construct play stopped')
  })

  it('prints the line of a failed start', async () => {
    setup({
      behaviors: duplicates,
    })
    await start()
    expect(lines).toContain('wishem: construct play failed: Two behaviors have the id "sample-product/count".')
  })
})
