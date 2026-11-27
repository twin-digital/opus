import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createStore, ModelError, validateModel } from '@thrashplay/wishem-core'
import type { Problem } from '@thrashplay/wishem-core'
import { createHub } from '@thrashplay/wishem-hub'
import type { Hub } from '@thrashplay/wishem-hub'
import { formatProblem } from './format.js'
import { attachLinkServer, LINK_PATH, respondNotFound } from './link-server.js'
import { attachModelFolderStorage } from './model-folder-storage.js'
import { readModelFolder, withSource } from './read-model-folder.js'

export { LINK_PATH }

export interface ConstructOptions {
  folder: string
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
  /** The hub of the construct. Its model subsystem `store` holds the model. */
  hub: Hub
  /** Stops the hub, waits for a running read or write, and closes the servers and the watch. Gives the same promise on each call. */
  close(): Promise<void>
}

export const DEFAULT_PORT = 4747
const HOST_ADDRESS = '127.0.0.1'

/** Rejects with a `ModelError` when the model is not correct at the start. */
export const startConstruct = async (options: ConstructOptions): Promise<Construct> => {
  const { folder, port = DEFAULT_PORT } = options
  const log =
    options.log ??
    ((line: string) => {
      console.log(line)
    })

  const initial = await readModelFolder(folder)
  const validation = initial.data === undefined ? undefined : validateModel(initial.data)
  if (validation?.ok !== true) {
    const problems: Problem[] = validation === undefined ? initial.problems : withSource(validation.problems, initial)
    throw new ModelError(problems)
  }
  withSource(validation.warnings, initial).forEach((warning) => {
    log(formatProblem(warning))
  })
  const first = validation.model

  const hub = createHub({
    subsystems: [createStore({ model: first })],
    onError: (error) => {
      log(`wishem: a listener failed: ${error instanceof Error ? error.message : String(error)}`)
    },
  })
  const storage = attachModelFolderStorage({ folder, hub, first, log, onWatchError: options.onWatchError })

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
    await storage.close()
    await linkServer.close()
    throw error
  }

  hub.start()
  try {
    storage.watch()
  } catch (error) {
    hub.stop()
    await storage.close()
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
        const storageClosed = storage.close()
        if (hub.status === 'running') {
          hub.stop()
        }
        await storageClosed
        await linkServer.close()
        await closeServer()
      })()
      return closing
    },
  }
}
