import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { serveLink, webSocketChannel } from '@thrashplay/wishem-hub'
import type { Hub, WebSocketLike } from '@thrashplay/wishem-hub'
import { WebSocketServer } from 'ws'

export const LINK_PATH = '/link'

const CLOSE_GRACE_MS = 1000
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

const pathOf = (request: IncomingMessage) => (request.url ?? '/').split('?')[0] ?? '/'

/** True for no origin, and for an origin whose host name is 127.0.0.1, localhost, or [::1]. */
export const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (origin === undefined) {
    return true
  }
  try {
    return LOCAL_HOSTS.has(new URL(origin).hostname)
  } catch {
    return false
  }
}

/** Answers a plain HTTP request with status 404 and a JSON `error` message. */
export const respondNotFound = (request: IncomingMessage, response: ServerResponse): void => {
  response.writeHead(404, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify({ error: `No such path: ${pathOf(request)}` }))
}

const refuseUpgrade = (socket: Duplex, status: string) => {
  socket.once('finish', () => {
    socket.destroy()
  })
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
}

export interface LinkServer {
  /** Closes each open socket, and terminates a socket that stays open for one second. Gives the same promise on each call. */
  close(): Promise<void>
}

/** Handles the `upgrade` event of the server for `LINK_PATH`. */
export const attachLinkServer = (server: Server, hub: Hub): LinkServer => {
  const sockets = new WebSocketServer({ noServer: true })
  let closing: Promise<void> | undefined

  server.on('upgrade', (request, socket, head) => {
    if (pathOf(request) !== LINK_PATH) {
      refuseUpgrade(socket, '404 Not Found')
    } else if (!isAllowedOrigin(request.headers.origin)) {
      refuseUpgrade(socket, '403 Forbidden')
    } else {
      sockets.handleUpgrade(request, socket, head, (webSocket) => {
        webSocketChannel(webSocket as unknown as WebSocketLike).then(
          (channel) => {
            serveLink(hub, channel)
          },
          () => undefined,
        )
      })
    }
  })

  return {
    close: () => {
      closing ??= (async () => {
        const open = [...sockets.clients]
        open.forEach((client) => {
          client.close()
        })
        let timer: NodeJS.Timeout | undefined
        const grace = new Promise<void>((resolve) => {
          timer = setTimeout(resolve, CLOSE_GRACE_MS)
        })
        const ended = Promise.all(
          open.map(
            (client) =>
              new Promise<void>((resolve) => {
                if (client.readyState === client.CLOSED) {
                  resolve()
                } else {
                  client.once('close', () => {
                    resolve()
                  })
                }
              }),
          ),
        )
        await Promise.race([ended, grace])
        clearTimeout(timer)
        sockets.clients.forEach((client) => {
          client.terminate()
        })
        await new Promise<void>((resolve) => {
          sockets.close(() => {
            resolve()
          })
        })
      })()
      return closing
    },
  }
}
