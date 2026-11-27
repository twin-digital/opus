import type { Container } from 'pixi.js'
import { startRenderer } from '@thrashplay/wishem-renderer-pixi'
import type { PixiRenderer, Viewport } from '@thrashplay/wishem-renderer-pixi'
import type { Port } from '@thrashplay/wishem-hub'
import { attachKeys } from './keys.js'
import type { LinkStatus } from './status.js'
import { views } from './views.js'

export interface PageLinkHandlers {
  /** The output port, then the input port. */
  onLink(ports: readonly Port[]): void
  onDown(): void
}

export type PageConnector = (handlers: PageLinkHandlers) => { close(): void }

export interface PageOptions {
  stage: Container
  viewport: Viewport
  /** Gets the key events. */
  keys: EventTarget
  connect: PageConnector
  onStatus: (status: LinkStatus) => void
  onError?: (error: unknown) => void
}

export interface PixiPage {
  /** Closes the link client, removes the keys, stops the renderer, and closes the ports. A second call does nothing. */
  stop(): void
}

const reportToConsole = (error: unknown): void => {
  console.error(error)
}

/** Draws the output port of each link, and sends the keys through the input port of the link. */
export const startPage = (options: PageOptions): PixiPage => {
  const { stage, viewport, keys, connect, onStatus, onError = reportToConsole } = options
  let stopped = false
  const isStopped = () => stopped
  let linkNumber = 0
  let renderer: PixiRenderer | undefined
  let ports: readonly Port[] = []
  let input: Port | undefined

  const status = (next: LinkStatus): void => {
    try {
      onStatus(next)
    } catch (error) {
      onError(error)
    }
  }

  const release = (): void => {
    renderer?.stop()
    renderer = undefined
    input = undefined
    ports.forEach((port) => {
      port.close()
    })
    ports = []
  }

  const detachKeys = attachKeys(keys, () => input)

  status({ state: 'connecting' })

  const client = connect({
    onLink: (given) => {
      if (stopped) {
        given.forEach((port) => {
          port.close()
        })
        return
      }
      release()
      linkNumber += 1
      ports = given
      input = given[1]
      status({ state: 'connected', link: linkNumber })
      if (isStopped()) {
        return
      }
      renderer = startRenderer({ port: given[0], views, stage, viewport, onError })
    },
    onDown: () => {
      if (stopped) {
        return
      }
      input = undefined
      status({ state: 'down', link: linkNumber })
    },
  })

  return {
    stop: () => {
      if (stopped) {
        return
      }
      stopped = true
      client.close()
      detachKeys()
      release()
    },
  }
}
