import { InputRefusedError, type Input, type ModelSubsystem } from '@thrashplay/wishem-hub'

export const TIME_ID = 'time'

export interface TimePart {
  /** The time of the construct in milliseconds. */
  readonly now: number
  readonly ticks: number
  readonly running: boolean
}

export interface TimeOptions {
  /** Default `true`. */
  running?: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const refuse = (message: string, field: string): never => {
  throw new InputRefusedError([{ message, path: [field] }])
}

/** The time subsystem. Its part holds the time, the count of ticks, and the `running` value. */
export const createTime = (options: TimeOptions = {}): ModelSubsystem<TimePart> => ({
  id: TIME_ID,
  inputs: ['time/advance', 'time/set-running'],
  initial: { now: 0, ticks: 0, running: options.running ?? true },
  apply: (part, input) => {
    const payload = input.payload
    if (input.type === 'time/advance') {
      const ms = isRecord(payload) ? payload.ms : undefined
      if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) {
        return refuse('The length must be a finite number larger than 0.', 'ms')
      }
      return { ...part, now: part.now + ms, ticks: part.ticks + 1 }
    }
    const running = isRecord(payload) ? payload.running : undefined
    if (typeof running !== 'boolean') {
      return refuse('The value must be true or false.', 'running')
    }
    return running === part.running ? part : { ...part, running }
  },
})

export const timeInputs = {
  /** The tick `time/advance`. */
  advance: (ms: number): Input => ({ type: 'time/advance', payload: { ms } }),
  /** The input `time/set-running`. */
  setRunning: (running: boolean): Input => ({ type: 'time/set-running', payload: { running } }),
}
