// Starts the construct of the PixiJS page and the page server in one Node.js process.
// Usage: node start.ts [--paused] [--port <number>] [--hub-port <number>]
import type { AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createServer } from 'vite'
import { startPixiConstruct } from '../src/construct/process.ts'

export interface PixiStartOptions {
  /** The port of the page. Default 5174. Use 0 to let the system select a port. */
  port?: number
  /** The port of the hub. Default 4748. Use 0 to let the system select a port. */
  hubPort?: number
  /** Default `false`. */
  paused?: boolean
  /** Default: write to the terminal. */
  log?: (line: string) => void
}

export interface PixiStart {
  /** For example `http://127.0.0.1:5174/`. */
  pageUrl: string
  /** For example `ws://127.0.0.1:4748/link`. */
  linkUrl: string
  /** Stops the construct, then the page server. Gives the same promise on each call. */
  close(): Promise<void>
}

/** The start failed and the script already wrote the reason. */
export class StartError extends Error {}

const DEFAULT_PAGE_PORT = 5174
const DEFAULT_HUB_PORT = 4748
const PAGE_ADDRESS = '127.0.0.1'
const packageRoot = resolve(import.meta.dirname, '..')

const isPortInUse = (error: unknown) =>
  error instanceof Error &&
  ((error as { code?: string }).code === 'EADDRINUSE' || error.message.includes('already in use'))

export const startPixi = async (options: PixiStartOptions = {}): Promise<PixiStart> => {
  const { port = DEFAULT_PAGE_PORT, hubPort = DEFAULT_HUB_PORT, paused = false } = options
  const log =
    options.log ??
    ((line: string) => {
      console.log(line)
    })

  if (paused) {
    log('wishem: the time of the construct starts paused')
  }

  let construct
  try {
    construct = await startPixiConstruct({ port: hubPort, paused, log })
  } catch (error) {
    if (isPortInUse(error)) {
      log(`wishem: port ${String(hubPort)} is in use`)
      throw new StartError('the port of the hub is in use')
    }
    throw error
  }

  let server: Awaited<ReturnType<typeof createServer>> | undefined
  try {
    server = await createServer({
      root: packageRoot,
      logLevel: 'warn',
      server: {
        host: PAGE_ADDRESS,
        port,
        strictPort: true,
        ws: false,
        proxy: { '^/link$': { target: construct.url, ws: true, changeOrigin: false } },
      },
    })
    await server.listen()
  } catch (error) {
    try {
      await server?.close()
    } catch {
      // The start error below is the one to report.
    } finally {
      await construct.close()
    }
    if (isPortInUse(error)) {
      log(`wishem: port ${String(port)} is in use`)
      throw new StartError('the port of the page is in use')
    }
    throw error
  }

  const running = server
  const pageUrl = `http://${PAGE_ADDRESS}:${String((running.httpServer?.address() as AddressInfo).port)}/`
  log(`wishem: link at ${construct.linkUrl}`)
  log(`wishem: PixiJS page at ${pageUrl}`)

  let closing: Promise<void> | undefined
  return {
    pageUrl,
    linkUrl: construct.linkUrl,
    close: () => {
      closing ??= (async () => {
        try {
          await construct.close()
        } finally {
          await running.close()
        }
      })()
      return closing
    },
  }
}

const parsePort = (name: string, value: string | undefined, fallback: number) => {
  if (value === undefined) {
    return fallback
  }
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0 || number > 65535) {
    throw new Error(`${name} must be a number from 0 to 65535`)
  }
  return number
}

const main = async () => {
  try {
    const { values } = parseArgs({
      options: {
        paused: { type: 'boolean' },
        port: { type: 'string' },
        'hub-port': { type: 'string' },
      },
    })
    const start = await startPixi({
      port: parsePort('--port', values.port, DEFAULT_PAGE_PORT),
      hubPort: parsePort('--hub-port', values['hub-port'], DEFAULT_HUB_PORT),
      paused: values.paused === true,
    })
    let stopping = false
    const stop = () => {
      if (stopping) {
        return
      }
      stopping = true
      start.close().then(
        () => process.exit(0),
        (error: unknown) => {
          console.error(`wishem: cannot stop: ${String(error)}`)
          process.exit(1)
        },
      )
    }
    // Removes the exit handler of Vite, so that one handler stops both parts.
    process.removeAllListeners('SIGTERM')
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
  } catch (error) {
    if (!(error instanceof StartError)) {
      console.error(error instanceof Error ? `wishem: ${error.message}` : error)
    }
    process.exit(1)
  }
}

if (import.meta.filename === process.argv[1]) {
  void main()
}
