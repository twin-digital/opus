import { REWIND_INPUT_TYPE, type Port } from '@thrashplay/wishem-hub'
import { TIME_ID, timeInputs } from './time.js'

// Timer functions that Node.js and a web browser both give, declared so that no Node.js types are needed.
declare function setInterval(callback: () => void, intervalMs: number): unknown
declare function clearInterval(handle: unknown): void

export interface ClockTimer {
  /** Calls `callback` at the interval. Returns a function that stops the calls. */
  start(callback: () => void, intervalMs: number): () => void
}

export interface ClockOptions {
  /** The length of one tick in milliseconds. Default 50. */
  stepMs?: number
  /** An integer. Default 5. */
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
  if (!Number.isInteger(maxTicksPerCall)) {
    throw new Error('The option maxTicksPerCall must be an integer.')
  }
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
    let sent = 0
    while (sent < count && !isStopped() && isRunning(port.read()[TIME_ID])) {
      port.submit(timeInputs.advance(stepMs)).catch(() => undefined)
      sent += 1
    }
    // A stop or a pause during the loop has already set the state of `last`.
    if (sent < count) {
      return
    }
    last = due > maxTicksPerCall ? current : last + due * stepMs
  }

  const removeListener = port.subscribe((event) => {
    if (event.type === 'stopping') {
      stop()
    } else if (
      event.type === 'started' ||
      event.input.type === 'time/set-running' ||
      event.input.type === REWIND_INPUT_TYPE
    ) {
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
