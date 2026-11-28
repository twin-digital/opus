import type { Channel } from '@thrashplay/wishem-hub'

/** The part of `process` and of `ChildProcess` that `ipcChannel` uses. */
export interface IpcEndpoint {
  send(message: object): boolean
  on(event: 'message', listener: (message: unknown) => void): void
  on(event: 'disconnect', listener: () => void): void
  off(event: 'message' | 'disconnect', listener: (...args: never[]) => void): void
}

const textsOf = (message: unknown): string[] | undefined => {
  if (typeof message !== 'object' || message === null) {
    return undefined
  }
  const { t, texts } = message as { t?: unknown; texts?: unknown }
  if (t !== 'link' || !Array.isArray(texts) || !texts.every((text) => typeof text === 'string')) {
    return undefined
  }
  return texts
}

/** A `Channel` of `@thrashplay/wishem-hub` on an IPC endpoint. The texts of one turn go in one message. */
export const ipcChannel = (endpoint: IpcEndpoint): Channel => {
  let listener: ((text: string) => void) | undefined
  let closeListener: (() => void) | undefined
  let closed = false
  let closeNotified = false
  let outgoing: string[] = []
  const waiting: string[] = []

  const onMessage = (message: unknown) => {
    const texts = textsOf(message)
    if (closed || texts === undefined) {
      return
    }
    if (listener === undefined) {
      waiting.push(...texts)
      return
    }
    for (const text of texts) {
      listener(text)
    }
  }

  const notifyClose = () => {
    if (!closeNotified) {
      closeNotified = true
      closeListener?.()
    }
  }

  const onDisconnect = () => {
    closed = true
    notifyClose()
  }

  endpoint.on('message', onMessage)
  endpoint.on('disconnect', onDisconnect)

  return {
    send: (text) => {
      if (closed) {
        return
      }
      outgoing.push(text)
      if (outgoing.length === 1) {
        queueMicrotask(() => {
          const texts = outgoing
          outgoing = []
          if (!closed && texts.length > 0) {
            endpoint.send({ t: 'link', texts })
          }
        })
      }
    },
    onMessage: (next) => {
      listener = next
      for (const text of waiting.splice(0)) {
        next(text)
      }
    },
    onClose: (next) => {
      closeListener = next
      if (closeNotified) {
        void Promise.resolve().then(next)
      }
    },
    close: () => {
      if (closed) {
        return
      }
      closed = true
      outgoing = []
      endpoint.off('message', onMessage)
      endpoint.off('disconnect', onDisconnect)
      notifyClose()
    },
  }
}
