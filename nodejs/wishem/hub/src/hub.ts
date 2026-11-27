import { HubConfigurationError, InputRefusedError } from './errors.js'
import { HUB_ID, isHubInputType, isId, isInputType } from './names.js'
import type {
  Checkpoint,
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

interface PortEntry {
  /** Each registration is one object, so one function can register two times. */
  registrations: Set<{ listener: (event: HubEvent) => void }>
  closed: boolean
}

interface QueuedInput {
  source: string
  input: Input
  resolve: (result: SubmitResult) => void
  reject: (error: Error) => void
}

const reject = (reason: 'not-permitted' | 'not-running' | 'unknown-type', problems: InputProblem[] = []) =>
  ({ ok: false, reason, problems }) satisfies SubmitResult

const deepFreeze = <T>(value: T): T => {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    Object.values(value).forEach(deepFreeze)
  }
  return value
}

/** A checkpoint is a valid start of the record when a replay from it can apply each input after it. */
const isValidStart = (_checkpoint: Checkpoint): boolean => true

const copySubsystem = (subsystem: ModelSubsystem): ModelSubsystem => ({
  id: subsystem.id,
  initial: subsystem.initial,
  apply: (part, input, context) => subsystem.apply(part, input, context),
  inputs: Object.freeze([...subsystem.inputs]),
})

type Applied = Extract<SubmitResult, { ok: false }> | { ok: true; recorded: RecordedInput }

const validateSubsystems = (subsystems: readonly ModelSubsystem[]) => {
  const ids = new Set<string>()
  for (const subsystem of subsystems) {
    if (!isId(subsystem.id)) {
      throw new HubConfigurationError(`The subsystem ID "${subsystem.id}" is not correct.`)
    }
    if (subsystem.id === HUB_ID) {
      throw new HubConfigurationError(`The subsystem ID "${HUB_ID}" is reserved for the hub.`)
    }
    if (ids.has(subsystem.id)) {
      throw new HubConfigurationError(`The subsystem ID "${subsystem.id}" is in use.`)
    }
    ids.add(subsystem.id)
    for (const type of subsystem.inputs) {
      if (!isInputType(type)) {
        throw new HubConfigurationError(`The input type "${type}" of "${subsystem.id}" is not correct.`)
      }
      if (isHubInputType(type)) {
        throw new HubConfigurationError(`The input type "${type}" of "${subsystem.id}" is reserved for the hub.`)
      }
    }
  }
}

const DEFAULT_CHECKPOINT_INTERVAL = 100
const DEFAULT_RECORD_LIMIT = 100_000

const validateLimits = (checkpointInterval: number, recordLimit: number) => {
  if (!Number.isInteger(checkpointInterval) || checkpointInterval < 1) {
    throw new HubConfigurationError('The option checkpointInterval must be a positive integer.')
  }
  if (!Number.isInteger(recordLimit) || recordLimit < 1) {
    throw new HubConfigurationError('The option recordLimit must be a positive integer.')
  }
  if (recordLimit < checkpointInterval) {
    throw new HubConfigurationError(
      `The option recordLimit (${recordLimit}) is smaller than the option checkpointInterval (${checkpointInterval}).`,
    )
  }
}

/** Copies the payload as JSON data and freezes the copy. Throws when JSON cannot hold the payload. */
const copyPayload = (payload: unknown): unknown => {
  if (payload === undefined) {
    return null
  }
  const json = JSON.stringify(payload) as string | undefined
  if (json === undefined) {
    throw new Error('The payload is not JSON data.')
  }
  return deepFreeze(JSON.parse(json) as unknown)
}

/** Makes a hub. Throws a `HubConfigurationError` when the list of model subsystems is not correct. */
export const createHub = (options: HubOptions): Hub => {
  const subsystems = options.subsystems.map(copySubsystem)
  validateSubsystems(subsystems)
  const checkpointInterval = options.checkpointInterval ?? DEFAULT_CHECKPOINT_INTERVAL
  const recordLimit = options.recordLimit ?? DEFAULT_RECORD_LIMIT
  validateLimits(checkpointInterval, recordLimit)

  let status: HubStatus = 'created'
  let joined: JoinedState = Object.freeze(Object.fromEntries(subsystems.map((s) => [s.id, s.initial])))
  const record: RecordedInput[] = []
  const checkpoints: Checkpoint[] = [Object.freeze({ seq: 0, state: joined })]
  const reportError = (error: unknown) => {
    try {
      options.onError?.(error)
    } catch {
      // A failing onError changes nothing.
    }
  }
  const attached = new Map<string, PortEntry>()
  const queue: QueuedInput[] = []
  let busy = false
  let stopRequested = false
  let lastSeq = 0

  const emit = (event: HubEvent) => {
    for (const entry of [...attached.values()]) {
      for (const registration of [...entry.registrations]) {
        if (!entry.registrations.has(registration)) {
          continue
        }
        try {
          registration.listener(event)
        } catch (error) {
          reportError(error)
        }
      }
    }
  }

  const handle = ({ source, input, resolve, reject: fail }: QueuedInput) => {
    try {
      const result = apply(source, input)
      if (result.ok) {
        emit({ type: 'applied', input: result.recorded })
        resolve({ ok: true, seq: result.recorded.seq })
      } else {
        resolve(result)
      }
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)))
    }
  }

  const completeStop = () => {
    emit({ type: 'stopping' })
    status = 'stopped'
    for (const queued of queue.splice(0)) {
      queued.resolve(reject('not-running'))
    }
  }

  const drain = () => {
    if (busy) {
      return
    }
    busy = true
    try {
      while (!stopRequested && queue.length > 0) {
        handle(queue.shift() as QueuedInput)
      }
      if (stopRequested) {
        completeStop()
      }
    } finally {
      busy = false
    }
  }

  const limitRecord = () => {
    if (lastSeq - checkpoints[0].seq <= recordLimit) {
      return
    }
    const index = checkpoints.findIndex((c) => lastSeq - c.seq <= recordLimit && isValidStart(c))
    if (index < 1) {
      return
    }
    record.splice(0, checkpoints[index].seq - checkpoints[0].seq)
    checkpoints.splice(0, index)
  }

  const apply = (source: string, input: Input): Applied => {
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

    const recorded: RecordedInput = Object.freeze({ seq: lastSeq + 1, source, type: input.type, payload })
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
    lastSeq = recorded.seq
    if (lastSeq % checkpointInterval === 0) {
      checkpoints.push(Object.freeze({ seq: lastSeq, state: joined }))
    }
    limitRecord()
    return { ok: true, recorded }
  }

  const attach = (subsystem: IoSubsystem): Port => {
    if (status === 'stopped') {
      throw new Error('The hub is stopped.')
    }
    if (!isId(subsystem.id)) {
      throw new HubConfigurationError(`The subsystem ID "${subsystem.id}" is not correct.`)
    }
    if (subsystem.id === HUB_ID) {
      throw new HubConfigurationError(`The subsystem ID "${HUB_ID}" is reserved for the hub.`)
    }
    if (attached.has(subsystem.id) || subsystems.some((model) => model.id === subsystem.id)) {
      throw new HubConfigurationError(`The subsystem ID "${subsystem.id}" is in use.`)
    }

    const port = Object.freeze({ id: subsystem.id, kind: subsystem.kind })
    const entry: PortEntry = { registrations: new Set(), closed: false }
    attached.set(subsystem.id, entry)

    return {
      subsystem: port,
      read: () => joined,
      subscribe: (listener) => {
        const registration = { listener }
        entry.registrations.add(registration)
        return () => {
          entry.registrations.delete(registration)
        }
      },
      submit: (input) => {
        if (port.kind !== 'input' || entry.closed) {
          return Promise.resolve(reject('not-permitted'))
        }
        if (status !== 'running') {
          return Promise.resolve(reject('not-running'))
        }
        return new Promise<SubmitResult>((resolve, fail) => {
          queue.push({ source: port.id, input, resolve, reject: fail })
          drain()
        })
      },
      close: () => {
        if (entry.closed) {
          return
        }
        entry.closed = true
        entry.registrations.clear()
        attached.delete(port.id)
      },
    }
  }

  return {
    get status() {
      return status
    },
    get seq() {
      return lastSeq
    },
    start: () => {
      if (status !== 'created') {
        throw new Error(`The hub cannot start from the status "${status}".`)
      }
      status = 'running'
      busy = true
      try {
        emit({ type: 'started' })
      } finally {
        busy = false
      }
      drain()
    },
    stop: () => {
      if (status !== 'running' || stopRequested) {
        throw new Error(`The hub cannot stop from the status "${stopRequested ? 'stopped' : status}".`)
      }
      stopRequested = true
      drain()
    },
    attach,
    read: () => joined,
    record: () => record.slice(),
    recordStart: () => checkpoints[0],
  }
}
