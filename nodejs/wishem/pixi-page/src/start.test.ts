// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process'
import { request } from 'node:http'
import { connect, createServer, type Server } from 'node:net'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TimePart } from '@thrashplay/wishem-clock'
import { openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import type { HubEvent } from '@thrashplay/wishem-hub'
import { startPixi, StartError } from '../scripts/start.js'
import type { PixiStart } from '../scripts/start.js'

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
  const blockers: Server[] = []

  afterEach(async () => {
    await Promise.all(starts.splice(0).map((started) => started.close()))
    await Promise.all(blockers.splice(0).map((blocker) => new Promise((resolve) => blocker.close(resolve))))
    vite.createServer.mockClear()
  })

  const begin = async (options: { paused?: boolean } = {}) => {
    const lines: string[] = []
    const started = await startPixi({
      port: 0,
      hubPort: 0,
      ...options,
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

  it('prints the address of the link and of the page', { timeout: 30000 }, async () => {
    const { started, lines } = await begin()

    expect(lines).toEqual([`wishem: link at ${started.linkUrl}`, `wishem: PixiJS page at ${started.pageUrl}`])
    expect(started.linkUrl).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/link$/)
    expect(started.pageUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
  })

  it('serves the HTML page at /', { timeout: 30000 }, async () => {
    const { started } = await begin()

    const response = await fetch(started.pageUrl)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    const html = await response.text()
    expect(html).toContain('<div id="screen">')
    expect(html).toContain('role="status"')
  })

  it('serves the link at /link of the page address for the page origin', { timeout: 30000 }, async () => {
    const { started } = await begin()
    const address = new URL('link', started.pageUrl.replace('http:', 'ws:')).href

    const { link, port } = await openOutput(address, new URL(started.pageUrl).origin)

    expect(Object.keys(port.read())).toEqual(expect.arrayContaining(['time', 'store']))
    link.close()
  })

  it('refuses the link of a different origin with status 403', { timeout: 30000 }, async () => {
    const { started } = await begin()

    expect(await upgradeStatus(new URL('link', started.pageUrl).href, 'https://example.com')).toBe(403)
  })

  it('starts the time while running by default', { timeout: 30000 }, async () => {
    const { started, lines } = await begin()
    const { link, port } = await openOutput(started.linkUrl)

    expect((port.read().time as TimePart).running).toBe(true)
    expect(lines.join('\n')).not.toContain('starts paused')
    link.close()
  })

  it('starts the time paused with the option, and says so first', { timeout: 30000 }, async () => {
    const { started, lines } = await begin({ paused: true })
    const { link, port } = await openOutput(started.linkUrl)
    await new Promise((resolve) => setTimeout(resolve, 1200))

    expect(lines[0]).toBe('wishem: the time of the construct starts paused')
    expect(port.read().time).toEqual({ now: 0, ticks: 0, running: false })
    link.close()
  })

  it('sends stopping to an open link and frees both ports on close', { timeout: 30000 }, async () => {
    const { started } = await begin()
    const { link, port } = await openOutput(started.linkUrl)
    const { link: proxied, port: proxiedPort } = await openOutput(
      new URL('link', started.pageUrl.replace('http:', 'ws:')).href,
    )
    const events: HubEvent[] = []
    const proxiedEvents: HubEvent[] = []
    port.subscribe((event) => {
      events.push(event)
    })
    proxiedPort.subscribe((event) => {
      proxiedEvents.push(event)
    })

    await started.close()

    await until(
      () => events.some((event) => event.type === 'stopping'),
      () => JSON.stringify(events),
    )
    await until(
      () => proxiedEvents.some((event) => event.type === 'stopping'),
      () => JSON.stringify(proxiedEvents),
    )
    await link.closed
    await proxied.closed
    expect(await refuses('127.0.0.1', portOf(started.pageUrl))).toBe(true)
    expect(await refuses('127.0.0.1', portOf(started.linkUrl))).toBe(true)
  })

  it('gives the same promise from each call of close', { timeout: 30000 }, async () => {
    const { started } = await begin()

    const first = started.close()
    const second = started.close()

    expect(second).toBe(first)
    await first
  })

  it('names the port, creates no page server, and rejects when the hub port is in use', async () => {
    const hubPort = await block()
    const lines: string[] = []

    const failure = startPixi({ port: 0, hubPort, log: (line) => lines.push(line) })

    await expect(failure).rejects.toBeInstanceOf(StartError)
    expect(lines).toEqual([`wishem: port ${String(hubPort)} is in use`])
    expect(vite.createServer).not.toHaveBeenCalled()
  })

  it('names the port and closes the construct when the page port is in use', { timeout: 30000 }, async () => {
    const pagePort = await block()
    const hubPort = await freePort()
    const lines: string[] = []

    const failure = startPixi({ port: pagePort, hubPort, log: (line) => lines.push(line) })

    await expect(failure).rejects.toBeInstanceOf(StartError)
    expect(lines).toEqual([`wishem: port ${String(pagePort)} is in use`])
    expect(await refuses('127.0.0.1', hubPort)).toBe(true)
  })

  it('closes the construct when the page server cannot be created', { timeout: 30000 }, async () => {
    const hubPort = await freePort()
    vite.createServer.mockRejectedValueOnce(new Error('plugin failed'))

    await expect(startPixi({ port: 0, hubPort, log: () => undefined })).rejects.toThrow('plugin failed')

    expect(await refuses('127.0.0.1', hubPort)).toBe(true)
  })

  it('closes the construct when the page server fails and cannot close', { timeout: 30000 }, async () => {
    const hubPort = await freePort()
    vite.createServer.mockResolvedValueOnce({
      listen: () => Promise.reject(new Error('listen failed')),
      close: () => Promise.reject(new Error('close failed')),
    })

    await expect(startPixi({ port: 0, hubPort, log: () => undefined })).rejects.toThrow('listen failed')

    expect(await refuses('127.0.0.1', hubPort)).toBe(true)
  })
})

describe('the start script', () => {
  const children: ChildProcess[] = []

  afterEach(async () => {
    for (const child of children.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) {
        const closed = new Promise((resolve) => child.once('close', resolve))
        child.kill('SIGKILL')
        await closed
      }
    }
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
    const started = run(['--port', '0', '--hub-port', '0', ...args])
    const page = () => /wishem: PixiJS page at (http:\/\/127\.0\.0\.1:\d+\/)/.exec(started.output())?.[1]
    await until(
      () => page() !== undefined || started.child.exitCode !== null,
      () => started.output(),
    )
    const link = /wishem: link at (ws:\/\/127\.0\.0\.1:\d+\/link)/.exec(started.output())?.[1]
    const pageUrl = page()
    if (pageUrl === undefined || link === undefined) {
      expect.fail(`the script stopped with no address:\n${started.output()}`)
    }
    return { started, pageUrl, link }
  }

  it('prints the two addresses', { timeout: 30000 }, async () => {
    const { started } = await ready([])

    expect(started.output()).toMatch(
      /^wishem: link at ws:\/\/127\.0\.0\.1:\d+\/link\nwishem: PixiJS page at http:\/\/127\.0\.0\.1:\d+\/\n/,
    )
  })

  it('prints that the time starts paused with --paused', { timeout: 30000 }, async () => {
    const { started, link } = await ready(['--paused'])
    const { link: remote, port } = await openOutput(link)

    expect(started.output()).toMatch(/^wishem: the time of the construct starts paused\nwishem: link at /)
    expect((port.read().time as TimePart).running).toBe(false)
    remote.close()
  })

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'stops with exit code 0 on %s, sends stopping to an open link, and frees both ports',
    { timeout: 30000 },
    async (signal) => {
      const { started, pageUrl, link } = await ready([])
      const { link: remote, port } = await openOutput(link)
      const { link: proxied, port: proxiedPort } = await openOutput(
        new URL('link', pageUrl.replace('http:', 'ws:')).href,
      )
      const events: HubEvent[] = []
      const proxiedEvents: HubEvent[] = []
      port.subscribe((event) => {
        events.push(event)
      })
      proxiedPort.subscribe((event) => {
        proxiedEvents.push(event)
      })

      started.child.kill(signal)

      expect(await started.exit).toBe(0)
      expect(events.some((event) => event.type === 'stopping')).toBe(true)
      expect(proxiedEvents.some((event) => event.type === 'stopping')).toBe(true)
      await remote.closed
      await proxied.closed
      expect(await refuses('127.0.0.1', portOf(pageUrl))).toBe(true)
      expect(await refuses('127.0.0.1', portOf(link))).toBe(true)
    },
  )

  it('names the port and ends with exit code 1 when the hub port is in use', { timeout: 30000 }, async () => {
    const blocker = createServer()
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
    const hubPort = (blocker.address() as { port: number }).port
    try {
      const started = run(['--port', '0', '--hub-port', String(hubPort)])

      expect(await started.exit).toBe(1)
      expect(started.output()).toContain(`wishem: port ${String(hubPort)} is in use`)
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
