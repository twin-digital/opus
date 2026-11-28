import { fork, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { timeInputs } from '@thrashplay/wishem-clock'
import type { TimePart } from '@thrashplay/wishem-clock'
import { COUNT_FIELD, COUNTER_TYPE, SAMPLE_ENTITY } from '@thrashplay/wishem-sample-product'
import { createStore, storeInputs } from '@thrashplay/wishem-core'
import type { FieldValue, Model } from '@thrashplay/wishem-core'
import { readModelFolder } from '@thrashplay/wishem-host-nodejs'
import { hubInputs, openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import type { HubEvent, RemoteLink } from '@thrashplay/wishem-hub'
import { createUpdate } from '@thrashplay/wishem-update'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { CONSTRUCT_MANAGER_ID, CONSTRUCT_MANAGER_READER_ID } from './ids.js'
import { childProcessLauncher } from './node.js'
import type { LaunchedConstruct } from './node.js'

const stall = vi.hoisted(() => ({ ms: 0 }))

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>()
  return {
    ...original,
    // Blocks this process when the child reports `ready`, before the launcher reads the message.
    fork: (...args: Parameters<typeof original.fork>) => {
      const child = original.fork(...args)
      child.on('message', (message: { t?: string }) => {
        if (message.t === 'ready' && stall.ms > 0) {
          const end = Date.now() + stall.ms
          while (Date.now() < end) {
            // Busy wait.
          }
        }
      })
      return child
    },
  }
})

const MODEL_FOLDER = fileURLToPath(new URL('../../sample-product/model', import.meta.url))
// The child has no source condition, so it loads the built file.
const PRODUCT_CODE = new URL('../../sample-product/dist/index.js', import.meta.url).href
const NODE_ENTRY = new URL('../dist/node.js', import.meta.url).href

let model: Model

beforeAll(async () => {
  model = (await readModelFolder(MODEL_FOLDER)).data as Model
})

const countOf = (state: Readonly<Record<string, unknown>>): FieldValue | undefined =>
  (state.store as Model).entities.find((entity) => entity.id === SAMPLE_ENTITY)?.components[COUNTER_TYPE]?.[COUNT_FIELD]

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

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const portOf = (linkUrl: string) => Number(new URL(linkUrl).port)

const PROCESS_FILE = fileURLToPath(new URL('../dist/product-construct-process.js', import.meta.url))

describe('the messages of the product construct process', () => {
  const children: ChildProcess[] = []

  afterEach(() => {
    for (const child of children.splice(0)) {
      child.kill('SIGKILL')
    }
  })

  const rawChild = () => {
    const child = fork(PROCESS_FILE, [], { execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
    children.push(child)
    const messages: { t: string; message?: string; count?: number }[] = []
    child.on('message', (message: { t: string }) => messages.push(message))
    const exit = new Promise<number | null>((resolve) => {
      child.once('exit', (code) => {
        resolve(code)
      })
    })
    const seen = (type: string) =>
      vi.waitFor(() => {
        expect(messages.map((message) => message.t)).toContain(type)
      })
    return { child, messages, exit, seen }
  }

  it('sends failed and ends with the exit code 1 when the product code is missing', async () => {
    const { child, messages, exit, seen } = rawChild()
    child.send({ t: 'start', id: 'play', model, running: true, productCode: 'file:///missing/product.mjs' })
    await seen('failed')
    expect(messages.find((message) => message.t === 'failed')?.message).toContain('missing')
    expect(await exit).toBe(1)
  })

  it('sends failed and ends with the exit code 1 for serve before start', async () => {
    const { child, messages, exit, seen } = rawChild()
    child.send({ t: 'serve' })
    await seen('failed')
    expect(messages[0]).toEqual({ t: 'failed', message: 'The construct has not started.' })
    expect(await exit).toBe(1)
  })

  it('ends with the exit code 0 on stop', async () => {
    const { child, seen, exit } = rawChild()
    child.send({ t: 'start', id: 'play', model, running: true })
    await seen('ready')
    child.send({ t: 'serve' })
    await seen('serving')
    child.send({ t: 'stop' })
    expect(await exit).toBe(0)
  })

  it('answers a check and ends with the exit code 0', async () => {
    const { child, messages, exit } = rawChild()
    child.send({ t: 'check', productCode: PRODUCT_CODE })
    expect(await exit).toBe(0)
    expect(messages).toEqual([{ t: 'checked', count: 2 }])
  })

  it('writes a line and ends with the exit code 1 when it runs with no IPC channel', async () => {
    const child = spawn(process.execPath, [PROCESS_FILE], { stdio: ['ignore', 'ignore', 'pipe'] })
    children.push(child)
    let text = ''
    child.stderr.on('data', (chunk: Buffer) => {
      text += chunk.toString()
    })
    const code = await new Promise<number | null>((resolve) => {
      child.once('exit', (exitCode) => {
        resolve(exitCode)
      })
    })
    expect(code).toBe(1)
    expect(text).toContain('runs as a child process with an IPC channel')
  })
})

describe('the product construct process', () => {
  const launched: LaunchedConstruct[] = []
  const links: RemoteLink[] = []
  const sockets: WebSocket[] = []
  const spawned: ChildProcess[] = []
  const grandchildren: number[] = []
  const groups: number[] = []
  let folder = ''

  const launch = async (
    options: Parameters<typeof childProcessLauncher>[0] = {},
    hooks: Parameters<ReturnType<typeof childProcessLauncher>>[1] = {},
    running = true,
  ) => {
    const construct = await childProcessLauncher({ productCode: PRODUCT_CODE, ...options })(
      { id: 'play', model, running },
      hooks,
    )
    launched.push(construct)
    return construct
  }

  const connect = async (construct: LaunchedConstruct, subsystem: { id: string; kind: 'input' | 'output' }) => {
    const socket = new WebSocket(construct.linkUrl)
    sockets.push(socket)
    const link = await openLink(await webSocketChannel(socket), [subsystem])
    links.push(link)
    return link.ports[subsystem.id]
  }

  const writeCode = async (name: string, text: string) => {
    const file = join(folder, name)
    await writeFile(file, text)
    return pathToFileURL(file).href
  }

  afterEach(async () => {
    for (const group of groups.splice(0)) {
      try {
        process.kill(-group, 'SIGKILL')
      } catch {
        // The group is gone.
      }
    }
    for (const parent of spawned.splice(0)) {
      parent.kill('SIGKILL')
    }
    for (const pid of grandchildren.splice(0)) {
      if (alive(pid)) {
        process.kill(pid, 'SIGKILL')
      }
    }
    for (const link of links.splice(0)) {
      link.close()
    }
    for (const socket of sockets.splice(0)) {
      socket.close()
    }
    for (const construct of launched.splice(0)) {
      await construct.close()
    }
    if (folder !== '') {
      await rm(folder, { recursive: true, force: true })
    }
  })

  const setup = async () => {
    folder = await mkdtemp(join(tmpdir(), 'wishem-product-construct-process-'))
  }

  it('gives a link whose welcome has the parts time and store and the step length 50', async () => {
    await setup()
    const construct = await launch()
    const port = await connect(construct, { id: 'probe', kind: 'output' })
    expect(Object.keys(port.read())).toEqual(['time', 'store'])
    expect((port.read().time as TimePart).stepMs).toBe(50)
  })

  it('gives a pid that is not this process, and onProcess gets it before the launch resolves', async () => {
    await setup()
    const pids: number[] = []
    const construct = await launch({}, { onProcess: (pid) => pids.push(pid) })
    expect(construct.pid).not.toBe(process.pid)
    expect(pids).toEqual([construct.pid])
    expect(alive(construct.pid)).toBe(true)
  })

  it('grows the count with the product code of the sample product', async () => {
    await setup()
    const construct = await launch()
    await vi.waitFor(() => {
      expect(countOf(construct.reader.read())).toBeGreaterThan(0)
    })
  })

  it('keeps the count with no product code', async () => {
    await setup()
    const construct = await childProcessLauncher({ stepMs: 5 })({ id: 'play', model, running: true })
    launched.push(construct)
    await vi.waitFor(() => {
      expect((construct.reader.read().time as TimePart).ticks).toBeGreaterThan(3)
    })
    expect(countOf(construct.reader.read())).toBe(0)
  })

  it('gives ok for time/set-running, and the reader holds the value when the result arrives', async () => {
    await setup()
    const construct = await launch()
    const result = await construct.input.submit(timeInputs.setRunning(false))
    expect(result.ok).toBe(true)
    expect((construct.reader.read().time as TimePart).running).toBe(false)
  })

  it('refuses a WebSocket client that takes an ID of the manager', async () => {
    await setup()
    const construct = await launch()
    for (const id of [CONSTRUCT_MANAGER_ID, CONSTRUCT_MANAGER_READER_ID]) {
      await expect(
        connect(construct, { id, kind: id === CONSTRUCT_MANAGER_ID ? 'input' : 'output' }),
      ).rejects.toMatchObject({
        reason: 'id-in-use',
      })
    }
  })

  it('refuses hub/rewind from a WebSocket client and accepts it from the manager', async () => {
    await setup()
    const construct = await launch()
    const client = await connect(construct, { id: 'client', kind: 'input' })
    expect(await client.submit(hubInputs.rewind(0))).toMatchObject({ ok: false, reason: 'not-permitted' })
    expect((await construct.input.submit(hubInputs.rewind(0))).ok).toBe(true)
  })

  it('shows no tick to the manager before the first one that it sees has the sequence number 1', async () => {
    await setup()
    stall.ms = 600
    const construct = await launch({ stepMs: 200 })
    stall.ms = 0
    const seen: { type: string; seq: number }[] = []
    construct.reader.subscribe((event: HubEvent) => {
      if (event.type === 'applied') {
        seen.push({ type: event.input.type, seq: event.input.seq })
      }
    })
    await vi.waitFor(
      () => {
        expect(seen.length).toBeGreaterThan(0)
      },
      { timeout: 4000 },
    )
    expect(seen[0]).toEqual({ type: 'time/advance', seq: 1 })
  })

  it('applies the inputs of one turn with no tick between them, in 20 runs', async () => {
    await setup()
    const construct = await launch({ stepMs: 5 })
    const record: { type: string; seq: number }[] = []
    construct.reader.subscribe((event: HubEvent) => {
      if (event.type === 'applied') {
        record.push({ type: event.input.type, seq: event.input.seq })
      }
    })
    const set = storeInputs().setField({
      entity: SAMPLE_ENTITY,
      componentType: COUNTER_TYPE,
      field: COUNT_FIELD,
      value: 0,
    })
    for (let run = 0; run < 20; run++) {
      await construct.input.submit(timeInputs.setRunning(true))
      const before = record.length
      await vi.waitFor(() => {
        expect(record.length).toBeGreaterThan(before + 1)
      })
      const last = record[record.length - 1].seq
      const start = record.length
      await Promise.all([
        construct.input.submit(hubInputs.rewind(last - 1)),
        construct.input.submit(set),
        construct.input.submit(timeInputs.setRunning(false)),
      ])
      const at = record.findIndex((item, position) => position >= start && item.type === 'hub/rewind')
      expect(record.slice(at, at + 3).map((item) => item.type)).toEqual([
        'hub/rewind',
        'store/set-field',
        'time/set-running',
      ])
    }
  })

  it('gives a line of console.log in a behavior to onLine', async () => {
    await setup()
    const productCode = await writeCode(
      'logging.mjs',
      `export const behaviors = [{ id: 'log', componentType: ${JSON.stringify(COUNTER_TYPE)}, update: (fields) => { console.log('line from the behavior'); return fields } }]\n`,
    )
    const lines: string[] = []
    await launch({ productCode }, { onLine: (line) => lines.push(line) })
    await vi.waitFor(() => {
      expect(lines).toContain('line from the behavior')
    })
  })

  it('sends stopping on close, frees the port, ends the process, and gives the same promise', async () => {
    await setup()
    const construct = await launch()
    const client = await connect(construct, { id: 'client', kind: 'output' })
    const events: string[] = []
    client.subscribe((event) => events.push(event.type))
    const first = construct.close()
    const second = construct.close()
    expect(second).toBe(first)
    await first
    expect(events).toContain('stopping')
    expect(await canListen(portOf(construct.linkUrl))).toBe(true)
    expect(alive(construct.pid)).toBe(false)
  })

  it('rejects the launch with the error of createUpdate for two behaviors with one ID, and ends the process', async () => {
    await setup()
    const productCode = await writeCode(
      'duplicate.mjs',
      `export const behaviors = [{ id: 'same', componentType: 'a', update: (f) => f }, { id: 'same', componentType: 'b', update: (f) => f }]\n`,
    )
    let duplicate = ''
    try {
      createUpdate({
        store: createStore({ model }),
        behaviors: [
          { id: 'same', componentType: 'a', update: (f) => f },
          { id: 'same', componentType: 'b', update: (f) => f },
        ],
      })
    } catch (error) {
      duplicate = (error as Error).message
    }
    const pids: number[] = []
    await expect(
      childProcessLauncher({ productCode })(
        { id: 'play', model, running: true },
        { onProcess: (pid) => pids.push(pid) },
      ),
    ).rejects.toThrow(duplicate)
    expect(pids).toHaveLength(1)
    expect(alive(pids[0])).toBe(false)
  })

  /** Starts a parent script that launches one product construct, and gives the process IDs and the link URL. */
  const startParent = async (productCode: string, launcherOptions: string, detached: boolean) => {
    const modelFile = join(folder, 'model.json')
    await writeFile(modelFile, JSON.stringify(model))
    const script = join(folder, 'parent-group.mjs')
    await writeFile(
      script,
      `import { readFileSync } from 'node:fs'
import { childProcessLauncher } from ${JSON.stringify(NODE_ENTRY)}
const model = JSON.parse(readFileSync(${JSON.stringify(modelFile)}, 'utf8'))
const construct = await childProcessLauncher({ productCode: ${JSON.stringify(productCode)}, ${launcherOptions} })({ id: 'play', model, running: true })
console.log(JSON.stringify({ pid: construct.pid, linkUrl: construct.linkUrl }))
setInterval(() => {}, 1000)
`,
    )
    const parent = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'inherit'], detached })
    spawned.push(parent)
    const info = await new Promise<{ pid: number; linkUrl: string }>((resolve, reject) => {
      let text = ''
      parent.stdout.on('data', (chunk: Buffer) => {
        text += chunk.toString()
        if (text.includes('\n')) {
          resolve(JSON.parse(text.split('\n')[0]) as { pid: number; linkUrl: string })
        }
      })
      parent.once('exit', () => {
        reject(new Error('The parent script ended.'))
      })
    })
    grandchildren.push(info.pid)
    return { parent, ...info }
  }

  const waitDead = (pid: number, timeout: number) =>
    vi.waitFor(
      () => {
        expect(alive(pid)).toBe(false)
      },
      { timeout, interval: 50 },
    )

  it('gives stopping to a client and ends each process when the process group gets SIGINT', async () => {
    await setup()
    const { parent, pid, linkUrl } = await startParent(PRODUCT_CODE, '', true)
    const parentPid = parent.pid as number
    groups.push(parentPid)
    const socket = new WebSocket(linkUrl)
    sockets.push(socket)
    const link = await openLink(await webSocketChannel(socket), [{ id: 'client', kind: 'output' }])
    links.push(link)
    const events: string[] = []
    link.ports.client.subscribe((event) => events.push(event.type))
    process.kill(-parentPid, 'SIGINT')
    await waitDead(pid, 5000)
    expect(events).toContain('stopping')
    await waitDead(parentPid, 2000)
  })

  it(
    'ends a child whose event loop is blocked in at most 2 seconds after SIGKILL of the parent',
    { timeout: 10000 },
    async () => {
      await setup()
      const productCode = await writeCode(
        'loop.mjs',
        `export const behaviors = [{ id: 'fault', componentType: ${JSON.stringify(COUNTER_TYPE)}, update: () => { for (;;) {} } }]\n`,
      )
      const { parent, pid } = await startParent(
        productCode,
        'stepMs: 10, pingMs: 60000, answerMs: 60000, startMs: 60000',
        false,
      )
      expect(alive(pid)).toBe(true)
      await new Promise((resolve) => setTimeout(resolve, 300))
      parent.kill('SIGKILL')
      const begin = Date.now()
      await waitDead(pid, 3000)
      expect(Date.now() - begin).toBeLessThan(2000)
    },
  )

  it('leaves no child when the parent gets SIGKILL, and the link refuses a connection', async () => {
    await setup()
    const modelFile = join(folder, 'model.json')
    await writeFile(modelFile, JSON.stringify(model))
    const script = join(folder, 'parent.mjs')
    await writeFile(
      script,
      `import { readFileSync } from 'node:fs'
import { childProcessLauncher } from ${JSON.stringify(NODE_ENTRY)}
const model = JSON.parse(readFileSync(${JSON.stringify(modelFile)}, 'utf8'))
const construct = await childProcessLauncher({ productCode: ${JSON.stringify(PRODUCT_CODE)} })({ id: 'play', model, running: true })
console.log(JSON.stringify({ pid: construct.pid, linkUrl: construct.linkUrl }))
setInterval(() => {}, 1000)
`,
    )
    const parent = spawn(process.execPath, [script], { stdio: ['ignore', 'pipe', 'inherit'] })
    spawned.push(parent)
    const info = await new Promise<{ pid: number; linkUrl: string }>((resolve, reject) => {
      let text = ''
      parent.stdout.on('data', (chunk: Buffer) => {
        text += chunk.toString()
        const line = text.split('\n')[0]
        if (text.includes('\n')) {
          resolve(JSON.parse(line) as { pid: number; linkUrl: string })
        }
      })
      parent.once('exit', () => {
        reject(new Error('The parent script ended.'))
      })
    })
    grandchildren.push(info.pid)
    expect(alive(info.pid)).toBe(true)
    parent.kill('SIGKILL')
    await vi.waitFor(
      () => {
        expect(alive(info.pid)).toBe(false)
      },
      { timeout: 2000, interval: 50 },
    )
    const refused = await new Promise<boolean>((resolve) => {
      const socket = new WebSocket(info.linkUrl)
      socket.addEventListener('error', () => {
        resolve(true)
      })
      socket.addEventListener('open', () => {
        socket.close()
        resolve(false)
      })
    })
    expect(refused).toBe(true)
  })
})
