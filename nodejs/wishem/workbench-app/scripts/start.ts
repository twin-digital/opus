// Starts the core of the workbench and the page server in one Node.js process.
// Usage: node start.ts [--model <folder>] [--port <number>] [--core-port <number>]
//   [--views <folder>] [--no-view-types]
import type { AddressInfo } from 'node:net'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createServer, type ViteDevServer } from 'vite'
import { ModelError, type Core } from '@thrashplay/wishem-core'
import { startHost } from '@thrashplay/wishem-host-nodejs'
import { formatProblem } from '@thrashplay/wishem-host-nodejs/format'
import { modelFolder } from '@thrashplay/wishem-workbench'
import { generateViewTypes } from './view-types.ts'
import { viewTypesLines } from './view-types-report.ts'

export interface WorkbenchOptions {
  /** Default: the model folder of the base workbench. */
  model?: string
  /** Default 5173. Use 0 to let the system select a port. */
  port?: number
  /** Default 4747. Use 0 to let the system select a port. */
  corePort?: number
  /** The folder whose generated files follow the model. Default: `src/views` of the package. */
  views?: string
  /** Default `true`. */
  viewTypes?: boolean
  /** Default: write to the terminal. */
  log?: (line: string) => void
}

export interface Workbench {
  /** For example `http://127.0.0.1:5173/`. */
  pageUrl: string
  /** For example `http://127.0.0.1:4747`. */
  coreUrl: string
  close(): Promise<void>
}

/** The start failed and the script already wrote the reason. */
export class StartError extends Error {}

const DEFAULT_PAGE_PORT = 5173
const DEFAULT_CORE_PORT = 4747
const PAGE_ADDRESS = '127.0.0.1'
const packageRoot = resolve(import.meta.dirname, '..')
const SIDECAR_SUFFIX = '.view.json'

const isPortInUse = (error: unknown) =>
  error instanceof Error &&
  ((error as { code?: string }).code === 'EADDRINUSE' || error.message.includes('already in use'))

interface KeeperOptions {
  core: Core
  server: ViteDevServer
  views: string
  log: (line: string) => void
}

/** Runs the generator at the start, after a change to the definitions, and after a change to a sidecar. */
const keepViewTypesCurrent = ({ core, server, views, log }: KeeperOptions) => {
  const state: { running?: Promise<void>; again: boolean } = { again: false }
  let lastDefinitions = JSON.stringify(core.getSnapshot().definitions)

  const hasRequest = () => state.again

  const runOnce = async () => {
    try {
      const result = await generateViewTypes({ definitions: core.getSnapshot().definitions, views })
      viewTypesLines(result).forEach(log)
    } catch (error) {
      log(`wishem: error: the generator failed (${error instanceof Error ? error.message : String(error)})`)
    }
  }

  // One run is active at a time. A request during a run starts one more run after it.
  const request = () => {
    if (state.running !== undefined) {
      state.again = true
      return
    }
    state.running = (async () => {
      do {
        state.again = false
        await runOnce()
      } while (hasRequest())
      state.running = undefined
    })()
  }

  const unsubscribe = core.subscribe((snapshot) => {
    const definitions = JSON.stringify(snapshot.definitions)
    if (definitions !== lastDefinitions) {
      lastDefinitions = definitions
      request()
    }
  })

  const onSidecar = (path: string) => {
    if (dirname(path) === views && path.endsWith(SIDECAR_SUFFIX)) {
      request()
    }
  }
  server.watcher.add(views)
  server.watcher.on('add', onSidecar).on('change', onSidecar).on('unlink', onSidecar)

  request()

  return {
    stop: async () => {
      unsubscribe()
      server.watcher.off('add', onSidecar).off('change', onSidecar).off('unlink', onSidecar)
      server.watcher.unwatch(views)
      await state.running
    },
  }
}

export const startWorkbench = async (options: WorkbenchOptions = {}): Promise<Workbench> => {
  const {
    model = modelFolder,
    port = DEFAULT_PAGE_PORT,
    corePort = DEFAULT_CORE_PORT,
    views = resolve(packageRoot, 'src', 'views'),
    viewTypes = true,
  } = options
  const log =
    options.log ??
    ((line: string) => {
      console.log(line)
    })

  log(`wishem: model ${model}`)

  let host
  try {
    host = await startHost({ folder: model, port: corePort, log })
  } catch (error) {
    if (error instanceof ModelError) {
      error.problems.forEach((problem) => {
        log(formatProblem(problem))
      })
      log('wishem: the model is not correct, so the workbench did not start')
      throw new StartError('the model is not correct')
    }
    if (isPortInUse(error)) {
      log(`wishem: port ${corePort} is in use`)
      throw new StartError('the port of the core is in use')
    }
    throw error
  }

  const proxy = { target: host.url, changeOrigin: false }
  let server: ViteDevServer | undefined
  try {
    server = await createServer({
      root: packageRoot,
      logLevel: 'warn',
      server: {
        host: PAGE_ADDRESS,
        port,
        strictPort: true,
        proxy: { '^/snapshots?$': proxy },
      },
    })
    await server.listen()
  } catch (error) {
    try {
      await server?.close()
    } catch {
      // The start error below is the one to report.
    } finally {
      await host.close()
    }
    if (isPortInUse(error)) {
      log(`wishem: port ${port} is in use`)
      throw new StartError('the port of the page is in use')
    }
    throw error
  }

  const pageUrl = `http://${PAGE_ADDRESS}:${String((server.httpServer?.address() as AddressInfo).port)}/`
  log(`wishem: core at ${host.url}`)
  log(`wishem: workbench at ${pageUrl}`)

  const keeper = viewTypes ? keepViewTypesCurrent({ core: host.core, server, views, log }) : undefined

  return {
    pageUrl,
    coreUrl: host.url,
    close: async () => {
      await keeper?.stop()
      await server.close()
      await host.close()
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
        model: { type: 'string' },
        port: { type: 'string' },
        'core-port': { type: 'string' },
        views: { type: 'string' },
        'no-view-types': { type: 'boolean' },
      },
    })
    const workbench = await startWorkbench({
      // pnpm runs the script in the package folder and sets INIT_CWD to the folder of the person.
      model: values.model === undefined ? undefined : resolve(process.env.INIT_CWD ?? process.cwd(), values.model),
      port: parsePort('--port', values.port, DEFAULT_PAGE_PORT),
      corePort: parsePort('--core-port', values['core-port'], DEFAULT_CORE_PORT),
      views: values.views === undefined ? undefined : resolve(process.env.INIT_CWD ?? process.cwd(), values.views),
      viewTypes: values['no-view-types'] !== true,
    })
    const stop = () => {
      workbench.close().then(
        () => process.exit(0),
        (error: unknown) => {
          console.error(`wishem: cannot stop: ${String(error)}`)
          process.exit(1)
        },
      )
    }
    // Removes the exit handler of Vite, so that one handler stops both parts.
    process.removeAllListeners('SIGTERM')
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
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
