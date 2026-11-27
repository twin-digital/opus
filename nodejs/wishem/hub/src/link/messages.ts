import type { HubStatus, Input, JoinedState, RecordedInput, SubmitResult } from '../types.js'

/** The version of the protocol of the link. */
export const LINK_PROTOCOL_VERSION = 1

export type RefusalReason = 'malformed' | 'version' | 'id-in-use' | 'unsupported' | 'stopped'

export type ClientMessage =
  | { t: 'hello'; protocol: number; subsystems: { id: string; kind: string }[] }
  | { t: 'submit'; request: number; subsystem: string; input: Input }

export type HubMessage =
  | { t: 'welcome'; protocol: number; status: HubStatus; seq: number; state: JoinedState }
  | { t: 'refused'; reason: RefusalReason; message: string; supported?: number[] }
  | { t: 'event'; event: 'started' | 'stopping' }
  | { t: 'applied'; input: RecordedInput; parts: Record<string, unknown> }
  | { t: 'result'; request: number; result?: SubmitResult; error?: string }

/** A message with a type that the reader does not know. The reader ignores it. */
export interface UnknownMessage {
  readonly t: string
  readonly unknown: true
}

const REASONS: readonly string[] = ['malformed', 'version', 'id-in-use', 'unsupported', 'stopped']
const STATUSES: readonly string[] = ['created', 'running', 'stopped']
const CLIENT_TYPES: readonly string[] = ['hello', 'submit']
const HUB_TYPES: readonly string[] = ['welcome', 'refused', 'event', 'applied', 'result']

type Fields = Record<string, unknown>

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isString = (value: unknown): value is string => typeof value === 'string'

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const isInput = (value: unknown): value is Input => isFields(value) && isString(value.type)

const isRecordedInput = (value: unknown): value is RecordedInput =>
  isFields(value) && isNumber(value.seq) && isString(value.source) && isString(value.type)

const isSubsystem = (value: unknown): value is { id: string; kind: string } =>
  isFields(value) && isString(value.id) && isString(value.kind)

const isHello = (fields: Fields) =>
  isNumber(fields.protocol) && Array.isArray(fields.subsystems) && fields.subsystems.every(isSubsystem)

const isSubmit = (fields: Fields) => isNumber(fields.request) && isString(fields.subsystem) && isInput(fields.input)

const isWelcome = (fields: Fields) =>
  isNumber(fields.protocol) &&
  isString(fields.status) &&
  STATUSES.includes(fields.status) &&
  isNumber(fields.seq) &&
  isFields(fields.state)

const isRefused = (fields: Fields) =>
  isString(fields.reason) &&
  REASONS.includes(fields.reason) &&
  isString(fields.message) &&
  (fields.supported === undefined || (Array.isArray(fields.supported) && fields.supported.every(isNumber)))

const isEvent = (fields: Fields) => fields.event === 'started' || fields.event === 'stopping'

const isApplied = (fields: Fields) => isRecordedInput(fields.input) && isFields(fields.parts)

const isResult = (fields: Fields) =>
  isNumber(fields.request) &&
  (fields.error === undefined ?
    isFields(fields.result) && typeof fields.result.ok === 'boolean'
  : isString(fields.error))

const CLIENT_CHECKS: Record<string, (fields: Fields) => boolean> = { hello: isHello, submit: isSubmit }
const HUB_CHECKS: Record<string, (fields: Fields) => boolean> = {
  welcome: isWelcome,
  refused: isRefused,
  event: isEvent,
  applied: isApplied,
  result: isResult,
}

const parse = (
  text: string,
  types: readonly string[],
  checks: Record<string, (fields: Fields) => boolean>,
): Fields | UnknownMessage | undefined => {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!isFields(value) || !isString(value.t)) {
    return undefined
  }
  if (!types.includes(value.t)) {
    return { t: value.t, unknown: true }
  }
  return checks[value.t](value) ? value : undefined
}

/**
 * Reads a message of the client. Gives `undefined` for text that is not a message.
 * Gives an `UnknownMessage` for a type that is not known.
 */
export const parseClientMessage = (text: string): ClientMessage | UnknownMessage | undefined =>
  parse(text, CLIENT_TYPES, CLIENT_CHECKS) as ClientMessage | UnknownMessage | undefined

/**
 * Reads a message of the hub side. Gives `undefined` for text that is not a message.
 * Gives an `UnknownMessage` for a type that is not known.
 */
export const parseHubMessage = (text: string): HubMessage | UnknownMessage | undefined =>
  parse(text, HUB_TYPES, HUB_CHECKS) as HubMessage | UnknownMessage | undefined
