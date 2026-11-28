import type { EventEmitter } from 'node:events'

type Target = Pick<EventEmitter, 'emit' | 'on'>
type CodedError = Error & { code?: string }
interface Answer {
  end?: (text?: string) => void
  headersSent?: boolean
  req?: unknown
  writeHead?: (status: number, headers: Record<string, string>) => void
}
type Listener = (error: CodedError) => void

/**
 * Makes a `configure` hook for the Vite proxy of the link. A refused connection prints one short line.
 * A connection that the construct resets prints one short line. A reset of the page prints nothing.
 * The hook prints a line again only after a link succeeds. The Vite handler gets each other error.
 * A plain HTTP request gets the status 502 with a short text.
 */
export const quietLinkErrors = (linkUrl: string, log: (line: string) => void) => (proxy: Target) => {
  let reported = false
  const constructSockets = new Set<{ errored?: Error | null }>()
  const emit = proxy.emit.bind(proxy)
  proxy.on('open', (socket: EventEmitter & { errored?: Error | null }) => {
    reported = false
    constructSockets.add(socket)
    socket.once('close', () => constructSockets.delete(socket))
  })
  proxy.emit = (event: string | symbol, ...args: unknown[]) => {
    if (event === 'proxyReqWs') {
      // Vite prints a stack trace for each error of the page socket. A reset of the page is not a fault.
      const page = args[2] as EventEmitter
      const before = new Set(page.listeners('error'))
      const result = emit(event, ...args)
      const added = page.listeners('error').filter((listener) => !before.has(listener)) as Listener[]
      added.forEach((listener) => {
        page.removeListener('error', listener)
      })
      page.on('error', (error: CodedError) => {
        if (error.code !== 'ECONNRESET') {
          added.forEach((listener) => {
            listener(error)
          })
        }
      })
      return result
    }
    const error = event === 'error' ? (args[0] as CodedError | undefined) : undefined
    const code = error?.code
    if (code !== 'ECONNREFUSED' && code !== 'ECONNRESET') {
      return emit(event, ...args)
    }
    const answer = args[2] as Answer
    const isHttp = answer.req !== undefined
    const text =
      code === 'ECONNREFUSED' ?
        `wishem: no construct at ${linkUrl}; the page connects again`
      : `wishem: the link to ${linkUrl} closed; the page connects again`
    const fromConstruct =
      code === 'ECONNREFUSED' || isHttp || [...constructSockets].some((socket) => socket.errored === error)
    if (fromConstruct && !reported) {
      reported = true
      log(text)
    }
    if (isHttp) {
      if (answer.headersSent !== true) {
        answer.writeHead?.(502, { 'Content-Type': 'text/plain' })
      }
      answer.end?.(text)
    } else {
      // Close the socket of the page, as the Vite handler does.
      answer.end?.()
    }
    return true
  }
}
