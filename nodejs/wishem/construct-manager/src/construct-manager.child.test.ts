import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { TIME_ID } from '@thrashplay/wishem-clock'
import type { TimePart } from '@thrashplay/wishem-clock'
import { createStore } from '@thrashplay/wishem-core'
import type { Entity, Model } from '@thrashplay/wishem-core'
import { readModelFolder, serveHub } from '@thrashplay/wishem-host-nodejs'
import type { HubServer } from '@thrashplay/wishem-host-nodejs'
import { createHub, openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import type { Hub, Input, Port, RecordedInput, RemoteLink } from '@thrashplay/wishem-hub'
import { COLOR_FIELD, COLOR_TYPE, COUNT_FIELD, COUNTER_TYPE, SAMPLE_ENTITY } from '@thrashplay/wishem-sample-product'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { attachConstructManager } from './construct-manager.js'
import type { ConstructManager } from './construct-manager.js'
import { constructInputs, createConstructList } from './construct-list.js'
import type { ConstructEntry, ConstructList } from './construct-list.js'
import { childProcessLauncher } from './launchers.js'
import type { ChildProcessLauncherOptions } from './launchers.js'

const MODEL_FOLDER = fileURLToPath(new URL('../../sample-product/model', import.meta.url))
const SAMPLE_CODE = new URL('../../sample-product/dist/index.js', import.meta.url).href

let model: Model

beforeAll(async () => {
  model = (await readModelFolder(MODEL_FOLDER)).data as Model
})

// The default start limit of the launcher is 10 seconds. The wait is longer, so a slow start shows its own message.
const eventually = async (check: () => boolean, ms = 12000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('timeout')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
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

type State = Readonly<Record<string, unknown>>

const timeOf = (state: State) => state[TIME_ID] as TimePart

const colorOf = (state: State) =>
  (state.store as Model).entities.find((e) => e.id === SAMPLE_ENTITY)?.components[COLOR_TYPE]?.[COLOR_FIELD]

const countOf = (state: State) =>
  (state.store as Model).entities.find((e) => e.id === SAMPLE_ENTITY)?.components[COUNTER_TYPE]?.[COUNT_FIELD]

const setColor = (value: string): Input => ({
  type: 'product/set-field',
  payload: { entity: SAMPLE_ENTITY, componentType: COLOR_TYPE, field: COLOR_FIELD, value },
})

const SECOND = 'e_22222222-2222-4222-8222-222222222222'

const secondEntity = (): Entity => ({
  id: SECOND,
  components: { [COUNTER_TYPE]: { [COUNT_FIELD]: 1000 } },
})

const idsOf = (state: State) => (state.store as Model).entities.map((e) => e.id)

const pause: Input = { type: 'time/set-running', payload: { running: false } }

const advance: Input = { type: 'time/advance', payload: { ms: 50 } }

/** Product code with one behavior of the type Counter. `body` runs at each tick. */
const behaviorCode = (body: string): string =>
  `import { existsSync, writeFileSync } from 'node:fs'\n` +
  `export const behaviors = [{ id: 'fault', componentType: ${JSON.stringify(COUNTER_TYPE)}, update: (fields) => { ${body}\nreturn fields } }]\n`

describe('attachConstructManager with product construct processes', () => {
  let hub: Hub
  let tester: Port
  let manager: ConstructManager
  let lines: string[]
  let pids: number[]
  let links: RemoteLink[]
  let sockets: WebSocket[]
  let workbench: HubServer | undefined
  let folder = ''

  const setup = (options: ChildProcessLauncherOptions = { productCode: SAMPLE_CODE }) => {
    lines = []
    pids = []
    links = []
    sockets = []
    hub = createHub({
      subsystems: [createStore(), createStore({ id: 'product', model }), createConstructList()],
    })
    hub.start()
    tester = hub.attach({ id: 'tester', kind: 'input' })
    const launch = childProcessLauncher(options)
    manager = attachConstructManager({
      hub,
      log: (line) => lines.push(line),
      launch: (start, hooks) =>
        launch(start, {
          ...hooks,
          onProcess: (pid) => {
            pids.push(pid)
            hooks?.onProcess?.(pid)
          },
        }),
    })
  }

  const folderOf = async () => {
    folder = folder === '' ? await mkdtemp(join(tmpdir(), 'wishem-manager-child-')) : folder
    return folder
  }

  const writeCode = async (name: string, text: string) => {
    const file = join(await folderOf(), name)
    await writeFile(file, text)
    return pathToFileURL(file).href
  }

  afterEach(async () => {
    for (const link of links) {
      link.close()
    }
    for (const socket of sockets) {
      socket.close()
    }
    await manager.close()
    await workbench?.close()
    workbench = undefined
    if (hub.status === 'running') {
      hub.stop()
    }
    const left = pids.filter(alive)
    for (const pid of left) {
      process.kill(pid, 'SIGKILL')
    }
    if (folder !== '') {
      await rm(folder, { recursive: true, force: true })
      folder = ''
    }
    expect(left).toEqual([])
  })

  const entry = (id: string): ConstructEntry | undefined => (hub.read().constructs as ConstructList).constructs[id]

  const construct = (id: string) => {
    const found = manager.running.get(id)
    if (!found) {
      throw new Error(`The construct ${id} does not run.`)
    }
    return found
  }

  const stateOf = (id: string) => construct(id).reader.read()

  const start = async (id = 'play', running?: boolean) => {
    const result = await tester.submit(constructInputs.start(id, running === undefined ? {} : { running }))
    expect(result.ok).toBe(true)
    await eventually(() => {
      const status = entry(id)?.status
      return status === 'running' || status === 'failed'
    })
  }

  const stop = async (id = 'play') => {
    await tester.submit(constructInputs.stop(id))
    await eventually(() => entry(id)?.status === 'stopped')
  }

  const send = async (input: Input, id = 'play') => {
    const result = await tester.submit(constructInputs.send(id, input))
    expect(result.ok).toBe(true)
    const seq = result.ok ? result.seq : -1
    await eventually(() => entry(id)?.lastSend?.seq === seq)
    return entry(id)?.lastSend
  }

  const stepBack = async (ticks: number) => {
    const result = await tester.submit(constructInputs.rewind({ construct: 'play', ticks }))
    expect(result.ok).toBe(true)
    const seq = result.ok ? result.seq : -1
    await eventually(() => entry('play')?.lastSend?.seq === seq)
    return entry('play')?.lastSend
  }

  const open = async (link: string) => {
    const socket = new WebSocket(link)
    sockets.push(socket)
    const remote = await openLink(await webSocketChannel(socket), [{ id: 'viewer', kind: 'output' }])
    links.push(remote)
    return remote.ports.viewer
  }

  /** The inputs that a construct applies from now on, in order. */
  const appliedOf = (id: string) => {
    const applied: RecordedInput[] = []
    construct(id).reader.subscribe((event) => {
      if (event.type === 'applied') {
        applied.push(event.input)
      }
    })
    return applied
  }

  it(
    'reports running with a link that gives welcome, and logs the process before the link',
    { timeout: 20000 },
    async () => {
      setup()
      await start()
      expect(entry('play')?.status).toBe('running')
      const viewer = await open(entry('play')?.link ?? '')
      expect(Object.keys(viewer.read())).toContain(TIME_ID)
      const processLine = lines.indexOf(`wishem: construct play runs in the process ${construct('play').pid}`)
      const linkLine = lines.indexOf(`wishem: construct play runs, link at ${entry('play')?.link}`)
      expect(processLine).toBeGreaterThanOrEqual(0)
      expect(linkLine).toBeGreaterThan(processLine)
    },
  )

  it('runs play and check in two processes with two addresses', { timeout: 20000 }, async () => {
    setup()
    await start('play')
    await start('check')
    const [play, check] = [construct('play'), construct('check')]
    expect(play.pid).not.toBe(process.pid)
    expect(check.pid).not.toBe(process.pid)
    expect(play.pid).not.toBe(check.pid)
    expect(play.linkUrl).not.toBe(check.linkUrl)
    expect(entry('play')?.link).toBe(play.linkUrl)
    expect(entry('check')?.link).toBe(check.linkUrl)
  })

  describe('the time of a construct', () => {
    it('pauses and steps', { timeout: 20000 }, async () => {
      setup()
      await start('play', false)
      expect(entry('play')?.time).toBe('paused')
      await send(advance)
      expect(timeOf(stateOf('play')).ticks).toBe(1)
      expect(countOf(stateOf('play'))).toBe(1)
      await send(advance)
      expect(timeOf(stateOf('play')).ticks).toBe(2)
    })

    it('steps back across the processes with the changes of the product', { timeout: 30000 }, async () => {
      setup()
      await start('play', false)
      for (let i = 0; i < 12; i++) {
        await send(advance)
      }
      expect(timeOf(stateOf('play')).ticks).toBe(12)
      const applied = appliedOf('play')
      await tester.submit(setColor('#b91c1c'))
      await eventually(() => colorOf(stateOf('play')) === '#b91c1c')
      const last = await stepBack(1)
      expect(last?.result).toMatchObject({ ok: true })
      expect(timeOf(stateOf('play')).ticks).toBe(11)
      expect(colorOf(stateOf('play'))).toBe('#b91c1c')
      const types = applied.map((input) => input.type)
      const at = types.indexOf('hub/rewind')
      expect(at).toBeGreaterThanOrEqual(0)
      expect(types.slice(at)).not.toContain('time/advance')
    })

    it('adds an entity before a step back across the processes', { timeout: 30000 }, async () => {
      setup()
      await start('play', false)
      for (let i = 0; i < 12; i++) {
        await send(advance)
      }
      const applied = appliedOf('play')
      await tester.submit({ type: 'product/add-entity', payload: { entity: secondEntity() } })
      await eventually(() => idsOf(stateOf('play')).length === 2)
      const last = await stepBack(1)
      expect(last?.result).toMatchObject({ ok: true })
      expect(timeOf(stateOf('play')).ticks).toBe(11)
      expect(idsOf(stateOf('play'))).toEqual([SAMPLE_ENTITY, SECOND])
      const types = applied.map((input) => input.type)
      const at = types.indexOf('hub/rewind')
      expect(at).toBeGreaterThanOrEqual(0)
      const rest = types.slice(at)
      expect(rest).not.toContain('time/advance')
      expect(rest.indexOf('store/add-entity')).toBeGreaterThan(0)
    })

    it('steps back n - 1 ticks to 1 tick after a run of 1 second', { timeout: 30000 }, async () => {
      setup()
      await start('play')
      await wait(1000)
      await send(pause)
      await eventually(() => entry('play')?.time === 'paused')
      const ticks = timeOf(stateOf('play')).ticks
      expect(ticks).toBeGreaterThanOrEqual(2)
      await stepBack(ticks - 1)
      expect(timeOf(stateOf('play')).ticks).toBe(1)
      expect(entry('play')?.time).toBe('paused')
    })
  })

  it('sends add-entity with the index 0 for an entity before the sample entity', { timeout: 30000 }, async () => {
    setup()
    await start('play', false)
    await send({
      type: 'store/set-field',
      payload: { entity: SAMPLE_ENTITY, componentType: COUNTER_TYPE, field: COUNT_FIELD, value: 25 },
    })
    const applied = appliedOf('play')
    const sample = model.entities.find((e) => e.id === SAMPLE_ENTITY) as Entity
    await tester.submit({
      type: 'product/replace-model',
      payload: { model: { ...structuredClone(model), entities: [secondEntity(), structuredClone(sample)] } },
    })
    await eventually(() => idsOf(stateOf('play')).length === 2)
    const adds = applied.filter((input) => input.type === 'store/add-entity')
    expect(adds).toHaveLength(1)
    expect(adds[0]).toMatchObject({ source: 'construct-manager', payload: { index: 0 } })
    expect(applied.some((input) => input.type === 'store/replace-model')).toBe(false)
    expect(idsOf(stateOf('play'))).toEqual([SECOND, SAMPLE_ENTITY])
    expect(countOf(stateOf('play'))).toBe(25)
  })

  it('gives a product/set-field to the construct with the source construct-manager', { timeout: 20000 }, async () => {
    setup()
    await start('play', false)
    const applied = appliedOf('play')
    await tester.submit(setColor('#15803d'))
    await eventually(() => colorOf(stateOf('play')) === '#15803d')
    expect(applied.find((input) => input.type === 'store/set-field')).toMatchObject({ source: 'construct-manager' })
  })

  it(
    'stops a construct: stopping, a free port, the end of the process, the status stopped',
    {
      timeout: 20000,
    },
    async () => {
      setup()
      await start()
      const { pid, linkUrl } = construct('play')
      const viewer = await open(linkUrl)
      const events: string[] = []
      viewer.subscribe((event) => events.push(event.type))
      await stop()
      await eventually(() => events.includes('stopping'))
      await eventually(() => !alive(pid))
      expect(await canListen(Number(new URL(linkUrl).port))).toBe(true)
      expect(manager.running.size).toBe(0)
      expect(entry('play')?.status).toBe('stopped')
    },
  )

  it('gives a new process and a record that starts at 0 after a stop and a start', { timeout: 20000 }, async () => {
    setup()
    await start('play')
    await eventually(() => timeOf(stateOf('play')).ticks >= 3)
    const first = construct('play').pid
    await stop()
    await tester.submit(constructInputs.start('play', { running: false }))
    await eventually(() => entry('play')?.status === 'running')
    expect(construct('play').pid).not.toBe(first)
    expect(timeOf(stateOf('play')).ticks).toBe(0)
  })

  it(
    'reports failed for a behavior that calls process.exit(3), and runs again after a stop and a start',
    {
      timeout: 30000,
    },
    async () => {
      const flag = join(await folderOf(), 'flag')
      const productCode = await writeCode(
        'exit.mjs',
        behaviorCode(
          `if (!existsSync(${JSON.stringify(flag)})) { writeFileSync(${JSON.stringify(flag)}, 'x'); process.exit(3) }`,
        ),
      )
      setup({ productCode, stepMs: 20 })
      workbench = await serveHub(hub, { port: 0 })
      await start()
      await eventually(() => entry('play')?.status === 'failed')
      expect(entry('play')).toMatchObject({
        status: 'failed',
        message: 'The process of the construct ended with the exit code 3.',
      })
      expect(lines).toContain('wishem: construct play failed: The process of the construct ended with the exit code 3.')
      expect(manager.running.size).toBe(0)
      const viewer = await open(workbench.linkUrl)
      expect(Object.keys(viewer.read())).toContain('constructs')
      await tester.submit(constructInputs.stop('play'))
      await tester.submit(constructInputs.start('play'))
      await eventually(() => entry('play')?.status === 'running')
      expect(manager.running.has('play')).toBe(true)
      await wait(300)
      expect(entry('play')?.status).toBe('running')
    },
  )

  it(
    'reports failed for a behavior that does not end, and the workbench and the other construct continue',
    {
      timeout: 40000,
    },
    async () => {
      const productCode = await writeCode('loop.mjs', behaviorCode('for (;;) {}'))
      setup({ productCode, stepMs: 20, pingMs: 200, answerMs: 3000 })
      await start('check', false)
      await start('play')
      const begin = Date.now()
      const result = await tester.submit(setColor('#b91c1c'))
      expect(result.ok).toBe(true)
      expect(Date.now() - begin).toBeLessThan(1000)
      await eventually(() => entry('play')?.status === 'failed', 20000)
      expect(entry('play')?.message).toBe('The construct did not answer in 3 seconds.')
      const answer = await send(
        {
          type: 'store/set-field',
          payload: { entity: SAMPLE_ENTITY, componentType: COUNTER_TYPE, field: COUNT_FIELD, value: 7 },
        },
        'check',
      )
      expect(answer?.result).toMatchObject({ ok: true })
      expect(entry('check')?.status).toBe('running')
    },
  )

  it(
    'ends the process of a construct whose behavior does not end in less than 3 seconds',
    {
      timeout: 30000,
    },
    async () => {
      const productCode = await writeCode('loop.mjs', behaviorCode('for (;;) {}'))
      setup({ productCode, stepMs: 20, pingMs: 20000, answerMs: 20000 })
      await start('play')
      const { pid } = construct('play')
      await wait(300)
      const begin = Date.now()
      await stop()
      expect(Date.now() - begin).toBeLessThan(3000)
      expect(alive(pid)).toBe(false)
    },
  )

  it('logs a line of console.log of a behavior with the ID of the construct', { timeout: 20000 }, async () => {
    const productCode = await writeCode(
      'log.mjs',
      behaviorCode(`if (!globalThis.said) { globalThis.said = true; console.log('hello from play') }`),
    )
    setup({ productCode, stepMs: 20 })
    await start('play')
    await eventually(() => lines.includes('wishem: construct play: hello from play'))
  })

  it('ends each process on close()', { timeout: 20000 }, async () => {
    setup()
    await start('play')
    await start('check')
    const [first, second] = [construct('play').pid, construct('check').pid]
    await manager.close()
    expect(alive(first)).toBe(false)
    expect(alive(second)).toBe(false)
    expect(manager.running.size).toBe(0)
  })
})
