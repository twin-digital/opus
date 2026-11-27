// @vitest-environment node
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, connect, type Server } from 'node:net'
import { networkInterfaces, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { storeInputs } from '@thrashplay/wishem-core'
import type { startConstruct } from '@thrashplay/wishem-host-nodejs'
import { hubInputs, openLink, webSocketChannel, type Hub } from '@thrashplay/wishem-hub'
import { startWorkbench, StartError } from '../scripts/start.js'

const vite = vi.hoisted(() => ({ createServer: vi.fn() }))

const hostModule = vi.hoisted(() => ({ startConstruct: vi.fn() }))

vi.mock('vite', () => ({ createServer: vite.createServer }))
vi.mock('@thrashplay/wishem-host-nodejs', async (importActual) => {
  const actual = await importActual<typeof import('@thrashplay/wishem-host-nodejs')>()
  hostModule.startConstruct.mockImplementation(actual.startConstruct)
  return { ...actual, startConstruct: hostModule.startConstruct }
})

const script = join(import.meta.dirname, '..', 'scripts', 'start.ts')
const baseModel = join(import.meta.dirname, '..', '..', 'workbench', 'model')
const appBarSidecar = join(import.meta.dirname, 'views', 'AppBar.view.json')
const APP_BAR = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'
const TITLE = 'fld_b81d04e7-2c6f-4a39-8d15-0e9a7f3c5b62'
const ENTITY = 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2'

/** Opens a link at the address with one input subsystem and one output subsystem. */
const openTestLink = async (address: string) => {
  const socket = new WebSocket(address)
  const channel = await webSocketChannel(socket)
  const link = await openLink(channel, [
    { id: 'tester', kind: 'input' },
    { id: 'reader', kind: 'output' },
  ])
  return { link, tester: link.ports.tester, reader: link.ports.reader }
}

/** The JSON text of the part `store` that the hub gives at the address. */
const readStore = async (address: string) => {
  const { link, reader } = await openTestLink(address)
  const text = JSON.stringify(reader.read().store)
  link.close()
  return text
}

interface Run {
  child: ChildProcess
  output: () => string
  exit: Promise<number | null>
}

const until = async (check: () => boolean, describeState: () => string, ms = 20000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error(`timeout: ${describeState()}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer()
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port)
        } else {
          reject(new Error('no port'))
        }
      })
    })
  })

const refuses = (host: string, port: number) =>
  new Promise<boolean>((resolve) => {
    const socket = connect(port, host)
    socket.once('connect', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => {
      resolve(true)
    })
  })

describe('the start script of the workbench', () => {
  let folder = ''
  let model = ''
  let views = ''
  const children: ChildProcess[] = []
  const blockers: Server[] = []

  const start = (args: string[]): Run => {
    const child = spawn('node', [script, '--model', model, '--views', views, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    children.push(child)
    let text = ''
    child.stdout.on('data', (chunk: Buffer) => (text += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (text += chunk.toString()))
    const exit = new Promise<number | null>((resolve) => child.once('close', resolve))
    return { child, output: () => text, exit }
  }

  /** Starts with system-selected ports. Resolves with the two addresses. */
  const startReady = async () => {
    const run = start(['--port', '0', '--hub-port', '0'])
    const found = () => /wishem: workbench at (http:\/\/127\.0\.0\.1:\d+\/)/.exec(run.output())
    await until(
      () => found() !== null || run.child.exitCode !== null,
      () => run.output(),
    )
    const page = found()?.[1]
    const link = /wishem: link at (ws:\/\/127\.0\.0\.1:\d+\/link)/.exec(run.output())?.[1]
    if (page === undefined || link === undefined) {
      expect.fail(`the script stopped with no address:\n${run.output()}`)
    }
    return { run, page, link }
  }

  beforeEach(() => {
    vite.createServer.mockReset()
    vite.createServer.mockRejectedValue(new Error('plugin failed'))
    hostModule.startConstruct.mockClear()
    folder = mkdtempSync(join(tmpdir(), 'workbench-start-'))
    model = join(folder, 'model')
    cpSync(baseModel, model, { recursive: true })
    views = join(folder, 'views')
    mkdirSync(views)
    cpSync(appBarSidecar, join(views, 'AppBar.view.json'))
  })

  afterEach(async () => {
    for (const child of children.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) {
        const closed = new Promise((resolve) => child.once('close', resolve))
        child.kill('SIGKILL')
        await closed
      }
    }
    await Promise.all(blockers.splice(0).map((blocker) => new Promise((resolve) => blocker.close(resolve))))
    rmSync(folder, { recursive: true, force: true })
  })

  it('prints the model folder, the address of the link, and the address of the page', { timeout: 30000 }, async () => {
    const { run } = await startReady()

    expect(run.output()).toMatch(
      new RegExp(
        `^wishem: model ${model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\nwishem: link at ws://127\\.0\\.0\\.1:\\d+/link\\nwishem: workbench at http://127\\.0\\.0\\.1:\\d+/\\n`,
      ),
    )
  })

  it('resolves a relative --model against INIT_CWD', { timeout: 30000 }, async () => {
    const child = spawn('node', [script, '--model', './model', '--views', views, '--port', '0', '--hub-port', '0'], {
      env: { ...process.env, INIT_CWD: folder },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    children.push(child)
    let text = ''
    child.stdout.on('data', (chunk: Buffer) => (text += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (text += chunk.toString()))

    await until(
      () => text.includes('wishem: workbench at') || child.exitCode !== null,
      () => text,
    )

    expect(text).toContain(`wishem: model ${model}\n`)
    expect(text).toContain('wishem: workbench at')
  })

  it('serves the HTML page', { timeout: 30000 }, async () => {
    const { page } = await startReady()

    const response = await fetch(page)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toContain('<div id="root">')
  })

  it('serves a link through the address of the page, and an input changes state.json', { timeout: 30000 }, async () => {
    const { page } = await startReady()
    const { link, tester, reader } = await openTestLink(new URL('link', page.replace('http:', 'ws:')).href)

    try {
      expect(JSON.stringify(reader.read().store)).toContain('"Wishem"')
      const result = await tester.submit(
        storeInputs().setField({ entity: ENTITY, componentType: APP_BAR, field: TITLE, value: 'Through the page' }),
      )

      expect(result.ok).toBe(true)
      await vi.waitFor(() => {
        expect(readFileSync(join(model, 'state.json'), 'utf8')).toContain('Through the page')
      })
    } finally {
      link.close()
    }
  })

  it('sends an applied event after a change to state.json', { timeout: 30000 }, async () => {
    const { link: address } = await startReady()
    const { link, reader } = await openTestLink(address)

    try {
      const first = reader.read().store
      const file = join(model, 'state.json')
      writeFileSync(file, readFileSync(file, 'utf8').replace('"Wishem"', '"Changed"'))
      const started = Date.now()
      await vi.waitFor(() => {
        expect(JSON.stringify(reader.read().store)).toContain('"Changed"')
      })

      expect(reader.read().store).not.toBe(first)
      expect(Date.now() - started).toBeLessThan(2000)
    } finally {
      link.close()
    }
  })

  it('stops with exit code 0 on an interrupt and closes both addresses', { timeout: 30000 }, async () => {
    const { run, page, link } = await startReady()

    run.child.kill('SIGINT')

    expect(await run.exit).toBe(0)
    expect(await refuses('127.0.0.1', Number(new URL(page).port))).toBe(true)
    expect(await refuses('127.0.0.1', Number(new URL(link).port))).toBe(true)
  })

  it('stops with exit code 0 on a terminate signal', { timeout: 30000 }, async () => {
    const { run } = await startReady()

    run.child.kill('SIGTERM')

    expect(await run.exit).toBe(0)
  })

  it('names state.json and serves no page when the model is not valid JSON', { timeout: 30000 }, async () => {
    writeFileSync(join(model, 'state.json'), '{ not json')
    const run = start(['--port', '0', '--hub-port', '0'])

    expect(await run.exit).toBe(1)
    expect(run.output()).toContain('wishem: problem in state.json: the text is not valid JSON')
    expect(run.output()).toContain('wishem: the model is not correct, so the workbench did not start')
    expect(run.output()).not.toContain('workbench at')
  })

  it('names the port, frees the hub port, and fails when the page port is in use', { timeout: 30000 }, async () => {
    const blocker = createServer()
    blockers.push(blocker)
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
    const pagePort = (blocker.address() as { port: number }).port
    const hubPort = await freePort()

    const run = start(['--port', String(pagePort), '--hub-port', String(hubPort)])

    expect(await run.exit).toBe(1)
    expect(run.output()).toContain(`wishem: port ${pagePort} is in use`)
    expect(await refuses('127.0.0.1', hubPort)).toBe(true)
  })

  it('closes the construct when the page server cannot be created', { timeout: 30000 }, async () => {
    const hubPort = await freePort()

    await expect(
      startWorkbench({ model, views, viewTypes: false, port: 0, hubPort, log: () => undefined }),
    ).rejects.toThrow('plugin failed')

    expect(await refuses('127.0.0.1', hubPort)).toBe(true)
  })

  it('does not pass a path that only starts with /link to the construct', { timeout: 30000 }, async () => {
    const { page } = await startReady()

    const response = await fetch(new URL('linkx', page))

    expect(response.headers.get('content-type') ?? '').not.toContain('json')
    expect(await response.text()).not.toContain('No such path')
  })

  it(
    'reports the failure of the page and closes the construct when the page server also cannot close',
    { timeout: 30000 },
    async () => {
      const hubPort = await freePort()
      vite.createServer.mockResolvedValue({
        listen: () => Promise.reject(new Error('listen failed')),
        close: () => Promise.reject(new Error('close failed')),
      })

      await expect(
        startWorkbench({ model, views, viewTypes: false, port: 0, hubPort, log: () => undefined }),
      ).rejects.toThrow('listen failed')

      expect(await refuses('127.0.0.1', hubPort)).toBe(true)
    },
  )

  it('asks for port 5173 for the page and 4747 for the hub by default', { timeout: 30000 }, async () => {
    const constructClose = vi.fn(() => Promise.resolve())
    hostModule.startConstruct.mockResolvedValueOnce({
      url: 'http://127.0.0.1:4747',
      linkUrl: 'ws://127.0.0.1:4747/link',
      close: constructClose,
    })
    vite.createServer.mockResolvedValue({
      listen: () => Promise.resolve(),
      httpServer: { address: () => ({ port: 5173 }) },
      close: () => Promise.resolve(),
    })

    const workbench = await startWorkbench({ model, views, viewTypes: false, log: () => undefined })

    expect(hostModule.startConstruct).toHaveBeenCalledWith(expect.objectContaining({ port: 4747 }))
    expect(vite.createServer).toHaveBeenCalledWith(
      expect.objectContaining({ server: expect.objectContaining({ port: 5173 }) }),
    )
    await workbench.close()
  })

  it('names the port and fails when the hub port is in use', { timeout: 30000 }, async () => {
    const blocker = createServer()
    blockers.push(blocker)
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
    const hubPort = (blocker.address() as { port: number }).port

    const run = start(['--port', '0', '--hub-port', String(hubPort)])

    expect(await run.exit).toBe(1)
    expect(run.output()).toContain(`wishem: port ${hubPort} is in use`)
    expect(run.output()).not.toContain('workbench at')
  })

  const external = Object.values(networkInterfaces())
    .flat()
    .find((address) => address?.family === 'IPv4' && !address.internal)

  it.skipIf(external === undefined)('listens on the loopback address only', { timeout: 30000 }, async () => {
    const { page } = await startReady()

    expect(await refuses(external?.address ?? '', Number(new URL(page).port))).toBe(true)
  })

  it(
    'closes the page server and the construct, and names the port, when the page cannot listen',
    { timeout: 30000 },
    async () => {
      const hubPort = await freePort()
      const close = vi.fn(() => Promise.resolve())
      vite.createServer.mockResolvedValue({
        listen: () => Promise.reject(Object.assign(new Error('listen failed'), { code: 'EADDRINUSE' })),
        close,
      })
      const lines: string[] = []

      await expect(
        startWorkbench({ model, views, viewTypes: false, port: 4321, hubPort, log: (line) => lines.push(line) }),
      ).rejects.toBeInstanceOf(StartError)

      expect(lines).toContain('wishem: port 4321 is in use')
      expect(close).toHaveBeenCalledTimes(1)
      expect(await refuses('127.0.0.1', hubPort)).toBe(true)
    },
  )

  it('sends each line to the log option, and stops both parts on close', { timeout: 30000 }, async () => {
    const hubPort = await freePort()
    const close = vi.fn(() => Promise.resolve())
    vite.createServer.mockResolvedValue({
      listen: () => Promise.resolve(),
      httpServer: { address: () => ({ port: 5555 }) },
      close,
    })
    const lines: string[] = []

    const workbench = await startWorkbench({
      model,
      views,
      viewTypes: false,
      port: 0,
      hubPort,
      log: (line) => lines.push(line),
    })

    expect(workbench.pageUrl).toBe('http://127.0.0.1:5555/')
    expect(workbench.linkUrl).toBe(`ws://127.0.0.1:${String(hubPort)}/link`)
    expect(lines.slice(0, 3)).toEqual([
      `wishem: model ${model}`,
      `wishem: link at ${workbench.linkUrl}`,
      `wishem: workbench at ${workbench.pageUrl}`,
    ])

    writeFileSync(join(model, 'state.json'), '{ not json')
    await vi.waitFor(() => {
      expect(lines).toContain('wishem: the last correct model stays')
    })

    await workbench.close()

    expect(close).toHaveBeenCalledTimes(1)
    expect(await refuses('127.0.0.1', hubPort)).toBe(true)
  })

  it.each([
    ['--port', ['--port', '65536']],
    ['--port', ['--port', '1.5']],
    ['--port', ['--port=-1']],
    ['--port', ['--port', 'abc']],
    ['--hub-port', ['--hub-port', '65536']],
  ])('prints that %s must be a port number and stops with exit code 1', { timeout: 30000 }, async (name, args) => {
    const run = start(args)

    expect(await run.exit).toBe(1)
    expect(run.output()).toBe(`wishem: ${name} must be a number from 0 to 65535\n`)
  })

  it('prints the reason only one time when the model is not correct', { timeout: 30000 }, async () => {
    writeFileSync(join(model, 'state.json'), '{ not json')
    const run = start(['--port', '0', '--hub-port', '0'])

    await run.exit

    expect(run.output().match(/wishem: the model is not correct/g)).toHaveLength(1)
  })

  describe('the generated files of the views', () => {
    const generated = () => join(views, 'AppBar.view.gen.ts')
    const readGenerated = () => (existsSync(generated()) ? readFileSync(generated(), 'utf8') : '')
    const definition = () => join(model, 'definitions', `${APP_BAR}.json`)
    const setLabel = (label: string) => {
      writeFileSync(
        definition(),
        readFileSync(definition(), 'utf8').replace(/"label": "(?:title|heading)"/, `"label": "${label}"`),
      )
    }
    const generatedLines = (run: Run) =>
      run
        .output()
        .split('\n')
        .filter((line) => line.includes('.view.gen.ts'))
    const waitFor = (check: () => boolean, run: Run) => until(check, () => run.output(), 20000)

    /** Changes a label, adds a sidecar, and waits until the hub holds the new definition. */
    const expectNoWrites = async (link: string) => {
      expect(existsSync(generated())).toBe(false)
      writeFileSync(generated(), 'stale\n')
      setLabel('heading')
      writeFileSync(join(views, 'Header.view.json'), JSON.stringify({ kind: 'react', componentType: APP_BAR }))
      await vi.waitFor(async () => {
        expect(await readStore(link)).toContain('"heading"')
      })
      // The sidecar has no event to wait for. A short wait gives a wrong write time to happen.
      await new Promise((resolve) => setTimeout(resolve, 300))

      expect(readGenerated()).toBe('stale\n')
      expect(existsSync(join(views, 'Header.view.gen.ts'))).toBe(false)
    }

    it('writes the generated file when the script starts', { timeout: 30000 }, async () => {
      const { run } = await startReady()

      await waitFor(() => readGenerated().includes('readonly title: string | undefined'), run)

      await waitFor(() => run.output().includes('wishem: wrote AppBar.view.gen.ts: added title'), run)
    })

    it(
      'writes the new member in less than 2 seconds and prints one line after a label changes',
      { timeout: 30000 },
      async () => {
        const { run } = await startReady()
        await waitFor(() => readGenerated().includes('readonly title'), run)

        const started = Date.now()
        setLabel('heading')
        await waitFor(() => readGenerated().includes('readonly heading'), run)

        expect(Date.now() - started).toBeLessThan(2000)
        expect(readGenerated()).not.toContain('readonly title')
        await waitFor(
          () => run.output().includes('wishem: changed AppBar.view.gen.ts: added heading, removed title\n'),
          run,
        )
        expect(generatedLines(run).filter((line) => line.includes('changed'))).toHaveLength(1)
      },
    )

    it('changes no generated file and prints no line after a change to state.json', { timeout: 30000 }, async () => {
      const { run, link } = await startReady()
      await waitFor(() => readGenerated().includes('readonly title'), run)
      const stale = `${readGenerated()}// stale\n`
      writeFileSync(generated(), stale)

      const file = join(model, 'state.json')
      writeFileSync(file, readFileSync(file, 'utf8').replace('"Wishem"', '"Changed"'))
      await waitFor(() => run.output().includes('wishem: link at'), run)
      await vi.waitFor(async () => {
        expect(await readStore(link)).toContain('"Changed"')
      })
      // A later change to a label proves that the earlier change ran no generator.
      setLabel('heading')
      await waitFor(() => readGenerated().includes('readonly heading'), run)
      await waitFor(() => run.output().includes('added heading'), run)

      expect(generatedLines(run).filter((line) => line.includes('changed'))).toEqual([
        'wishem: changed AppBar.view.gen.ts: added heading, removed title',
      ])
    })

    it('writes the generated file of a new sidecar', { timeout: 30000 }, async () => {
      const { run } = await startReady()
      await waitFor(() => existsSync(generated()), run)

      writeFileSync(join(views, 'Header.view.json'), JSON.stringify({ kind: 'react', componentType: APP_BAR }))

      await waitFor(() => existsSync(join(views, 'Header.view.gen.ts')), run)
      await waitFor(() => run.output().includes('wishem: wrote Header.view.gen.ts: added title'), run)
    })

    it(
      'prints the error and continues to serve the page when two labels give one name',
      { timeout: 30000 },
      async () => {
        const { run, page } = await startReady()
        await waitFor(() => readGenerated().includes('readonly title'), run)

        const text = JSON.parse(readFileSync(definition(), 'utf8')) as { fields: object[] }
        text.fields.push({ id: 'fld_0c44a1d2-6e3b-4f70-9a18-2b5d7c9e1f03', label: 'Title', type: 'string' })
        writeFileSync(definition(), JSON.stringify(text))

        await waitFor(() => run.output().includes('wishem: error: AppBar.view.json:'), run)
        expect(run.output()).toContain('give the same name "title"')
        expect(readGenerated()).toContain('readonly title')
        expect((await fetch(page)).status).toBe(200)
        expect(run.child.exitCode).toBeNull()
      },
    )

    /** Starts the workbench in this process and gives its hub. */
    const startInProcess = async () => {
      const actual = await vi.importActual<typeof import('vite')>('vite')
      vite.createServer.mockImplementation(actual.createServer)
      const startActual = hostModule.startConstruct.getMockImplementation()
      let hub: Hub | undefined
      hostModule.startConstruct.mockImplementationOnce(async (options: unknown) => {
        const construct = (await startActual?.(options)) as Awaited<ReturnType<typeof startConstruct>>
        hub = construct.hub
        return construct
      })
      const workbench = await startWorkbench({ model, views, port: 0, hubPort: 0, log: () => undefined })
      if (hub === undefined) {
        throw new Error('no hub')
      }
      return { workbench, hub }
    }

    it('does not turn the definitions into text for an input that does not change the store', async () => {
      const { workbench, hub } = await startInProcess()
      const port = hub.attach({ id: 'tester', kind: 'input' })
      const spy = vi.spyOn(JSON, 'stringify')
      try {
        await vi.waitFor(() => {
          expect(readGenerated()).toContain('readonly title')
        })
        const before = hub.read().store as { definitions: unknown }

        const result = await port.submit(
          storeInputs().setField({ entity: ENTITY, componentType: APP_BAR, field: TITLE, value: 'Wishem' }),
        )

        expect(result.ok).toBe(true)
        expect(hub.read().store).toBe(before)
        expect(spy.mock.calls.filter(([value]) => value === before.definitions)).toHaveLength(0)
      } finally {
        spy.mockRestore()
        await workbench.close()
      }
    })

    it('writes the member title again after a rewind to the point before a change of the label', async () => {
      const { workbench, hub } = await startInProcess()
      const port = hub.attach({ id: 'tester', kind: 'input' })
      try {
        await vi.waitFor(() => {
          expect(readGenerated()).toContain('readonly title')
        })
        const before = hub.record().at(-1)?.seq ?? 0
        setLabel('heading')
        await vi.waitFor(() => {
          expect(readGenerated()).toContain('readonly heading')
        })

        expect((await port.submit(hubInputs.rewind(before))).ok).toBe(true)

        await vi.waitFor(() => {
          expect(readGenerated()).toContain('readonly title')
        })
        expect(readGenerated()).not.toContain('readonly heading')
      } finally {
        await workbench.close()
      }
    })

    it('writes and changes no generated file with --no-view-types', { timeout: 30000 }, async () => {
      const run = start(['--port', '0', '--hub-port', '0', '--no-view-types'])
      await waitFor(() => run.output().includes('wishem: workbench at'), run)
      const link = /wishem: link at (ws:\/\/127\.0\.0\.1:\d+\/link)/.exec(run.output())?.[1] ?? ''

      await expectNoWrites(link)

      expect(generatedLines(run)).toEqual([])
    })

    it('writes and changes no generated file with viewTypes false', { timeout: 30000 }, async () => {
      const actual = await vi.importActual<typeof import('vite')>('vite')
      vite.createServer.mockImplementation(actual.createServer)
      const workbench = await startWorkbench({
        model,
        views,
        viewTypes: false,
        port: 0,
        hubPort: 0,
        log: () => undefined,
      })
      try {
        await expectNoWrites(workbench.linkUrl)
      } finally {
        await workbench.close()
      }
    })
  })

  it('attaches the keeper of the view types as an output subsystem and closes its port on stop', async () => {
    const actual = await vi.importActual<typeof import('vite')>('vite')
    vite.createServer.mockImplementation(actual.createServer)
    const startActual = hostModule.startConstruct.getMockImplementation()
    const attached: string[] = []
    const closed: string[] = []
    hostModule.startConstruct.mockImplementationOnce(async (options: unknown) => {
      const construct = (await startActual?.(options)) as Awaited<ReturnType<typeof startConstruct>>
      const attach = construct.hub.attach.bind(construct.hub)
      construct.hub.attach = (subsystem) => {
        attached.push(`${subsystem.id}:${subsystem.kind}`)
        const port = attach(subsystem)
        const close = port.close.bind(port)
        port.close = () => {
          closed.push(subsystem.id)
          close()
        }
        return port
      }
      return construct
    })
    const workbench = await startWorkbench({ model, views, port: 0, hubPort: 0, log: () => undefined })

    expect(attached).toEqual(['view-types:output'])
    await workbench.close()

    expect(closed).toEqual(['view-types'])
  })

  it('has a start script that names an existing file', () => {
    const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }

    expect(manifest.scripts.start).toBe('node scripts/start.ts')
    expect(existsSync(script)).toBe(true)
  })

  it('starts nothing when another module imports the script', { timeout: 30000 }, () => {
    const result = spawnSync('node', ['--input-type=module', '-e', 'await import(process.env.START_SCRIPT)'], {
      env: { ...process.env, START_SCRIPT: script },
      encoding: 'utf8',
      timeout: 20000,
    })

    expect(result.status).toBe(0)
    expect(result.stdout + result.stderr).toBe('')
  })
})
