/**
 * `system` scheduling: `run`, `runTimeout`, `runInterval` and `clearRun` record a callback against
 * a tick, `currentTick` starts at 0, and nothing executes until a test calls `advanceTicks`. The
 * library starts no timer and awaits nothing.
 */

import type * as MC from '@minecraft/server'

import type { ServerLike } from './create-server.js'
import type { ServerState } from './runtime/state.js'

/** The state behind the `system` fake. */
export interface SystemData {
  readonly server: ServerState
  readonly afterEvents: MC.SystemAfterEvents
  readonly beforeEvents: MC.SystemBeforeEvents
}

/**
 * Runs the callbacks scheduled up to `count` ticks ahead. The advance steps one tick at a time,
 * incrementing `currentTick` and then running every callback due at that tick in the order it was
 * scheduled, before it steps again — so an advance runs every intervening tick's callbacks, not
 * only those due on the tick it lands on.
 */
export const advanceTicks = (_server: ServerLike, _count: number): void => {
  throw new Error('tick advancing is not built yet')
}
