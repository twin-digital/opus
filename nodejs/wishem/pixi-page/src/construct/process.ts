import { startClock } from '@thrashplay/wishem-clock'
import type { ClockTimer } from '@thrashplay/wishem-clock'
import { serveHub } from '@thrashplay/wishem-host-nodejs'
import type { Hub } from '@thrashplay/wishem-hub'
import { createPixiHub } from './create-hub.ts'
import { STEP_MS } from './model.ts'

export interface PixiConstructOptions {
  /** Use 0 to let the system select a port. */
  port: number
  /** Default `false`. */
  paused?: boolean
  /** For tests. Default: `setInterval` and `Date.now`. */
  timer?: ClockTimer
  now?: () => number
  /** Default: write to the terminal. */
  log?: (line: string) => void
}

export interface PixiConstruct {
  readonly url: string
  readonly linkUrl: string
  readonly hub: Hub
  /** Stops the clock, the hub, and the server. Gives the same promise on each call. */
  close(): Promise<void>
}

const logToTerminal = (line: string): void => {
  console.log(line)
}

/**
 * Starts the hub, serves its link on 127.0.0.1, and starts the clock.
 * Rejects with the error of the listen (for example `EADDRINUSE`) and starts no hub and no clock.
 */
export const startPixiConstruct = async (options: PixiConstructOptions): Promise<PixiConstruct> => {
  const log = options.log ?? logToTerminal
  const hub = createPixiHub({
    running: options.paused !== true,
    onError: (error) => {
      log(`wishem: ${error instanceof Error ? error.message : String(error)}`)
    },
  })
  const server = await serveHub(hub, { port: options.port })

  let clock: ReturnType<typeof startClock>
  let clockPort: ReturnType<Hub['attach']>
  try {
    hub.start()
    clockPort = hub.attach({ id: 'clock', kind: 'input' })
    clock = startClock(clockPort, {
      stepMs: STEP_MS,
      ...(options.timer === undefined ? {} : { timer: options.timer }),
      ...(options.now === undefined ? {} : { now: options.now }),
    })
  } catch (error) {
    await server.close()
    throw error
  }

  let closing: Promise<void> | undefined

  return {
    url: server.url,
    linkUrl: server.linkUrl,
    hub,
    close: () => {
      closing ??= (async () => {
        clock.stop()
        clockPort.close()
        await server.close()
      })()
      return closing
    },
  }
}
