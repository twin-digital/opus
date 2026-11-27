import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { createStore, ModelError, validateModel } from '@thrashplay/wishem-core'
import type { Problem } from '@thrashplay/wishem-core'
import { createHub } from '@thrashplay/wishem-hub'
import type { Hub } from '@thrashplay/wishem-hub'
import { formatProblem } from './format.js'
import { attachLinkServer, LINK_PATH, respondNotFound } from './link-server.js'
import { attachModelFolderStorage } from './model-folder-storage.js'
import type { ModelFolderStorage } from './model-folder-storage.js'
import { readModelFolder, toAbsoluteSources, withSource } from './read-model-folder.js'

export { LINK_PATH }

export const PRODUCT_ID = 'product'
export const PRODUCT_FILES_ID = 'product-files'
export const PRODUCT_FILES_WRITER_ID = 'product-files-writer'

export interface ConstructOptions {
  folder: string
  /** The folder of the product model to mount as the store `product`. It must be a different folder from `folder`. */
  product?: string
  /** Default 4747. Use 0 to let the system select a port. */
  port?: number
  /** Default: write to the terminal. */
  log?: (line: string) => void
  /** Called when the watch of the model folder fails. */
  onWatchError?: (error: Error) => void
}

export interface Construct {
  /** For example `http://127.0.0.1:4747`. */
  url: string
  /** For example `ws://127.0.0.1:4747/link`. */
  linkUrl: string
  /** The hub of the construct. Its store `store` holds the model. With `product`, its store `product` holds the product model. */
  hub: Hub
  /** Stops the hub, waits for a running read or write, and closes the servers and the watch. Gives the same promise on each call. */
  close(): Promise<void>
}

export const DEFAULT_PORT = 4747
const HOST_ADDRESS = '127.0.0.1'

/**
 * Rejects with a `ModelError` when a model is not correct at the start. A problem of the product names the
 * absolute path of its file. Rejects with an `Error` when `product` is the same folder as `folder`.
 */
export const startConstruct = async (options: ConstructOptions): Promise<Construct> => {
  const { folder, port = DEFAULT_PORT } = options
  const log =
    options.log ??
    ((line: string) => {
      console.log(line)
    })

  if (options.product !== undefined && path.resolve(options.product) === path.resolve(folder)) {
    throw new Error('the product folder and the model folder are the same folder')
  }

  const readValid = async (target: string, absolute: boolean) => {
    const read = await readModelFolder(target)
    const checked = read.data === undefined ? undefined : validateModel(read.data)
    const named = (problems: Problem[]) => (absolute ? toAbsoluteSources(problems, target) : problems)
    if (checked?.ok !== true) {
      return {
        problems: named(checked === undefined ? read.problems : withSource(checked.problems, read)),
        warnings: [],
      }
    }
    return { model: checked.model, problems: [], warnings: named(withSource(checked.warnings, read)) }
  }

  const [initial, productInitial] = await Promise.all([
    readValid(folder, false),
    options.product === undefined ? undefined : readValid(options.product, true),
  ])
  const problems = [...initial.problems, ...(productInitial?.problems ?? [])]
  if (problems.length > 0 || initial.model === undefined) {
    throw new ModelError(problems)
  }
  initial.warnings.forEach((warning) => {
    log(formatProblem(warning))
  })
  const first = initial.model
  const productFirst = productInitial?.model
  productInitial?.warnings.forEach((warning) => {
    log(formatProblem(warning))
  })

  const hub = createHub({
    subsystems: [
      createStore({ model: first }),
      ...(productFirst === undefined ? [] : [createStore({ id: PRODUCT_ID, model: productFirst })]),
    ],
    onError: (error) => {
      log(`wishem: a listener failed: ${error instanceof Error ? error.message : String(error)}`)
    },
  })
  const storages: ModelFolderStorage[] = [
    attachModelFolderStorage({ folder, hub, first, log, onWatchError: options.onWatchError }),
  ]
  const closeStorages = () => Promise.all(storages.map((storage) => storage.close()))
  if (options.product !== undefined && productFirst !== undefined) {
    try {
      storages.push(
        attachModelFolderStorage({
          folder: options.product,
          hub,
          first: productFirst,
          log: (line) => {
            log(/^wishem: (problem|warning)/.test(line) ? line : line.replace(/^wishem: /, 'wishem: product: '))
          },
          onWatchError: options.onWatchError,
          storeId: PRODUCT_ID,
          subsystemIds: { input: PRODUCT_FILES_ID, output: PRODUCT_FILES_WRITER_ID },
          absoluteSources: true,
        }),
      )
    } catch (error) {
      await closeStorages()
      throw error
    }
  }

  const server = createServer(respondNotFound)
  const linkServer = attachLinkServer(server, hub)
  const closeServer = () =>
    new Promise<void>((resolve) => {
      server.close(() => {
        resolve()
      })
      server.closeAllConnections()
    })

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, HOST_ADDRESS, () => {
        server.off('error', reject)
        resolve()
      })
    })
  } catch (error) {
    await closeStorages()
    await linkServer.close()
    throw error
  }

  hub.start()
  try {
    storages.forEach((storage) => {
      storage.watch()
    })
  } catch (error) {
    hub.stop()
    await closeStorages()
    await linkServer.close()
    await closeServer()
    throw error
  }

  const address = `${HOST_ADDRESS}:${(server.address() as AddressInfo).port}`
  let closing: Promise<void> | undefined

  return {
    url: `http://${address}`,
    linkUrl: `ws://${address}${LINK_PATH}`,
    hub,
    close: () => {
      closing ??= (async () => {
        const storagesClosed = closeStorages()
        if (hub.status === 'running') {
          hub.stop()
        }
        await storagesClosed
        await linkServer.close()
        await closeServer()
      })()
      return closing
    },
  }
}
