// Serves the React page and passes its link to the sample construct.
// Usage: node react-page.ts [--port <number>] [--hub-port <number>]
import type { AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createServer } from 'vite'
import { quietLinkErrors } from './proxy-errors.ts'

export interface ReactPageOptions {
  /** The port of the page. Default 5175. Use 0 to let the system select a port. */
  port?: number
  /** The port of the sample construct. Default 4750. */
  hubPort?: number
  /** Default: write to the terminal. */
  log?: (line: string) => void
}

export interface ReactPageStart {
  /** For example `http://127.0.0.1:5175/`. */
  pageUrl: string
  /** For example `ws://127.0.0.1:4750/link`. */
  linkUrl: string
  /** Stops the page server. Gives the same promise on each call. */
  close(): Promise<void>
}

/** The start failed and the script already wrote the reason. */
export class StartError extends Error {}

const DEFAULT_PAGE_PORT = 5175
const DEFAULT_HUB_PORT = 4750
const ADDRESS = '127.0.0.1'
const packageRoot = resolve(import.meta.dirname, '..')

const isPortInUse = (error: unknown) =>
  error instanceof Error &&
  ((error as { code?: string }).code === 'EADDRINUSE' || error.message.includes('already in use'))

/** Starts the page server. The server starts also when no construct runs. */
export const startReactPage = async (options: ReactPageOptions = {}): Promise<ReactPageStart> => {
  const { port = DEFAULT_PAGE_PORT, hubPort = DEFAULT_HUB_PORT } = options
  const log =
    options.log ??
    ((line: string) => {
      console.log(line)
    })
  const linkUrl = `ws://${ADDRESS}:${String(hubPort)}/link`

  let server: Awaited<ReturnType<typeof createServer>> | undefined
  try {
    server = await createServer({
      root: packageRoot,
      logLevel: 'warn',
      server: {
        host: ADDRESS,
        port,
        strictPort: true,
        ws: false,
        proxy: {
          '^/link$': {
            target: `http://${ADDRESS}:${String(hubPort)}`,
            ws: true,
            changeOrigin: false,
            configure: quietLinkErrors(linkUrl, log),
          },
        },
      },
    })
    await server.listen()
  } catch (error) {
    try {
      await server?.close()
    } catch {
      // The start error below is the one to report.
    }
    if (isPortInUse(error)) {
      log(`wishem: port ${String(port)} is in use`)
      throw new StartError('the port of the page is in use')
    }
    throw error
  }

  const running = server
  const pageUrl = `http://${ADDRESS}:${String((running.httpServer?.address() as AddressInfo).port)}/`
  log(`wishem: React page at ${pageUrl}`)
  log(`wishem: the page connects to ${linkUrl}`)

  let closing: Promise<void> | undefined
  return {
    pageUrl,
    linkUrl,
    close: () => {
      closing ??= running.close()
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
        port: { type: 'string' },
        'hub-port': { type: 'string' },
      },
    })
    const start = await startReactPage({
      port: parsePort('--port', values.port, DEFAULT_PAGE_PORT),
      hubPort: parsePort('--hub-port', values['hub-port'], DEFAULT_HUB_PORT),
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
    // Removes the exit handler of Vite, so that one handler stops the server.
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
