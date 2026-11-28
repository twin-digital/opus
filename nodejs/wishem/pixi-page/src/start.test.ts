// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process'
import { request } from 'node:http'
import { connect, createServer, type Server } from 'node:net'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import { startPixi, StartError } from '../scripts/start.js'
import type { PixiStart } from '../scripts/start.js'
import { startSampleConstruct } from '../tests/sample-construct.js'
import type { ProductConstruct } from '@thrashplay/wishem-construct-manager/node'

const vite = vi.hoisted(() => ({ createServer: vi.fn() }))

vi.mock('vite', async (importActual) => {
  const actual = await importActual<typeof import('vite')>()
  vite.createServer.mockImplementation(actual.createServer)
  return { ...actual, createServer: vite.createServer }
})

const script = join(import.meta.dirname, '..', 'scripts', 'start.ts')

/** Opens a link at the address with one output subsystem. */
/** The WebSocket of Node.js, whose second argument can set headers. */
const NodeWebSocket = WebSocket as unknown as new (
  address: string,
  options?: { headers: Record<string, string> },
) => WebSocket

let counter = 0
const openOutput = async (address: string, origin?: string) => {
  counter += 1
  const id = `tester-${String(counter)}`
  const socket = new NodeWebSocket(address, origin === undefined ? undefined : { headers: { Origin: origin } })
  const link = await openLink(await webSocketChannel(socket), [{ id, kind: 'output' }])
  return { link, port: link.ports[id] }
}

/** The status code of a request for a link upgrade with the given `Origin`. */
const upgradeStatus = (url: string, origin: string) =>
  new Promise<number>((resolve, reject) => {
    const req = request(url, {
      headers: {
        Origin: origin,
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
      },
    })
    req.once('response', (response) => {
      response.resume()
      resolve(response.statusCode ?? 0)
    })
    req.once('upgrade', (response, socket) => {
      socket.destroy()
      resolve(response.statusCode ?? 0)
    })
    req.once('error', reject)
    req.end()
  })

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

const portOf = (address: string) => Number(new URL(address).port)

describe('startPixi', () => {
  const starts: PixiStart[] = []
  const constructs: ProductConstruct[] = []
  const blockers: Server[] = []

  afterEach(async () => {
    await Promise.all(starts.splice(0).map((started) => started.close()))
    await Promise.all(constructs.splice(0).map((construct) => construct.close()))
    await Promise.all(blockers.splice(0).map((blocker) => new Promise((resolve) => blocker.close(resolve))))
    vite.createServer.mockClear()
  })

  const beginConstruct = async () => {
    const construct = await startSampleConstruct({ paused: true })
    constructs.push(construct)
    return construct
  }

  const begin = async (hubPort: number) => {
    const lines: string[] = []
    const started = await startPixi({
      port: 0,
      hubPort,
      log: (line) => {
        lines.push(line)
      },
    })
    starts.push(started)
    return { started, lines }
  }

  const block = async () => {
    const blocker = createServer()
    blockers.push(blocker)
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
    return (blocker.address() as { port: number }).port
  }

  it('prints the address of the page and of the link of the construct', { timeout: 30000 }, async () => {
    const hubPort = await freePort()

    const { started, lines } = await begin(hubPort)

    expect(lines).toEqual([
      `wishem: PixiJS page at ${started.pageUrl}`,
      `wishem: the page connects to ws://127.0.0.1:${String(hubPort)}/link`,
    ])
    expect(started.linkUrl).toBe(`ws://127.0.0.1:${String(hubPort)}/link`)
    expect(started.pageUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
  })

  it('serves the HTML page at / with no construct running', { timeout: 30000 }, async () => {
    const { started } = await begin(await freePort())

    const response = await fetch(started.pageUrl)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    const html = await response.text()
    expect(html).toContain('<div id="screen">')
    expect(html).toContain('role="status"')
  })

  it('passes /link of the page address to the construct on the hub port', { timeout: 30000 }, async () => {
    const construct = await beginConstruct()
    const { started } = await begin(portOf(construct.linkUrl))
    const address = new URL('link', started.pageUrl.replace('http:', 'ws:')).href

    const { link, port } = await openOutput(address, new URL(started.pageUrl).origin)

    expect(Object.keys(port.read())).toEqual(expect.arrayContaining(['time', 'store']))
    link.close()
  })

  it('refuses the link of a different origin with status 403', { timeout: 30000 }, async () => {
    const construct = await beginConstruct()
    const { started } = await begin(portOf(construct.linkUrl))

    expect(await upgradeStatus(new URL('link', started.pageUrl).href, 'https://example.com')).toBe(403)
  })

  it('leaves the construct running after close, and frees the port of the page', { timeout: 30000 }, async () => {
    const construct = await beginConstruct()
    const { started } = await begin(portOf(construct.linkUrl))

    await started.close()

    expect(await refuses('127.0.0.1', portOf(started.pageUrl))).toBe(true)
    expect(await refuses('127.0.0.1', portOf(construct.linkUrl))).toBe(false)
    const { link } = await openOutput(construct.linkUrl)
    link.close()
  })

  it('gives the same promise from each call of close', { timeout: 30000 }, async () => {
    const { started } = await begin(await freePort())

    const first = started.close()
    const second = started.close()

    expect(second).toBe(first)
    await first
  })

  it('names the port and rejects when the page port is in use', { timeout: 30000 }, async () => {
    const pagePort = await block()
    const lines: string[] = []

    const failure = startPixi({ port: pagePort, hubPort: await freePort(), log: (line) => lines.push(line) })

    await expect(failure).rejects.toBeInstanceOf(StartError)
    expect(lines).toEqual([`wishem: port ${String(pagePort)} is in use`])
  })

  it('rejects when the page server cannot be created', { timeout: 30000 }, async () => {
    vite.createServer.mockRejectedValueOnce(new Error('plugin failed'))

    await expect(startPixi({ port: 0, hubPort: 4750, log: () => undefined })).rejects.toThrow('plugin failed')
  })

  it('rejects with the error of the listen when the page server cannot close', { timeout: 30000 }, async () => {
    vite.createServer.mockResolvedValueOnce({
      listen: () => Promise.reject(new Error('listen failed')),
      close: () => Promise.reject(new Error('close failed')),
    })

    await expect(startPixi({ port: 0, hubPort: 4750, log: () => undefined })).rejects.toThrow('listen failed')
  })
})

describe('the start script', () => {
  const children: ChildProcess[] = []
  const constructs: ProductConstruct[] = []

  afterEach(async () => {
    for (const child of children.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) {
        const closed = new Promise((resolve) => child.once('close', resolve))
        child.kill('SIGKILL')
        await closed
      }
    }
    await Promise.all(constructs.splice(0).map((construct) => construct.close()))
  })

  const run = (args: string[]) => {
    const child = spawn('node', [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    children.push(child)
    let text = ''
    child.stdout.on('data', (chunk: Buffer) => (text += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (text += chunk.toString()))
    const exit = new Promise<number | null>((resolve) => child.once('close', resolve))
    return { child, output: () => text, exit }
  }

  const ready = async (args: string[]) => {
    const started = run(['--port', '0', ...args])
    const page = () => /wishem: PixiJS page at (http:\/\/127\.0\.0\.1:\d+\/)/.exec(started.output())?.[1]
    await until(
      () => page() !== undefined || started.child.exitCode !== null,
      () => started.output(),
    )
    const pageUrl = page()
    if (pageUrl === undefined) {
      expect.fail(`the script stopped with no address:\n${started.output()}`)
    }
    return { started, pageUrl }
  }

  it('prints the address of the page and of the link, with the default hub port 4750', { timeout: 30000 }, async () => {
    const { started } = await ready([])

    expect(started.output()).toMatch(
      /^wishem: PixiJS page at http:\/\/127\.0\.0\.1:\d+\/\nwishem: the page connects to ws:\/\/127\.0\.0\.1:4750\/link\n/,
    )
  })

  it('names the hub port of the option', { timeout: 30000 }, async () => {
    const { started } = await ready(['--hub-port', '4751'])

    expect(started.output()).toContain('wishem: the page connects to ws://127.0.0.1:4751/link\n')
  })

  it('refuses the option --paused with exit code 1', { timeout: 30000 }, async () => {
    const started = run(['--port', '0', '--paused'])

    expect(await started.exit).toBe(1)
    expect(started.output()).toContain('--paused')
    expect(started.output()).not.toContain('PixiJS page at')
  })

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'stops with exit code 0 on %s, frees the page port, and leaves the construct running',
    { timeout: 30000 },
    async (signal) => {
      const construct = await startSampleConstruct({ paused: true })
      constructs.push(construct)
      const { started, pageUrl } = await ready(['--hub-port', String(portOf(construct.linkUrl))])
      const { link: proxied } = await openOutput(new URL('link', pageUrl.replace('http:', 'ws:')).href)

      started.child.kill(signal)

      expect(await started.exit).toBe(0)
      await proxied.closed
      expect(await refuses('127.0.0.1', portOf(pageUrl))).toBe(true)
      const { link } = await openOutput(construct.linkUrl)
      link.close()
    },
  )

  it('names the port and ends with exit code 1 when the page port is in use', { timeout: 30000 }, async () => {
    const blocker = createServer()
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
    const pagePort = (blocker.address() as { port: number }).port
    try {
      const started = run(['--port', String(pagePort)])

      expect(await started.exit).toBe(1)
      expect(started.output()).toContain(`wishem: port ${String(pagePort)} is in use`)
      expect(started.output()).not.toContain('PixiJS page at')
    } finally {
      await new Promise((resolve) => blocker.close(resolve))
    }
  })

  it('names a port that is not valid and ends with exit code 1', { timeout: 30000 }, async () => {
    const started = run(['--port', 'abc'])

    expect(await started.exit).toBe(1)
    expect(started.output()).toContain('wishem: --port must be a number from 0 to 65535')
  })
})
