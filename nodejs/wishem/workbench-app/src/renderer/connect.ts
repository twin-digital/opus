import type { CoreReader, Snapshot } from '@thrashplay/wishem-core'

export interface CoreConnection extends CoreReader {
  close(): void
}

export interface ConnectOptions {
  /** The address of the stream. Default: `/snapshots`. */
  url?: string
}

/** Opens the snapshot stream of a core. Resolves after the first snapshot. */
export const connect = (options: ConnectOptions = {}): Promise<CoreConnection> =>
  new Promise((resolve) => {
    const source = new EventSource(options.url ?? '/snapshots')
    const listeners = new Set<(snapshot: Snapshot) => void>()
    let snapshot: Snapshot | undefined
    let lastText: string | undefined
    let warned = false

    const connection: CoreConnection = {
      getSnapshot: () => {
        if (!snapshot) {
          throw new Error('No snapshot has arrived.')
        }
        return snapshot
      },
      subscribe: (listener) => {
        // Wrap the listener so that two registrations of one function stay separate.
        const entry = (next: Snapshot): void => {
          listener(next)
        }
        listeners.add(entry)
        return () => {
          listeners.delete(entry)
        }
      },
      close: () => {
        source.close()
      },
    }

    source.addEventListener('snapshot', (event) => {
      const text = (event as MessageEvent<string>).data
      warned = false
      if (text === lastText) {
        return
      }

      let next: Snapshot
      try {
        next = JSON.parse(text) as Snapshot
      } catch (error) {
        console.error('wishem: the snapshot event is not valid JSON.', error)
        return
      }

      const isFirst = snapshot === undefined
      lastText = text
      snapshot = next
      if (isFirst) {
        resolve(connection)
      } else {
        for (const listener of [...listeners]) {
          listener(next)
        }
      }
    })

    source.addEventListener('error', () => {
      if (warned) {
        return
      }
      warned = true
      console.warn('wishem: the core is not reachable. The page tries again.')
    })
  })
