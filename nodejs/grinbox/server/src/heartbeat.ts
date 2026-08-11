/**
 * The daemon's one heartbeat (d-gzv0jty7). A single croner job wakes on
 * `config.heartbeatSeconds` and calls each registered tick in turn: the poll
 * scheduler's due-Account sweep, the digest scheduler's due-occurrence sweep,
 * and the pending-Archive sweep. No scheduler keeps a timer of its own, and
 * nothing is scheduled per Account, Edition, or Message.
 *
 * Ticks run sequentially within a beat and a throwing tick does not stop the
 * ones after it. Each tick owns its own overlap guard, so a beat that arrives
 * while a previous one is still working is not itself serialized here —
 * croner's `protect` skips it.
 */

import { Cron } from 'croner'

/** One unit of scheduled work the heartbeat wakes. */
export interface HeartbeatTick {
  /** Name used in the log line when the tick throws. */
  readonly name: string
  run(): Promise<unknown>
}

export interface HeartbeatDeps {
  /** Beat cadence in seconds (`config.heartbeatSeconds`). */
  readonly heartbeatSeconds: number
  readonly ticks: readonly HeartbeatTick[]
}

export interface Heartbeat {
  /** Run every tick once, in order. Exposed so tests drive beats directly. */
  beat(): Promise<void>
  /** Begin beating. Idempotent. */
  start(): void
  /** Stop beating. Idempotent; does not await an in-flight beat. */
  stop(): void
}

/**
 * Build the croner pattern for a beat of `seconds`. croner's seconds field caps
 * a step ("slash-n") at 60, so a sub-minute beat uses a seconds step and a beat
 * of whole minutes uses a minutes step. Anything else (e.g. 90s) rounds to the
 * nearest whole minute — a coarser-but-valid heartbeat beats a pattern croner
 * rejects, which would crash `start()`.
 */
export function heartbeatCronPattern(seconds: number): string {
  if (seconds < 60) {
    return `*/${seconds} * * * * *`
  }
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes >= 60) {
    // A multi-hour beat is unusual; fall back to hourly rather than risk an
    // out-of-range minutes step.
    return '0 0 * * * *'
  }
  return `0 */${minutes} * * * *`
}

export function createHeartbeat(deps: HeartbeatDeps): Heartbeat {
  const { heartbeatSeconds, ticks } = deps
  let job: Cron | null = null

  async function beat(): Promise<void> {
    for (const tick of ticks) {
      try {
        await tick.run()
      } catch (err) {
        console.error(`[grinbox][heartbeat] ${tick.name} tick error`, err)
      }
    }
  }

  function start(): void {
    if (job !== null) {
      return
    }
    job = new Cron(heartbeatCronPattern(heartbeatSeconds), { protect: true }, () => {
      void beat()
    })
  }

  function stop(): void {
    if (job !== null) {
      job.stop()
      job = null
    }
  }

  return { beat, start, stop }
}
