import { HubConfigurationError, InputRefusedError } from './errors.js'
import { isId, isInputType } from './names.js'
import type {
  Hub,
  HubEvent,
  HubOptions,
  HubStatus,
  Input,
  InputProblem,
  IoSubsystem,
  JoinedState,
  ModelSubsystem,
  Port,
  RecordedInput,
  SubmitResult,
} from './types.js'

const reject = (reason: 'not-permitted' | 'not-running' | 'unknown-type', problems: InputProblem[] = []) =>
  ({ ok: false, reason, problems }) satisfies SubmitResult

const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(deepFreeze)
  }
  return value
}

const validateSubsystems = (subsystems: readonly ModelSubsystem[]) => {
  const ids = new Set<string>()
  for (const subsystem of subsystems) {
    if (!isId(subsystem.id)) {
      throw new HubConfigurationError(`The subsystem ID "${subsystem.id}" is not correct.`)
    }
    if (ids.has(subsystem.id)) {
      throw new HubConfigurationError(`The subsystem ID "${subsystem.id}" is in use.`)
    }
    ids.add(subsystem.id)
    for (const type of subsystem.inputs) {
      if (!isInputType(type)) {
        throw new HubConfigurationError(`The input type "${type}" of "${subsystem.id}" is not correct.`)
      }
    }
  }
}

/** Copies the payload as JSON data and freezes the copy. Throws when JSON cannot hold the payload. */
const copyPayload = (payload: unknown): unknown => {
  const json = JSON.stringify(payload) as string | undefined
  return json === undefined ? null : deepFreeze(JSON.parse(json) as unknown)
}

/** Makes a hub. Throws a `HubConfigurationError` when the list of model subsystems is not correct. */
export const createHub = (options: HubOptions): Hub => {
  const { subsystems } = options
  validateSubsystems(subsystems)

  let status: HubStatus = 'created'
  let joined: JoinedState = Object.freeze(Object.fromEntries(subsystems.map((s) => [s.id, s.initial])))
  const record: RecordedInput[] = []
  const attached = new Map<string, Set<(event: HubEvent) => void>>()

  const apply = (source: string, input: Input): SubmitResult => {
    const targets = subsystems.filter((subsystem) => subsystem.inputs.includes(input.type))
    if (targets.length === 0) {
      return reject('unknown-type')
    }

    let payload: unknown
    try {
      payload = copyPayload(input.payload)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The payload is not JSON data.'
      return { ok: false, reason: 'invalid', problems: [{ message, path: ['payload'] }] }
    }

    const recorded: RecordedInput = Object.freeze({ seq: record.length + 1, source, type: input.type, payload })
    const next: Record<string, unknown> = { ...joined }
    try {
      for (const subsystem of targets) {
        next[subsystem.id] = subsystem.apply(next[subsystem.id], recorded, { read: () => Object.freeze({ ...next }) })
      }
    } catch (error) {
      if (error instanceof InputRefusedError) {
        return { ok: false, reason: 'invalid', problems: error.problems }
      }
      throw error
    }

    joined = Object.freeze(next)
    record.push(recorded)
    return { ok: true, seq: recorded.seq }
  }

  const attach = (subsystem: IoSubsystem): Port => {
    if (status === 'stopped') {
      throw new Error('The hub is stopped.')
    }
    if (!isId(subsystem.id)) {
      throw new HubConfigurationError(`The subsystem ID "${subsystem.id}" is not correct.`)
    }
    if (attached.has(subsystem.id) || subsystems.some((model) => model.id === subsystem.id)) {
      throw new HubConfigurationError(`The subsystem ID "${subsystem.id}" is in use.`)
    }

    const listeners = new Set<(event: HubEvent) => void>()
    attached.set(subsystem.id, listeners)

    return {
      subsystem,
      read: () => joined,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      submit: (input) => {
        if (subsystem.kind !== 'input') {
          return Promise.resolve(reject('not-permitted'))
        }
        if (status !== 'running') {
          return Promise.resolve(reject('not-running'))
        }
        try {
          return Promise.resolve(apply(subsystem.id, input))
        } catch (error) {
          return Promise.reject(error instanceof Error ? error : new Error(String(error)))
        }
      },
      close: () => {
        listeners.clear()
        attached.delete(subsystem.id)
      },
    }
  }

  return {
    get status() {
      return status
    },
    start: () => {
      if (status !== 'created') {
        throw new Error(`The hub cannot start from the status "${status}".`)
      }
      status = 'running'
    },
    stop: () => {
      if (status !== 'running') {
        throw new Error(`The hub cannot stop from the status "${status}".`)
      }
      status = 'stopped'
    },
    attach,
    read: () => joined,
    record: () => record.slice(),
  }
}
