// @vitest-environment node
import { spawn } from 'node:child_process'
import { connect, createServer, type AddressInfo } from 'node:net'
import { join } from 'node:path'
import { openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import { afterEach, describe, expect, it } from 'vitest'
import { startGodotConstruct, type GodotConstruct } from '../construct/process.js'
import { startRelay, type Relay } from './relay.js'
import type { ChildProcessLike } from './docker.js'

const relayScript = join(import.meta.dirname, '..', '..', 'docker', 'relay.mjs')

const eventually = async (check: () => boolean, ms = 5000) => {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('timeout')
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      server.close(() => {
        resolve(port)
      })
    })
  })

describe('startRelay', () => {
  let constructs: GodotConstruct[]
  let relays: Relay[]
  let sockets: WebSocket[]
  let inners: ChildProcessLike[]

  afterEach(async () => {
    for (const socket of sockets) {
      socket.close()
    }
    await Promise.all(relays.map((relay) => relay.close()))
    await Promise.all(constructs.map((construct) => construct.close()))
    for (const inner of inners) {
      inner.kill()
    }
  })

  const setup = async (options: { construct?: boolean } = {}) => {
    constructs = []
    relays = []
    sockets = []
    inners = []
    const construct =
      options.construct === false ?
        undefined
      : await startGodotConstruct({ port: 0, paused: true, log: () => undefined })
    if (construct) {
      constructs.push(construct)
    }
    const hubPort = construct ? Number(new URL(construct.url).port) : await freePort()
    const innerPort = await freePort()
    const errors: unknown[] = []
    const relay = startRelay({
      hubPort,
      spawnInner: () => {
        const child = spawn('node', [relayScript, String(innerPort)], { stdio: ['pipe', 'pipe', 'pipe'] })
        inners.push(child)
        return child
      },
      onError: (error) => errors.push(error),
    })
    relays.push(relay)
    return { construct, relay, innerPort, hubPort, errors }
  }

  /** Connects to the inner relay. Tries again until the relay listens. */
  const connectWhenReady = async (port: number) => {
    const deadline = Date.now() + 8000
    for (;;) {
      const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/link`)
      const outcome = await new Promise<'open' | 'closed'>((resolve) => {
        socket.addEventListener('open', () => {
          resolve('open')
        })
        socket.addEventListener('error', () => {
          resolve('closed')
        })
        socket.addEventListener('close', () => {
          resolve('closed')
        })
      })
      if (outcome === 'open') {
        sockets.push(socket)
        return socket
      }
      if (Date.now() > deadline) {
        throw new Error('the relay does not accept a connection')
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  const link = async (port: number) => {
    const socket = await connectWhenReady(port)
    const channel = await webSocketChannel(socket)
    return openLink(channel, [{ id: 'screen', kind: 'output' }])
  }

  it('carries welcome and the result of an input in both directions', async () => {
    const { innerPort } = await setup()
    const remote = await link(innerPort)
    expect(Object.keys(remote.ports)).toEqual(['screen'])
    expect(remote.ports.screen.read()).toHaveProperty('store')
  })

  it('gives the result of an input of the client', async () => {
    const { innerPort } = await setup()
    const socket = await connectWhenReady(innerPort)
    const channel = await webSocketChannel(socket)
    const remote = await openLink(channel, [{ id: 'controls', kind: 'input' }])
    const result = await remote.ports.controls.submit({ type: 'time/advance', payload: { ms: 500 } })
    expect(result).toMatchObject({ ok: true, seq: 1 })
  })

  it('carries equal bytes in each direction', async () => {
    const hubPort = await freePort()
    const innerPort = await freePort()
    const received: Buffer[] = []
    const echo = createServer((socket) => {
      socket.on('data', (chunk: Buffer) => {
        received.push(chunk)
        socket.write(chunk)
      })
    })
    await new Promise<void>((resolve) => echo.listen(hubPort, '127.0.0.1', resolve))
    const children: ChildProcessLike[] = []
    const relay = startRelay({
      hubPort,
      spawnInner: () => {
        const child = spawn('node', [relayScript, String(innerPort)], { stdio: ['pipe', 'pipe', 'pipe'] })
        children.push(child)
        return child
      },
    })
    try {
      const payload = Buffer.from(Array.from({ length: 70000 }, (_, index) => index % 256))
      let socket: ReturnType<typeof connect> | undefined
      const deadline = Date.now() + 8000
      while (socket === undefined) {
        const attempt = connect(innerPort, '127.0.0.1')
        const ok = await new Promise<boolean>((resolve) => {
          attempt.once('connect', () => {
            resolve(true)
          })
          attempt.once('error', () => {
            resolve(false)
          })
        })
        if (ok) {
          socket = attempt
        } else if (Date.now() > deadline) {
          throw new Error('no connection')
        } else {
          await new Promise((resolve) => setTimeout(resolve, 50))
        }
      }
      const back: Buffer[] = []
      socket.on('data', (chunk: Buffer) => back.push(chunk))
      socket.write(payload)
      await eventually(() => Buffer.concat(back).length >= payload.length)
      expect(Buffer.concat(received).equals(payload)).toBe(true)
      expect(Buffer.concat(back).equals(payload)).toBe(true)
      socket.destroy()
    } finally {
      await relay.close()
      await new Promise((resolve) => echo.close(resolve))
    }
  })

  it('accepts a new client after the first client closes', async () => {
    const { innerPort } = await setup()
    const first = await link(innerPort)
    first.close()
    await first.closed
    const second = await link(innerPort)
    expect(second.ports.screen.read()).toHaveProperty('store')
  })

  it('closes the client socket when no construct listens, and starts the next inner relay', async () => {
    const { innerPort } = await setup({ construct: false })
    for (let round = 0; round < 2; round += 1) {
      const closed = new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 8000
        const attempt = () => {
          const socket = connect(innerPort, '127.0.0.1')
          socket.once('connect', () => {
            socket.write('GET /link HTTP/1.1\r\n\r\n')
          })
          socket.once('close', (hadError) => {
            if (!hadError) {
              resolve()
            } else if (Date.now() > deadline) {
              reject(new Error('no connection'))
            } else {
              setTimeout(attempt, 50)
            }
          })
          socket.on('error', () => undefined)
        }
        attempt()
      })
      await closed
    }
  })

  it('closes the client socket when the construct stops', async () => {
    const { innerPort, construct } = await setup()
    const remote = await link(innerPort)
    await construct?.close()
    await remote.closed
  })

  it('gives the same promise on each close, ends the inner relay, and starts no new one', async () => {
    const { relay, innerPort } = await setup()
    await connectWhenReady(innerPort)
    const first = relay.close()
    const second = relay.close()
    expect(second).toBe(first)
    await first
    const count = inners.length
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(inners.length).toBe(count)
    expect(inners.every((child) => (child as unknown as { exitCode: number | null }).exitCode !== null)).toBe(true)
  })

  it('ends an idle inner relay in less than the kill time when it closes', async () => {
    const { relay } = await setup()
    await new Promise((resolve) => setTimeout(resolve, 500))
    const started = Date.now()
    await relay.close()
    expect(Date.now() - started).toBeLessThan(700)
  })
})
