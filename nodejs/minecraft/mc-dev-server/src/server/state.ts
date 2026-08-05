import { seedsOf } from './seed-record.js'

import type { ComposeClient } from '../docker/compose.js'
import type { ObservedServer } from '../deploy/plan.js'
import type { RunningServer } from '../start/ladder.js'
import type { WorldsRecord } from './seed-record.js'

/** Reads the level name out of the server's own configuration on the volume. */
export const levelNameFrom = (serverProperties: string): string | undefined => {
  for (const line of serverProperties.split('\n')) {
    const match = /^\s*level-name\s*=\s*(.*?)\s*$/.exec(line)
    if (match !== null) {
      return match[1]
    }
  }
  return undefined
}

/** Assembles what the ladder compares against, entirely from the running server. */
export const runningServerFrom = (input: {
  image: string
  port?: number
  serverProperties: string
  worlds: readonly string[]
  record: WorldsRecord
}): RunningServer => ({
  level: levelNameFrom(input.serverProperties) ?? '',
  image: input.image,
  ...(input.port === undefined ? {} : { port: input.port }),
  worlds: input.worlds,
  seeds: seedsOf(input.record),
})

/** Reads the running server: its container settings, its world, and the worlds the volume holds. */
export const readRunningServer = (_compose: ComposeClient): Promise<RunningServer | undefined> => {
  throw new Error('not implemented: readRunningServer')
}

/** Reads the pool contents and activation lists a reconcile compares against. */
export const readObservedServer = (_compose: ComposeClient, _level: string): Promise<ObservedServer> => {
  throw new Error('not implemented: readObservedServer')
}
