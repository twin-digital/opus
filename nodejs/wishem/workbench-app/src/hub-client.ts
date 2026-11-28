import { connectLink } from '@thrashplay/wishem-hub'
import type { Port, WebSocketLike } from '@thrashplay/wishem-hub'

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

/** Opens a link as one output subsystem, and gives the port of each link to `onPort` after its `welcome`. */
export const connectHub = (options: HubClientOptions): HubClient => {
  const {
    url = defaultUrl(),
    createSocket = (address: string) => new WebSocket(address),
    firstDelayMs,
    maxDelayMs,
    onPort,
  } = options
  let closed = false

  const client = connectLink({
    url,
    createSocket,
    firstDelayMs,
    maxDelayMs,
    subsystems: [{ prefix: 'page', kind: 'output' }],
    onLink: ([port]) => {
      try {
        onPort(port)
      } catch (cause) {
        console.error('wishem: onPort failed.', cause)
      }
    },
    onDown: () => {
      console.warn('wishem: the hub is not reachable. The page tries again.')
    },
    onRefused: (cause) => {
      console.error(`wishem: the hub refused the link (${cause.reason}). ${cause.message}`)
    },
    onError: (cause) => {
      console.error('wishem: a listener of the link failed.', cause)
    },
  })

  const onPageHide = () => {
    close()
  }

  const close = () => {
    if (closed) {
      return
    }
    closed = true
    window.removeEventListener('pagehide', onPageHide)
    client.close()
  }

  // A page that is left or reloaded ends the link, and that is not a failure of the hub.
  window.addEventListener('pagehide', onPageHide)
  return { close }
}
