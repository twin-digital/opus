import type { Port } from '@thrashplay/wishem-hub'
import { TIME_ID, timeInputs } from './time.js'

export interface ClockTimer {
  /** Calls `callback` at the interval. Returns a function that stops the calls. */
  start(callback: () => void, intervalMs: number): () => void
}

export interface ClockOptions {
  /** The length of one tick in milliseconds. Default 50. */
  stepMs?: number
  /** Default 5. */
  maxTicksPerCall?: number
  /** Default: `setInterval`. */
  timer?: ClockTimer
  /** Real time in milliseconds. Default: `Date.now`. */
  now?: () => number
}

export interface Clock {
  stop(): void
}

const defaultTimer: ClockTimer = {
  start: (callback, intervalMs) => {
    const handle = setInterval(callback, intervalMs)
    return () => {
      clearInterval(handle)
    }
  },
}

const requirePositive = (name: string, value: number): void => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`The option ${name} must be a finite number larger than 0.`)
  }
}

const isRunning = (part: unknown): boolean =>
  typeof part === 'object' && part !== null && (part as { running?: unknown }).running === true

/**
 * Starts a clock on the port of an input subsystem. While the part `time` has `running` set to `true`,
 * the clock sends one tick of `stepMs` for each `stepMs` of real time.
 *
 * Throws when the port is not the port of an input subsystem, when the joined state has no part `time`,
 * or when an option is not correct.
 */
export const startClock = (port: Port, options: ClockOptions = {}): Clock => {
  const { stepMs = 50, maxTicksPerCall = 5, timer = defaultTimer, now = Date.now } = options
  requirePositive('stepMs', stepMs)
  requirePositive('maxTicksPerCall', maxTicksPerCall)
  if (port.subsystem.kind !== 'input') {
    throw new Error('The clock needs the port of an input subsystem.')
  }
  if (!(TIME_ID in port.read())) {
    throw new Error(`The joined state has no part "${TIME_ID}".`)
  }

  let stopped = false
  const isStopped = (): boolean => stopped
  let last = now()

  const onCall = () => {
    if (isStopped()) {
      return
    }
    if (!isRunning(port.read()[TIME_ID])) {
      last = now()
      return
    }
    const current = now()
    const due = Math.floor((current - last) / stepMs)
    const count = Math.min(due, maxTicksPerCall)
    for (let i = 0; i < count && !isStopped(); i++) {
      port.submit(timeInputs.advance(stepMs)).catch(() => undefined)
    }
    last = due > maxTicksPerCall ? current : last + due * stepMs
  }

  const removeListener = port.subscribe((event) => {
    if (event.type === 'stopping') {
      stop()
    } else if (event.type === 'applied' && event.input.type === 'time/set-running') {
      last = now()
    }
  })

  const stopTimer = timer.start(onCall, stepMs)

  const stop = (): void => {
    if (isStopped()) {
      return
    }
    stopped = true
    stopTimer()
    removeListener()
  }

  return { stop }
}
