import type { Port } from '../types.js'
import { webSocketChannel } from './channel.js'
import type { WebSocketLike } from './channel.js'
import { LinkRefusedError, openLink } from './open-link.js'
import type { RemoteLink } from './open-link.js'

// Globals that Node.js and a web browser both give, declared so that no Node.js types are needed.
declare function setTimeout(callback: () => void, delayMs: number): unknown
declare function clearTimeout(handle: unknown): void
declare const crypto: { getRandomValues: (array: Uint8Array) => Uint8Array }

export interface LinkClientSubsystem {
  /** The ID of the subsystem is `<prefix>-<16 hex><suffix>`. The ID stays the same for each link until a refusal with `id-in-use`. */
  prefix: string
  /** Default: empty. */
  suffix?: string
  kind: 'input' | 'output'
}

export interface ConnectLinkOptions {
  /** For example `ws://127.0.0.1:5174/link`. */
  url: string
  createSocket: (url: string) => WebSocketLike
  /** One or more. */
  subsystems: readonly LinkClientSubsystem[]
  /** Called after each `welcome`, with one remote port for each subsystem, in the order of `subsystems`. */
  onLink: (ports: readonly Port[]) => void
  /** Called one time when the client has no link: after the first attempt fails, or after a link ends. Not called after `close()`. */
  onDown?: () => void
  /** Called one time for each period with no link, for the first refusal. */
  onRefused?: (error: LinkRefusedError) => void
  /** Gets each error of a listener of the link, of `onLink`, and of `onDown`. */
  onError?: (error: unknown) => void
  /** Default 500. */
  firstDelayMs?: number
  /** Default 5000. */
  maxDelayMs?: number
}

export interface LinkClient {
  /** Closes the link and opens no new one. A second call does nothing. */
  close(): void
}

const makeHex = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte.toString(16).padStart(2, '0')).join('')

/** Opens a link at once, and opens a new link after each end, until `close()`. */
export const connectLink = (options: ConnectLinkOptions): LinkClient => {
  const {
    url,
    createSocket,
    subsystems,
    onLink,
    onDown,
    onRefused,
    onError,
    firstDelayMs = 500,
    maxDelayMs = 5000,
  } = options
  if (subsystems.length === 0) {
    throw new Error('The list of subsystems is empty.')
  }
  let link: RemoteLink | undefined
  let socket: WebSocketLike | undefined
  let timer: unknown
  let delay = firstDelayMs
  let down = false
  let refusalReported = false
  let closed = false
  const makeList = () => {
    const hex = makeHex()
    return subsystems.map(({ prefix, suffix = '', kind }) => ({ id: `${prefix}-${hex}${suffix}`, kind }))
  }
  let list = makeList()

  const report = (cause: unknown) => {
    try {
      onError?.(cause)
    } catch {
      // A failing onError changes nothing.
    }
  }

  const markDown = () => {
    if (down) {
      return
    }
    down = true
    try {
      onDown?.()
    } catch (cause) {
      report(cause)
    }
  }

  const isClosed = () => closed

  const wait = () => {
    timer = setTimeout(() => {
      timer = undefined
      void attempt()
    }, delay)
    delay = Math.min(delay * 2, maxDelayMs)
  }

  const attempt = async () => {
    const attempted = list
    try {
      const current = createSocket(url)
      socket = current
      const channel = await webSocketChannel(current)
      if (isClosed()) {
        channel.close()
        return
      }
      const next = await openLink(channel, attempted, { onError: report })
      if (isClosed()) {
        next.close()
        return
      }
      const ports = attempted.map(({ id }) => next.ports[id])
      link = next
      delay = firstDelayMs
      down = false
      refusalReported = false
      void next.closed.then(() => {
        if (link !== next) {
          return
        }
        link = undefined
        if (!closed) {
          markDown()
          wait()
        }
      })
      try {
        onLink(ports)
      } catch (cause) {
        report(cause)
      }
    } catch (cause) {
      if (closed) {
        return
      }
      if (cause instanceof LinkRefusedError && cause.reason === 'id-in-use') {
        list = makeList()
      }
      if (cause instanceof LinkRefusedError && !refusalReported) {
        refusalReported = true
        try {
          onRefused?.(cause)
        } catch (failure) {
          report(failure)
        }
      }
      markDown()
      wait()
    } finally {
      socket = undefined
    }
  }

  void attempt()
  return {
    close: () => {
      if (closed) {
        return
      }
      closed = true
      clearTimeout(timer)
      link?.close()
      socket?.close()
    },
  }
}
