import { createTime, startClock } from '@thrashplay/wishem-clock'
import type { Clock, ClockTimer } from '@thrashplay/wishem-clock'
import { createStore } from '@thrashplay/wishem-core'
import type { Model } from '@thrashplay/wishem-core'
import { serveHub } from '@thrashplay/wishem-host-nodejs'
import { createHub } from '@thrashplay/wishem-hub'
import type { Hub, Port } from '@thrashplay/wishem-hub'
import { createUpdate } from '@thrashplay/wishem-update'
import type { NativeBehavior } from '@thrashplay/wishem-update'
import { CONSTRUCT_MANAGER_ID } from './ids.js'

const DEFAULT_STEP_MS = 50

export interface ProductConstructOptions {
  /** The ID in the construct list. */
  id: string
  model: Model
  /** The native behaviors of the product, run in each tick. Default: none. */
  behaviors?: readonly NativeBehavior[]
  /** The first `running` value of the part `time`. */
  running: boolean
  /** The port of the link. Default 0: the system selects a free port. */
  port?: number
  /** Default 50. */
  stepMs?: number
  /** For tests. Default: `setInterval` and `Date.now`. */
  timer?: ClockTimer
  now?: () => number
  onError?: (error: unknown) => void
}

export interface ProductConstruct {
  readonly id: string
  /** For example `ws://127.0.0.1:41377/link`. */
  readonly linkUrl: string
  readonly hub: Hub
  /** Stops the clock and the hub, closes each link, and releases the port. Gives the same promise on each call. */
  close(): Promise<void>
}

/**
 * Starts a hub with the parts `time` and `store`. The update subsystem runs the behaviors.
 * Serves the link on the port `port` (default: a port that the system selects), and starts a clock.
 * Only the source `construct-manager` can rewind the hub.
 * Rejects with the error of a step, and then holds no port and no timer.
 */
export const startProductConstruct = async (options: ProductConstructOptions): Promise<ProductConstruct> => {
  const stepMs = options.stepMs ?? DEFAULT_STEP_MS
  const update = createUpdate({ store: createStore({ model: options.model }), behaviors: options.behaviors ?? [] })
  const hub = createHub({
    subsystems: [createTime({ running: options.running, stepMs }), update],
    rewindSources: [CONSTRUCT_MANAGER_ID],
    ...(options.onError === undefined ? {} : { onError: options.onError }),
  })
  const server = await serveHub(hub, { port: options.port ?? 0 })

  let clock: Clock | undefined
  let clockPort: Port | undefined
  try {
    hub.start()
    clockPort = hub.attach({ id: 'clock', kind: 'input' })
    clock = startClock(clockPort, {
      stepMs,
      ...(options.timer === undefined ? {} : { timer: options.timer }),
      ...(options.now === undefined ? {} : { now: options.now }),
    })
  } catch (error) {
    clock?.stop()
    await server.close()
    throw error
  }

  let closing: Promise<void> | undefined

  return {
    id: options.id,
    linkUrl: server.linkUrl,
    hub,
    close: () => {
      closing ??= (async () => {
        try {
          clock.stop()
          clockPort.close()
        } finally {
          await server.close()
        }
      })()
      return closing
    },
  }
}
