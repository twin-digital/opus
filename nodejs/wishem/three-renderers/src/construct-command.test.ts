// @vitest-environment node
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { TIME_ID } from '@thrashplay/wishem-clock'
import type { TimePart } from '@thrashplay/wishem-clock'
import { openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import type { HubEvent } from '@thrashplay/wishem-hub'
import { afterEach, describe, expect, it } from 'vitest'

const script = join(import.meta.dirname, '..', 'scripts', 'construct.ts')

const until = async (check: () => boolean, describeState: () => string, ms = 20000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error(`timeout: ${describeState()}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

describe('the construct command', () => {
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
    const started = run(['--hub-port', '0', ...args])
    const link = () => /wishem: link at (ws:\/\/127\.0\.0\.1:\d+\/link)/.exec(started.output())?.[1]
    await until(
      () => link() !== undefined || started.child.exitCode !== null,
      () => started.output(),
    )
    const url = link()
    if (url === undefined) {
      expect.fail(`the command stopped with no address:\n${started.output()}`)
    }
    return { started, url }
  }

  it('prints the address of the link', { timeout: 30000 }, async () => {
    const { started } = await ready([])

    expect(started.output()).toMatch(/^wishem: link at ws:\/\/127\.0\.0\.1:\d+\/link\n/)
  })

  it('prints that the time starts paused with --paused, and the time is paused', { timeout: 30000 }, async () => {
    const { started, url } = await ready(['--paused'])
    const link = await openLink(await webSocketChannel(new WebSocket(url)), [{ id: 'viewer', kind: 'output' }])

    expect(started.output()).toMatch(/^wishem: the time of the construct starts paused\nwishem: link at /)
    expect((link.ports.viewer.read()[TIME_ID] as TimePart).running).toBe(false)
    link.close()
  })

  it('names the port and ends with exit code 1 when the port is in use', { timeout: 30000 }, async () => {
    const blocker = createServer()
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve))
    const port = (blocker.address() as { port: number }).port
    try {
      const started = run(['--hub-port', String(port)])

      expect(await started.exit).toBe(1)
      expect(started.output()).toContain(`wishem: port ${String(port)} is in use`)
    } finally {
      await new Promise((resolve) => blocker.close(resolve))
    }
  })

  it('names a port that is not valid and ends with exit code 1', { timeout: 30000 }, async () => {
    const started = run(['--hub-port', 'many'])

    expect(await started.exit).toBe(1)
    expect(started.output()).toContain('wishem: --hub-port must be a number from 0 to 65535')
  })

  it('sends stopping to an open link on SIGINT and ends with exit code 0', { timeout: 30000 }, async () => {
    const { started, url } = await ready([])
    const link = await openLink(await webSocketChannel(new WebSocket(url)), [{ id: 'viewer', kind: 'output' }])
    const events: HubEvent[] = []
    link.ports.viewer.subscribe((event) => {
      events.push(event)
    })

    started.child.kill('SIGINT')

    expect(await started.exit).toBe(0)
    await link.closed
    expect(events.some((event) => event.type === 'stopping')).toBe(true)
  })
})
