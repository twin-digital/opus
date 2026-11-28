import path from 'node:path'
import { createStore, ModelError, validateModel } from '@thrashplay/wishem-core'
import type { Problem } from '@thrashplay/wishem-core'
import { createHub } from '@thrashplay/wishem-hub'
import type { Hub, ModelSubsystem } from '@thrashplay/wishem-hub'
import { formatProblem } from './format.js'
import { LINK_PATH } from './link-server.js'
import { attachModelFolderStorage } from './model-folder-storage.js'
import type { ModelFolderStorage } from './model-folder-storage.js'
import { readModelFolder, toAbsoluteSources, withSource } from './read-model-folder.js'
import { serveHub } from './serve-hub.js'
import type { HubServer } from './serve-hub.js'

export { LINK_PATH }

export const PRODUCT_ID = 'product'
export const PRODUCT_FILES_ID = 'product-files'
export const PRODUCT_FILES_WRITER_ID = 'product-files-writer'

export interface ConstructOptions {
  folder: string
  /** The folder of the product model to mount as the store `product`. It must be a different folder from `folder`. */
  product?: string
  /** More model subsystems. The hub gets them after the stores. Default: none. */
  subsystems?: readonly ModelSubsystem[]
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

  /** A line that names a file keeps its text. Each other line names the product. */
  const nameProduct = (line: string) =>
    /^wishem: (problem|warning) in /.test(line) ? line : line.replace(/^wishem: /, 'wishem: product: ')

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
    log(nameProduct(formatProblem(warning)))
  })

  const hub = createHub({
    subsystems: [
      createStore({ model: first }),
      ...(productFirst === undefined ? [] : [createStore({ id: PRODUCT_ID, model: productFirst })]),
      ...(options.subsystems ?? []),
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
            log(nameProduct(line))
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

  let server: HubServer
  try {
    server = await serveHub(hub, { port })
  } catch (error) {
    await closeStorages()
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
    await server.close()
    throw error
  }

  let closing: Promise<void> | undefined

  return {
    url: server.url,
    linkUrl: server.linkUrl,
    hub,
    close: () => {
      closing ??= (async () => {
        const storagesClosed = closeStorages()
        if (hub.status === 'running') {
          hub.stop()
        }
        await storagesClosed
        await server.close()
      })()
      return closing
    },
  }
}
