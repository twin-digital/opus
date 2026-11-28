import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Hub } from '@thrashplay/wishem-hub'
import { attachLinkServer, LINK_PATH, respondNotFound } from './link-server.js'

const HOST_ADDRESS = '127.0.0.1'

export interface ServeHubOptions {
  /** Use 0 to let the system select a port. */
  port: number
}

export interface HubServer {
  /** For example `http://127.0.0.1:4748`. */
  readonly url: string
  /** For example `ws://127.0.0.1:4748/link`. */
  readonly linkUrl: string
  /** Stops the hub when it runs, closes each link, and releases the port. Gives the same promise on each call. */
  close(): Promise<void>
}

/**
 * Listens on 127.0.0.1 and serves the link of the hub at `/link`. Does not start the hub.
 * Rejects with the error of the listen (for example `EADDRINUSE`), and then holds no socket.
 */
export const serveHub = async (hub: Hub, options: ServeHubOptions): Promise<HubServer> => {
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
      server.listen(options.port, HOST_ADDRESS, () => {
        server.off('error', reject)
        resolve()
      })
    })
  } catch (error) {
    await linkServer.close()
    throw error
  }

  const address = `${HOST_ADDRESS}:${(server.address() as AddressInfo).port}`
  let closing: Promise<void> | undefined

  return {
    url: `http://${address}`,
    linkUrl: `ws://${address}${LINK_PATH}`,
    close: () => {
      closing ??= (async () => {
        try {
          hub.stop()
        } catch {
          // The hub is not running, or a stop is already requested.
        }
        await Promise.resolve() // Let the current event reach each link before the links close.
        await linkServer.close()
        await closeServer()
      })()
      return closing
    },
  }
}
