// @vitest-environment node
import { spawn, type ChildProcess } from 'node:child_process'
import { connect, createServer } from 'node:net'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { TimePart } from '@thrashplay/wishem-clock'
import { openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import type { HubEvent } from '@thrashplay/wishem-hub'

const script = join(import.meta.dirname, '..', 'scripts', 'start.ts')

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
    const started = run(['--port', '0', ...args])
    const link = () => /wishem: link at (ws:\/\/127\.0\.0\.1:\d+\/link)/.exec(started.output())?.[1]
    await until(
      () => link() !== undefined || started.child.exitCode !== null,
      () => started.output(),
    )
    const url = link()
    if (url === undefined) {
      expect.fail(`the script stopped with no address:\n${started.output()}`)
    }
    return { started, url }
  }

  const openOutput = async (url: string) => {
    const link = await openLink(await webSocketChannel(new WebSocket(url)), [{ id: 'tester', kind: 'output' }])
    return { link, port: link.ports.tester }
  }

  it('prints the address of the link', { timeout: 30000 }, async () => {
    const { started } = await ready([])

    expect(started.output()).toBe(
      `wishem: link at ${/ws:\/\/127\.0\.0\.1:\d+\/link/.exec(started.output())?.[0] ?? ''}\n`,
    )
  })

  it('starts the time paused with --paused, and says so first', { timeout: 30000 }, async () => {
    const { started, url } = await ready(['--paused'])
    const { link, port } = await openOutput(url)

    expect(started.output()).toMatch(/^wishem: the time of the construct starts paused\nwishem: link at /)
    expect((port.read().time as TimePart).running).toBe(false)
    link.close()
  })

  it('starts the time running by default', { timeout: 30000 }, async () => {
    const { url } = await ready([])
    const { link, port } = await openOutput(url)

    expect((port.read().time as TimePart).running).toBe(true)
    link.close()
  })

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'stops with exit code 0 on %s, sends stopping to an open link, and frees the port',
    { timeout: 30000 },
    async (signal) => {
      const { started, url } = await ready([])
      const { link, port } = await openOutput(url)
      const events: HubEvent[] = []
      port.subscribe((event) => {
        events.push(event)
      })

      started.child.kill(signal)

      expect(await started.exit).toBe(0)
      expect(events.some((event) => event.type === 'stopping')).toBe(true)
      await link.closed
      expect(await refuses('127.0.0.1', Number(new URL(url).port))).toBe(true)
    },
  )

  it('names the port and ends with exit code 1 when the port is in use', { timeout: 30000 }, async () => {
    const blocker = createServer()
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
    const port = (blocker.address() as { port: number }).port
    try {
      const started = run(['--port', String(port)])

      expect(await started.exit).toBe(1)
      expect(started.output()).toContain(`wishem: port ${String(port)} is in use`)
      expect(started.output()).not.toContain('link at')
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
