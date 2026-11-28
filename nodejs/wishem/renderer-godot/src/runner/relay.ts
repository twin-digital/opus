import { connect, type Socket } from 'node:net'
import type { ChildProcessLike } from './docker.ts'

export interface RelayOptions {
  hubPort: number
  /** Starts one relay in the container. */
  spawnInner: () => ChildProcessLike
  onError?: (error: unknown) => void
}

export interface Relay {
  /** Ends the current connection and starts no new relay. Gives the same promise on each call. */
  close(): Promise<void>
}

const KILL_AFTER_MS = 1000
const RESTART_DELAY_MS = 50

/** Ends the stdin of the inner relay, which ends it, and kills it when it stays. Resolves at its exit. */
const stopInner = (inner: ChildProcessLike, exited: Promise<void>): Promise<void> => {
  try {
    inner.stdin.end()
  } catch {
    // The inner relay is gone.
  }
  const timer = setTimeout(() => {
    inner.kill()
  }, KILL_AFTER_MS)
  return exited.finally(() => {
    clearTimeout(timer)
  })
}

/**
 * Runs one inner relay at a time. When the inner relay sends its first bytes, connects to the hub port
 * on this computer and carries the bytes in both directions. When one side ends, ends the other and starts the next.
 */
export const startRelay = (options: RelayOptions): Relay => {
  const state = { closed: false }
  const isClosed = () => state.closed
  let stopCurrent: (() => Promise<void>) | undefined

  const report = (error: unknown) => {
    options.onError?.(error)
  }

  const runOne = async (): Promise<void> => {
    const inner = options.spawnInner()
    let socket: Socket | undefined
    let connected = false
    const queue: Buffer[] = []
    const exited = new Promise<void>((resolve) => {
      inner.once('exit', () => {
        resolve()
      })
    })
    let stopping: Promise<void> | undefined
    const stop = () => {
      stopping ??= stopInner(inner, exited)
      return stopping
    }
    stopCurrent = stop

    inner.stderr.resume()
    inner.stdin.on('error', report)

    const open = () => {
      socket = connect(options.hubPort, '127.0.0.1')
      socket.on('connect', () => {
        connected = true
        for (const chunk of queue.splice(0)) {
          socket?.write(chunk)
        }
      })
      socket.on('data', (chunk: Buffer) => {
        inner.stdin.write(chunk)
      })
      socket.on('error', () => {
        void stop()
      })
      socket.on('close', () => {
        void stop()
      })
    }

    inner.stdout.on('data', (chunk: Buffer) => {
      if (socket === undefined) {
        open()
      }
      if (connected) {
        socket?.write(chunk)
      } else {
        queue.push(chunk)
      }
    })

    await exited
    socket?.destroy()
    await stop()
  }

  const loop = async () => {
    while (!isClosed()) {
      try {
        await runOne()
      } catch (error) {
        report(error)
      }
      if (!isClosed()) {
        await new Promise((resolve) => setTimeout(resolve, RESTART_DELAY_MS))
      }
    }
  }

  const current = loop()

  let closing: Promise<void> | undefined
  return {
    close: () => {
      closing ??= (async () => {
        state.closed = true
        await stopCurrent?.()
        await current
      })()
      return closing
    },
  }
}
