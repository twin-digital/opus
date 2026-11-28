import { InputRefusedError } from '@thrashplay/wishem-hub'
import type { Input, ModelSubsystem, RecordedInput, SubmitResult } from '@thrashplay/wishem-hub'
import { CONSTRUCT_MANAGER_ID, CONSTRUCTS_ID } from './ids.js'

export type WantedState = 'running' | 'stopped'
export type ConstructStatus = 'pending' | 'running' | 'stopped' | 'failed'
export type TimeState = 'running' | 'paused'

export type PassResult = SubmitResult | { readonly ok: false; readonly reason: 'error'; readonly message: string }

export interface ConstructEntry {
  readonly want: WantedState
  /** The time state when the construct starts. */
  readonly startTime: TimeState
  /** The sequence number, in the workbench record, of the `constructs/start` that wrote the entry. */
  readonly startSeq: number
  /** What the construct manager reported last. `pending` until its first report. */
  readonly status: ConstructStatus
  /** For example `ws://127.0.0.1:41377/link`. Only with the status `running`. */
  readonly link?: string
  /** Only with the status `running`. */
  readonly time?: TimeState
  readonly message?: string
  /** The result of the last `constructs/send`, under its sequence number in the workbench record. */
  readonly lastSend?: { readonly seq: number; readonly result: PassResult }
}

export interface ConstructList {
  readonly constructs: Readonly<Record<string, ConstructEntry>>
}

export interface ReportPayload {
  construct: string
  status: 'running' | 'stopped' | 'failed'
  link?: string
  time?: TimeState
  message?: string
  lastSend?: { seq: number; result: PassResult }
}

const START = `${CONSTRUCTS_ID}/start`
const STOP = `${CONSTRUCTS_ID}/stop`
const SEND = `${CONSTRUCTS_ID}/send`
const REPORT = `${CONSTRUCTS_ID}/report`

const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const refuse = (message: string, path: (string | number)[]): never => {
  throw new InputRefusedError([{ message, path }])
}

const payloadOf = (input: RecordedInput): Record<string, unknown> =>
  isRecord(input.payload) ? input.payload : refuse('The payload is not an object', ['payload'])

const constructOf = (payload: Record<string, unknown>): string => {
  const { construct } = payload
  if (typeof construct !== 'string' || !ID.test(construct)) {
    return refuse('The construct is not the ID of a subsystem', ['payload', 'construct'])
  }
  return construct
}

const entryOf = (part: ConstructList, id: string): ConstructEntry => {
  const entry = Object.hasOwn(part.constructs, id) ? part.constructs[id] : undefined
  return entry ?? refuse(`The list has no construct "${id}"`, ['payload', 'construct'])
}

const withEntry = (part: ConstructList, id: string, entry: ConstructEntry): ConstructList => ({
  constructs: { ...part.constructs, [id]: entry },
})

const start = (part: ConstructList, input: RecordedInput): ConstructList => {
  const payload = payloadOf(input)
  const id = constructOf(payload)
  if (payload.running !== undefined && typeof payload.running !== 'boolean') {
    return refuse('The running value is not a boolean', ['payload', 'running'])
  }
  const startTime: TimeState = payload.running === false ? 'paused' : 'running'
  const entry = Object.hasOwn(part.constructs, id) ? part.constructs[id] : undefined
  if (entry?.want === 'running') {
    return part
  }
  return withEntry(part, id, { want: 'running', startTime, startSeq: input.seq, status: 'pending' })
}

const stop = (part: ConstructList, input: RecordedInput): ConstructList => {
  const id = constructOf(payloadOf(input))
  const entry = entryOf(part, id)
  return entry.want === 'stopped' ? part : withEntry(part, id, { ...entry, want: 'stopped' })
}

const send = (part: ConstructList, input: RecordedInput): ConstructList => {
  const payload = payloadOf(input)
  const id = constructOf(payload)
  const { input: passed } = payload
  if (!isRecord(passed) || typeof passed.type !== 'string') {
    return refuse('The input has no string "type" key', ['payload', 'input', 'type'])
  }
  const entry = entryOf(part, id)
  if (entry.want !== 'running' || entry.status !== 'running') {
    return refuse(`The construct "${id}" does not run`, ['payload', 'construct'])
  }
  return part
}

const REPORTED = ['running', 'stopped', 'failed']

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

const report = (part: ConstructList, input: RecordedInput): ConstructList => {
  if (input.source !== CONSTRUCT_MANAGER_ID) {
    return refuse(`Only the source "${CONSTRUCT_MANAGER_ID}" reports a status`, ['source'])
  }
  const payload = payloadOf(input)
  const id = constructOf(payload)
  const entry = entryOf(part, id)
  const { status, link, time, message, lastSend } = payload
  if (typeof status !== 'string' || !REPORTED.includes(status)) {
    return refuse('The status is not "running", "stopped", or "failed"', ['payload', 'status'])
  }
  if (link !== undefined && typeof link !== 'string') {
    return refuse('The link is not a string', ['payload', 'link'])
  }
  if (time !== undefined && time !== 'running' && time !== 'paused') {
    return refuse('The time is not "running" or "paused"', ['payload', 'time'])
  }
  if (message !== undefined && typeof message !== 'string') {
    return refuse('The message is not a string', ['payload', 'message'])
  }
  if (lastSend !== undefined && (!isRecord(lastSend) || typeof lastSend.seq !== 'number')) {
    return refuse('The lastSend has no number "seq" key', ['payload', 'lastSend'])
  }
  const live = status === 'running'
  const kept = (lastSend ?? entry.lastSend) as ConstructEntry['lastSend']
  const next: ConstructEntry = {
    want: entry.want,
    startTime: entry.startTime,
    startSeq: entry.startSeq,
    status: status as ConstructEntry['status'],
    ...(live && link !== undefined ? { link } : {}),
    ...(live && time !== undefined ? { time } : {}),
    ...(message === undefined ? {} : { message }),
    ...(kept === undefined ? {} : { lastSend: kept }),
  }
  return sameJson(next, entry) ? part : withEntry(part, id, next)
}

const handlers: Record<string, (part: ConstructList, input: RecordedInput) => ConstructList> = {
  [START]: start,
  [STOP]: stop,
  [SEND]: send,
  [REPORT]: report,
}

const FIRST: ConstructList = Object.freeze({ constructs: Object.freeze({}) })

/** The model subsystem `constructs`. Its first part has no construct. */
export const createConstructList = (): ModelSubsystem<ConstructList> => ({
  id: CONSTRUCTS_ID,
  inputs: Object.keys(handlers),
  initial: FIRST,
  apply: (part, input) => {
    const handler = Object.hasOwn(handlers, input.type) ? handlers[input.type] : undefined
    return handler === undefined ? refuse(`The list does not apply "${input.type}"`, ['type']) : handler(part, input)
  },
})

/** The functions that make the inputs of the construct list. */
export const constructInputs = {
  start: (construct: string, options: { running?: boolean } = {}): Input => ({
    type: START,
    payload: options.running === undefined ? { construct } : { construct, running: options.running },
  }),
  stop: (construct: string): Input => ({ type: STOP, payload: { construct } }),
  send: (construct: string, input: Input): Input => ({ type: SEND, payload: { construct, input } }),
  report: (payload: ReportPayload): Input => ({ type: REPORT, payload }),
}
