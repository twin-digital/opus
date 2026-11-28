// Starts the construct of the workbench and the page server in one Node.js process.
// Usage: node start.ts [--model <folder>] [--product <folder>] [--product-code <module>] [--port <number>] [--hub-port <number>]
//   [--views <folder>] [--no-view-types]
import type { AddressInfo } from 'node:net'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { createServer, type ViteDevServer } from 'vite'
import { attachConstructManager, type ConstructManager } from '@thrashplay/wishem-construct-manager/node'
import { createConstructList } from '@thrashplay/wishem-construct-manager'
import { ModelError, type Model } from '@thrashplay/wishem-core'
import { startConstruct } from '@thrashplay/wishem-host-nodejs'
import { formatProblem } from '@thrashplay/wishem-host-nodejs/format'
import type { Hub } from '@thrashplay/wishem-hub'
import { checkBehaviors, type NativeBehavior } from '@thrashplay/wishem-update'
import { modelFolder } from '@thrashplay/wishem-workbench'
import { generateViewTypes } from './view-types.ts'
import { viewTypesLines } from './view-types-report.ts'

export interface WorkbenchOptions {
  /** Default: the model folder of the base workbench. */
  model?: string
  /** The folder of a product model to mount as the store `product`. Default: no product. */
  product?: string
  /** The module with the export `behaviors`: a package name, or a path that starts with `.` or `/`. Needs `product`. */
  productCode?: string
  /** Default 5173. Use 0 to let the system select a port. */
  port?: number
  /** Default 4747. Use 0 to let the system select a port. */
  hubPort?: number
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
  /** For example `ws://127.0.0.1:4747/link`. */
  linkUrl: string
  close(): Promise<void>
}

/** The start failed and the script already wrote the reason. */
export class StartError extends Error {}

const DEFAULT_PAGE_PORT = 5173
const DEFAULT_HUB_PORT = 4747
const PAGE_ADDRESS = '127.0.0.1'
const packageRoot = resolve(import.meta.dirname, '..')
const SIDECAR_SUFFIX = '.view.json'

const isPathValue = (value: string) => value.startsWith('.') || value.startsWith('/')

/** Loads the product code. Logs the reason and throws a `StartError` when it cannot be used. */
const loadProductCode = async (value: string, log: (line: string) => void): Promise<readonly NativeBehavior[]> => {
  let loaded: { behaviors?: unknown }
  try {
    const target =
      isPathValue(value) ? pathToFileURL(resolve(process.env.INIT_CWD ?? process.cwd(), value)).href : value
    loaded = (await import(target)) as { behaviors?: unknown }
  } catch (error) {
    log(`wishem: the product code ${value} cannot be loaded: ${error instanceof Error ? error.message : String(error)}`)
    throw new StartError('the product code cannot be loaded')
  }
  try {
    return checkBehaviors(loaded.behaviors)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    log(`wishem: the product code has no correct list behaviors: ${reason}`)
    throw new StartError('the product code has no correct list behaviors')
  }
}

const isPortInUse = (error: unknown) =>
  error instanceof Error &&
  ((error as { code?: string }).code === 'EADDRINUSE' || error.message.includes('already in use'))

interface KeeperOptions {
  hub: Hub
  server: ViteDevServer
  views: string
  log: (line: string) => void
}

/** Runs the generator at the start, after a change to the definitions, and after a change to a sidecar. */
const keepViewTypesCurrent = ({ hub, server, views, log }: KeeperOptions) => {
  const state: { running?: Promise<void>; again: boolean } = { again: false }
  const port = hub.attach({ id: 'view-types', kind: 'output' })
  const definitionsOf = () => (port.read().store as Model).definitions
  let lastArray = definitionsOf()
  let lastDefinitions = JSON.stringify(lastArray)

  const hasRequest = () => state.again

  const runOnce = async () => {
    try {
      const result = await generateViewTypes({ definitions: definitionsOf(), views })
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

  const unsubscribe = port.subscribe((event) => {
    if (event.type !== 'applied') {
      return
    }
    const array = definitionsOf()
    if (array === lastArray) {
      return
    }
    lastArray = array
    const definitions = JSON.stringify(array)
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
      port.close()
      server.watcher.off('add', onSidecar).off('change', onSidecar).off('unlink', onSidecar)
      server.watcher.unwatch(views)
      await state.running
    },
  }
}

export const startWorkbench = async (options: WorkbenchOptions = {}): Promise<Workbench> => {
  const {
    model = modelFolder,
    product,
    productCode,
    port = DEFAULT_PAGE_PORT,
    hubPort = DEFAULT_HUB_PORT,
    views = resolve(packageRoot, 'src', 'views'),
    viewTypes = true,
  } = options
  const log =
    options.log ??
    ((line: string) => {
      console.log(line)
    })

  if (productCode !== undefined && product === undefined) {
    log('wishem: --product-code needs --product')
    throw new StartError('--product-code needs --product')
  }

  log(`wishem: model ${model}`)
  if (product !== undefined) {
    log(`wishem: product ${product}`)
  }
  let behaviors: readonly NativeBehavior[] | undefined
  if (productCode !== undefined) {
    log(`wishem: product code ${productCode}`)
    behaviors = await loadProductCode(productCode, log)
  }

  let construct
  try {
    construct = await startConstruct({
      folder: model,
      product,
      port: hubPort,
      log,
      subsystems: product === undefined ? undefined : [createConstructList()],
    })
  } catch (error) {
    if (error instanceof ModelError) {
      error.problems.forEach((problem) => {
        log(formatProblem(problem))
      })
      log('wishem: the model is not correct, so the workbench did not start')
      throw new StartError('the model is not correct')
    }
    if (isPortInUse(error)) {
      log(`wishem: port ${hubPort} is in use`)
      throw new StartError('the port of the hub is in use')
    }
    throw error
  }

  let manager: ConstructManager | undefined
  try {
    manager = product === undefined ? undefined : attachConstructManager({ hub: construct.hub, behaviors, log })
  } catch (error) {
    await construct.close()
    throw error
  }

  const proxy = { target: construct.url, ws: true, changeOrigin: false }
  let server: ViteDevServer | undefined
  try {
    server = await createServer({
      root: packageRoot,
      logLevel: 'warn',
      server: {
        host: PAGE_ADDRESS,
        port,
        strictPort: true,
        proxy: { '^/link$': proxy },
      },
    })
    await server.listen()
  } catch (error) {
    // Each part closes. The start error below is the one to report.
    await server?.close().catch(() => undefined)
    await manager?.close().catch(() => undefined)
    await construct.close()
    if (isPortInUse(error)) {
      log(`wishem: port ${port} is in use`)
      throw new StartError('the port of the page is in use')
    }
    throw error
  }

  const pageUrl = `http://${PAGE_ADDRESS}:${String((server.httpServer?.address() as AddressInfo).port)}/`
  log(`wishem: link at ${construct.linkUrl}`)
  log(`wishem: workbench at ${pageUrl}`)

  const keeper = viewTypes ? keepViewTypesCurrent({ hub: construct.hub, server, views, log }) : undefined

  return {
    pageUrl,
    linkUrl: construct.linkUrl,
    close: async () => {
      try {
        try {
          await keeper?.stop()
        } finally {
          await manager?.close()
        }
      } finally {
        try {
          await server.close()
        } finally {
          await construct.close()
        }
      }
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
        product: { type: 'string' },
        'product-code': { type: 'string' },
        port: { type: 'string' },
        'hub-port': { type: 'string' },
        views: { type: 'string' },
        'no-view-types': { type: 'boolean' },
      },
    })
    if (values.product === '') {
      throw new Error('--product must be a folder')
    }
    if (values['product-code'] === '') {
      throw new Error('--product-code must be a module')
    }
    const workbench = await startWorkbench({
      // pnpm runs the script in the package folder and sets INIT_CWD to the folder of the person.
      model: values.model === undefined ? undefined : resolve(process.env.INIT_CWD ?? process.cwd(), values.model),
      product:
        values.product === undefined ? undefined : resolve(process.env.INIT_CWD ?? process.cwd(), values.product),
      productCode: values['product-code'],
      port: parsePort('--port', values.port, DEFAULT_PAGE_PORT),
      hubPort: parsePort('--hub-port', values['hub-port'], DEFAULT_HUB_PORT),
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
