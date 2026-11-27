/** A connection that carries text messages in order. Each channel has one message listener and one close listener. */
export interface Channel {
  send(text: string): void
  /** A message that arrives before the listener is registered waits for it. */
  onMessage(listener: (text: string) => void): void
  /** Runs one time when the connection ends, for each cause. */
  onClose(listener: () => void): void
  /** Does nothing when the channel is closed. */
  close(): void
}

/** The part of a WebSocket of the web platform that `webSocketChannel` uses. */
export interface WebSocketLike {
  /** 1 means open. */
  readonly readyState: number
  send(data: string): void
  close(): void
  addEventListener(type: 'open' | 'message' | 'close' | 'error', listener: (event: { data?: unknown }) => void): void
}

interface Endpoint {
  channel: Channel
  /** Gives a message to the listener, or holds it. */
  deliver(text: string): void
  /** Runs the close listener one time. */
  notifyClose(): void
}

const createEndpoint = (send: (text: string) => void, close: () => void): Endpoint => {
  let messageListener: ((text: string) => void) | undefined
  let closeListener: (() => void) | undefined
  let closeNotified = false
  const waiting: string[] = []

  return {
    channel: {
      send,
      close,
      onMessage: (listener) => {
        messageListener = listener
        for (const text of waiting.splice(0)) {
          listener(text)
        }
      },
      onClose: (listener) => {
        closeListener = listener
        if (closeNotified) {
          void Promise.resolve().then(listener)
        }
      },
    },
    deliver: (text) => {
      if (closeNotified) {
        return
      }
      if (messageListener === undefined) {
        waiting.push(text)
      } else {
        messageListener(text)
      }
    },
    notifyClose: () => {
      if (!closeNotified) {
        closeNotified = true
        closeListener?.()
      }
    },
  }
}

/** Makes two connected channels in memory. A message arrives in a later microtask. */
export const createChannelPair = (): [Channel, Channel] => {
  let closed = false
  const endpoints: [Endpoint, Endpoint] = [
    createEndpoint(
      (text) => {
        if (!closed) {
          void Promise.resolve().then(() => {
            endpoints[1].deliver(text)
          })
        }
      },
      () => {
        close()
      },
    ),
    createEndpoint(
      (text) => {
        if (!closed) {
          void Promise.resolve().then(() => {
            endpoints[0].deliver(text)
          })
        }
      },
      () => {
        close()
      },
    ),
  ]

  const close = () => {
    if (closed) {
      return
    }
    closed = true
    void Promise.resolve().then(() => {
      endpoints[0].notifyClose()
      endpoints[1].notifyClose()
    })
  }

  return [endpoints[0].channel, endpoints[1].channel]
}

/** Resolves when the socket is open. Rejects when the socket fails before it opens. */
export const webSocketChannel = (socket: WebSocketLike): Promise<Channel> =>
  new Promise<Channel>((resolve, reject) => {
    let open = socket.readyState === 1
    let closing = false
    const endpoint = createEndpoint(
      (text) => {
        if (!closing) {
          socket.send(text)
        }
      },
      () => {
        if (!closing) {
          closing = true
          socket.close()
        }
      },
    )

    socket.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        endpoint.deliver(event.data)
      }
    })
    socket.addEventListener('open', () => {
      open = true
      resolve(endpoint.channel)
    })
    const fail = () => {
      closing = true
      if (open) {
        endpoint.notifyClose()
      } else {
        reject(new Error('The socket closed before it opened.'))
      }
    }
    socket.addEventListener('close', fail)
    socket.addEventListener('error', fail)

    if (open) {
      resolve(endpoint.channel)
    }
  })
