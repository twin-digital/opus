import { LinkRefusedError, openLink, webSocketChannel } from '@thrashplay/wishem-hub'
import type { Port, RemoteLink, WebSocketLike } from '@thrashplay/wishem-hub'

export interface HubClient {
  /** Closes the link and opens no new one. A second call does nothing. */
  close(): void
}

export interface HubClientOptions {
  /** Default: `/link` on the origin of the page, with `ws:` or `wss:`. */
  url?: string
  /** Default: `(url) => new WebSocket(url)`. */
  createSocket?: (url: string) => WebSocketLike
  /** Default 500. */
  firstDelayMs?: number
  /** Default 5000. */
  maxDelayMs?: number
  /** Called after each `welcome` with the remote port of the new link. */
  onPort: (port: Port) => void
}

const defaultUrl = () => `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/link`

const makeId = () =>
  `page-${Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('')}`

/** Opens a link as one output subsystem, and gives the port of each link to `onPort` after its `welcome`. */
export const connectHub = (options: HubClientOptions): HubClient => {
  const {
    url = defaultUrl(),
    createSocket = (address: string) => new WebSocket(address),
    firstDelayMs = 500,
    maxDelayMs = 5000,
    onPort,
  } = options
  let link: RemoteLink | undefined
  let socket: WebSocketLike | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let delay = firstDelayMs
  let warned = false
  let refusalWritten = false
  let closed = false

  const report = (message: string, cause: unknown) => {
    console.error(message, cause)
  }

  const onPageHide = () => {
    client.close()
  }

  const client: HubClient = {
    close: () => {
      if (closed) {
        return
      }
      closed = true
      window.removeEventListener('pagehide', onPageHide)
      clearTimeout(timer)
      link?.close()
      socket?.close()
    },
  }

  const isClosed = () => closed

  const warnOnce = () => {
    if (!warned) {
      warned = true
      console.warn('wishem: the hub is not reachable. The page tries again.')
    }
  }

  const wait = () => {
    timer = setTimeout(() => {
      timer = undefined
      void attempt()
    }, delay)
    delay = Math.min(delay * 2, maxDelayMs)
  }

  const attempt = async () => {
    const id = makeId()
    try {
      const current = createSocket(url)
      socket = current
      const channel = await webSocketChannel(current)
      if (isClosed()) {
        channel.close()
        return
      }
      const next = await openLink(channel, [{ id, kind: 'output' }], {
        onError: (cause) => {
          report('wishem: a listener of the link failed.', cause)
        },
      })
      if (isClosed()) {
        next.close()
        return
      }
      const port = next.ports[id]
      link = next
      delay = firstDelayMs
      warned = false
      refusalWritten = false
      void next.closed.then(() => {
        if (link !== next) {
          return
        }
        link = undefined
        if (!closed) {
          warnOnce()
          wait()
        }
      })
      try {
        onPort(port)
      } catch (cause) {
        report('wishem: onPort failed.', cause)
      }
    } catch (cause) {
      if (closed) {
        return
      }
      if (cause instanceof LinkRefusedError && !refusalWritten) {
        refusalWritten = true
        console.error(`wishem: the hub refused the link (${cause.reason}). ${cause.message}`)
      }
      warnOnce()
      wait()
    } finally {
      socket = undefined
    }
  }

  // A page that is left or reloaded ends the link, and that is not a failure of the hub.
  window.addEventListener('pagehide', onPageHide)
  void attempt()
  return client
}
