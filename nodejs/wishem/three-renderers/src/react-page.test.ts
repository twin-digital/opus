// @vitest-environment node
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { connect, createServer } from 'node:net'
import type { Server } from 'node:net'
import { join } from 'node:path'
import { TIME_ID } from '@thrashplay/wishem-clock'
import type { TimePart } from '@thrashplay/wishem-clock'
import { openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startReactPage, StartError } from '../scripts/react-page.js'
import type { ReactPageStart } from '../scripts/react-page.js'
import { startSampleConstruct } from './sample-construct.js'
import type { SampleConstruct } from './sample-construct.js'

const script = join(import.meta.dirname, '..', 'scripts', 'react-page.ts')

/** The WebSocket of Node.js, whose second argument can set headers. */
const NodeWebSocket = WebSocket as unknown as new (
  address: string,
  options?: { headers: Record<string, string> },
) => WebSocket

const until = async (check: () => boolean, describeState: () => string, ms = 20000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error(`timeout: ${describeState()}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

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

/** Opens a link with one output subsystem on the address of the page server. */
const openOutput = async (pageUrl: string) => {
  const address = new URL('link', pageUrl.replace('http:', 'ws:')).href
  const socket = new NodeWebSocket(address, { headers: { Origin: new URL(pageUrl).origin } })
  const link = await openLink(await webSocketChannel(socket), [{ id: 'tester', kind: 'output' }])
  return { link, port: link.ports.tester }
}

describe('startReactPage', () => {
  const starts: ReactPageStart[] = []
  const constructs: SampleConstruct[] = []
  const blockers: Server[] = []

  afterEach(async () => {
    await Promise.all(starts.splice(0).map((started) => started.close()))
    await Promise.all(constructs.splice(0).map((construct) => construct.close()))
    await Promise.all(blockers.splice(0).map((blocker) => new Promise((resolve) => blocker.close(resolve))))
  })

  const construct = async () => {
    const started = await startSampleConstruct({ port: 0, paused: true })
    constructs.push(started)
    return started
  }

  const begin = async (hubPort: number) => {
    const lines: string[] = []
    const started = await startReactPage({
      port: 0,
      hubPort,
      log: (line) => {
        lines.push(line)
      },
    })
    starts.push(started)
    return { started, lines }
  }

  it('prints the address of the page and of the link that the page connects to', { timeout: 30000 }, async () => {
    const hubPort = await freePort()

    const { started, lines } = await begin(hubPort)

    expect(started.pageUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
    expect(started.linkUrl).toBe(`ws://127.0.0.1:${String(hubPort)}/link`)
    expect(lines).toEqual([
      `wishem: React page at ${started.pageUrl}`,
      `wishem: the page connects to ws://127.0.0.1:${String(hubPort)}/link`,
    ])
  })

  it('serves the HTML page at / when no construct runs', { timeout: 30000 }, async () => {
    const { started } = await begin(await freePort())

    const response = await fetch(started.pageUrl)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    const html = await response.text()
    expect(html).toContain('<div id="root">')
    expect(html).toContain('/src/main.tsx')
  })

  it('passes /link to the sample construct on the hub port', { timeout: 30000 }, async () => {
    const sample = await construct()
    const { started } = await begin(portOf(sample.linkUrl))

    const { link, port } = await openOutput(started.pageUrl)

    expect((port.read()[TIME_ID] as TimePart).running).toBe(false)
    expect(Object.keys(port.read())).toEqual(expect.arrayContaining(['time', 'store']))
    link.close()
  })

  /** Opens a WebSocket to /link of the page and waits until it ends. */
  const openThroughPage = (started: ReactPageStart) =>
    new Promise<void>((resolve) => {
      const socket = new NodeWebSocket(new URL('link', started.pageUrl.replace('http:', 'ws:')).href, {
        headers: { Origin: new URL(started.pageUrl).origin },
      })
      socket.addEventListener('close', () => {
        resolve()
      })
      socket.addEventListener('error', () => undefined)
    })

  it('prints one short line, and no Vite trace, when no construct answers the link', { timeout: 30000 }, async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const hubPort = await freePort()
      const { started, lines } = await begin(hubPort)
      const line = `wishem: no construct at ws://127.0.0.1:${String(hubPort)}/link; the page connects again`

      await openThroughPage(started)
      await openThroughPage(started)

      expect(lines.filter((text) => text.includes('no construct'))).toEqual([line])
      expect(errors.mock.calls.flat().join('\n')).not.toContain('ws proxy')
    } finally {
      errors.mockRestore()
    }
  })

  it(
    'answers a plain HTTP request to /link with status 502 when no construct answers',
    { timeout: 30000 },
    async () => {
      const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      try {
        const { started } = await begin(await freePort())

        const response = await fetch(new URL('link', started.pageUrl))

        expect(response.status).toBe(502)
        expect(await response.text()).toContain('wishem: no construct at')
        expect(errors.mock.calls.flat().join('\n')).not.toContain('proxy error')
      } finally {
        errors.mockRestore()
      }
    },
  )

  it('prints nothing when the page resets an open link', { timeout: 30000 }, async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const sample = await construct()
      const { started, lines } = await begin(portOf(sample.linkUrl))

      await new Promise<void>((resolve, reject) => {
        const socket = connect(portOf(started.pageUrl), '127.0.0.1')
        socket.once('error', reject)
        socket.once('connect', () => {
          socket.write(
            [
              'GET /link HTTP/1.1',
              `Host: 127.0.0.1:${String(portOf(started.pageUrl))}`,
              `Origin: ${new URL(started.pageUrl).origin}`,
              'Connection: Upgrade',
              'Upgrade: websocket',
              'Sec-WebSocket-Version: 13',
              'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
              '',
              '',
            ].join('\r\n'),
          )
        })
        socket.once('data', () => {
          socket.resetAndDestroy()
          resolve()
        })
      })
      await new Promise((resolve) => setTimeout(resolve, 500))

      expect(lines.filter((text) => text.includes('closed'))).toEqual([])
      expect(errors.mock.calls.flat().join('\n')).not.toContain('ws proxy')
    } finally {
      errors.mockRestore()
    }
  })

  it('leaves the construct running when the page server closes', { timeout: 30000 }, async () => {
    const sample = await construct()
    const { started } = await begin(portOf(sample.linkUrl))

    await started.close()

    expect(await refuses('127.0.0.1', portOf(started.pageUrl))).toBe(true)
    expect(await refuses('127.0.0.1', portOf(sample.linkUrl))).toBe(false)
  })

  it('gives the same promise from each call of close', { timeout: 30000 }, async () => {
    const { started } = await begin(await freePort())

    const first = started.close()
    const second = started.close()

    expect(second).toBe(first)
    await first
  })

  it('names the port and rejects when the page port is in use', { timeout: 30000 }, async () => {
    const blocker = createServer()
    blockers.push(blocker)
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
    const port = (blocker.address() as { port: number }).port
    const lines: string[] = []

    const failure = startReactPage({ port, hubPort: 0, log: (line) => lines.push(line) })

    await expect(failure).rejects.toBeInstanceOf(StartError)
    expect(lines).toEqual([`wishem: port ${String(port)} is in use`])
  })
})

describe('the react-page command', () => {
  const children: ChildProcess[] = []
  const constructs: SampleConstruct[] = []

  afterEach(async () => {
    for (const child of children.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) {
        const closed = new Promise((resolve) => child.once('close', resolve))
        child.kill('SIGKILL')
        await closed
      }
    }
    await Promise.all(constructs.splice(0).map((started) => started.close()))
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
    const page = () => /wishem: React page at (http:\/\/127\.0\.0\.1:\d+\/)/.exec(started.output())?.[1]
    await until(
      () => started.output().includes('the page connects to') || started.child.exitCode !== null,
      () => started.output(),
    )
    const pageUrl = page()
    if (pageUrl === undefined) {
      expect.fail(`the command stopped with no address:\n${started.output()}`)
    }
    return { started, pageUrl }
  }

  it('prints the two lines with the default hub port', { timeout: 30000 }, async () => {
    const { started, pageUrl } = await ready([])

    expect(started.output()).toBe(
      `wishem: React page at ${pageUrl}\nwishem: the page connects to ws://127.0.0.1:4750/link\n`,
    )
  })

  it('takes the hub port from --hub-port', { timeout: 30000 }, async () => {
    const { started } = await ready(['--hub-port', '4999'])

    expect(started.output()).toContain('wishem: the page connects to ws://127.0.0.1:4999/link')
  })

  it('names the port and ends with exit code 1 when the page port is in use', { timeout: 30000 }, async () => {
    const blocker = createServer()
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
    const port = (blocker.address() as { port: number }).port
    try {
      const started = run(['--port', String(port)])

      expect(await started.exit).toBe(1)
      expect(started.output()).toContain(`wishem: port ${String(port)} is in use`)
      expect(started.output()).not.toContain('React page at')
    } finally {
      await new Promise((resolve) => blocker.close(resolve))
    }
  })

  it('names a port that is not valid and ends with exit code 1', { timeout: 30000 }, async () => {
    const started = run(['--port', 'abc'])

    expect(await started.exit).toBe(1)
    expect(started.output()).toContain('wishem: --port must be a number from 0 to 65535')
  })

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'ends with exit code 0 on %s, frees the page port, and leaves the construct running',
    { timeout: 30000 },
    async (signal) => {
      const sample = await startSampleConstruct({ port: 0, paused: true })
      constructs.push(sample)
      const { started, pageUrl } = await ready(['--hub-port', String(portOf(sample.linkUrl))])
      const { link } = await openOutput(pageUrl)

      started.child.kill(signal)

      expect(await started.exit).toBe(0)
      await link.closed
      expect(await refuses('127.0.0.1', portOf(pageUrl))).toBe(true)
      expect(await refuses('127.0.0.1', portOf(sample.linkUrl))).toBe(false)
    },
  )
})
