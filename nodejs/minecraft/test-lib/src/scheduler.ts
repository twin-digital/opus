/**
 * `system` scheduling: `run`, `runTimeout`, `runInterval` and `clearRun` record a callback against
 * a tick, `currentTick` starts at 0, and nothing executes until a test calls `advanceTicks`. The
 * library starts no timer and awaits nothing.
 */

import type * as MC from '@minecraft/server'

import type { ServerLike } from './create-server.js'
import { InvalidArgumentError } from './errors.js'
import { registerBehaviour } from './runtime/member.js'
import { dataOf, serverOf, type ScheduledRun, type ServerState } from './runtime/state.js'

/** The state behind the `system` fake. */
export interface SystemData {
  readonly server: ServerState
  readonly afterEvents: MC.SystemAfterEvents
  readonly beforeEvents: MC.SystemBeforeEvents
}

/** Records a callback against the tick it is due on, and hands back the handle that cancels it. */
const schedule = (fake: object, kind: ScheduledRun['kind'], callback: () => void, interval: number): number => {
  const server = serverOf(fake)
  const handle = server.nextRunHandle
  server.nextRunHandle += 1
  server.scheduled.push({
    handle,
    kind,
    dueTick: server.currentTick + interval,
    interval,
    callback,
    cancelled: false,
  })
  return handle
}

// ---------------------------------------------------------------------------
// Behaviour
// ---------------------------------------------------------------------------

registerBehaviour('System', {
  afterEvents: (fake: object) => dataOf<SystemData>(fake).afterEvents,
  beforeEvents: (fake: object) => dataOf<SystemData>(fake).beforeEvents,
  currentTick: (fake: object) => serverOf(fake).currentTick,

  run: (fake: object, callback: () => void) => schedule(fake, 'run', callback, 1),
  // An omitted delay or interval is one tick: a bare runTimeout is a run, a bare runInterval repeats.
  runTimeout: (fake: object, callback: () => void, tickDelay?: number) =>
    schedule(fake, 'timeout', callback, tickDelay ?? 1),
  runInterval: (fake: object, callback: () => void, tickInterval?: number) =>
    schedule(fake, 'interval', callback, tickInterval ?? 1),

  clearRun: (fake: object, runId: number) => {
    const { scheduled } = serverOf(fake)
    const index = scheduled.findIndex((run) => run.handle === runId)
    if (index >= 0) {
      // Flagged as well as dropped: an advance may be part-way through the tick this run was due on.
      scheduled[index].cancelled = true
      scheduled.splice(index, 1)
    }
  },
})

// ---------------------------------------------------------------------------
// Free functions
// ---------------------------------------------------------------------------

/**
 * Runs the callbacks scheduled up to `count` ticks ahead. The advance steps one tick at a time,
 * incrementing `currentTick` and then running every callback due at that tick in the order it was
 * scheduled, before it steps again — so an advance runs every intervening tick's callbacks, not
 * only those due on the tick it lands on.
 *
 * A callback that throws propagates out of the advance: the engine's behaviour here is unobserved,
 * and swallowing it would hide the test's own bug.
 */
export const advanceTicks = (server: ServerLike, count: number): void => {
  if (!Number.isInteger(count) || count < 0) {
    throw new InvalidArgumentError(
      `Invalid value passed to argument [1]. Expected a non-negative whole number of ticks, received ${String(count)}`,
    )
  }
  const state = serverOf(server.world)
  for (let step = 0; step < count; step += 1) {
    state.currentTick += 1
    // Read once per tick: a callback scheduling another leaves it due on a later tick, not this one.
    const due = state.scheduled.filter((run) => run.dueTick === state.currentTick)
    for (const run of due) {
      if (run.cancelled) {
        continue
      }
      if (run.kind === 'interval') {
        run.dueTick = state.currentTick + run.interval
      } else {
        const index = state.scheduled.indexOf(run)
        if (index >= 0) {
          state.scheduled.splice(index, 1)
        }
      }
      run.callback()
    }
  }
}
