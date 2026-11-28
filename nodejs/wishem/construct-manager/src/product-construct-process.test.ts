import { spawn } from 'node:child_process'
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

describe('the product construct process', () => {
  const launched: LaunchedConstruct[] = []
  const links: RemoteLink[] = []
  const sockets: WebSocket[] = []
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
    const construct = await launch()
    const seen: { type: string; seq: number }[] = []
    construct.reader.subscribe((event: HubEvent) => {
      if (event.type === 'applied') {
        seen.push({ type: event.input.type, seq: event.input.seq })
      }
    })
    await vi.waitFor(() => {
      expect(seen.length).toBeGreaterThan(0)
    })
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
