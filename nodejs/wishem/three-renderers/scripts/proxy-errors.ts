import type { EventEmitter } from 'node:events'

/**
 * Makes a `configure` hook for the Vite proxy of the link. A refused or reset connection prints one short line.
 * The hook prints the line again only after a link succeeds. The Vite handler gets each other error.
 */
export const quietLinkErrors =
  (linkUrl: string, log: (line: string) => void) => (proxy: Pick<EventEmitter, 'emit' | 'on'>) => {
    let reported = false
    const emit = proxy.emit.bind(proxy)
    proxy.on('open', () => {
      reported = false
    })
    proxy.emit = (event: string | symbol, ...args: unknown[]) => {
      const code = event === 'error' ? (args[0] as { code?: string } | undefined)?.code : undefined
      if (code !== 'ECONNREFUSED' && code !== 'ECONNRESET') {
        return emit(event, ...args)
      }
      if (!reported) {
        reported = true
        log(
          code === 'ECONNREFUSED' ?
            `wishem: no construct at ${linkUrl}; the page connects again`
          : `wishem: the link to ${linkUrl} closed; the page connects again`,
        )
      }
      // Close the socket of the page, as the Vite handler does.
      ;(args[2] as { end?: () => void } | undefined)?.end?.()
      return true
    }
  }
