import type { Input, JoinedState, RecordedInput, SubmitResult } from '../types.js'

/** The version of the protocol of the link. */
export const LINK_PROTOCOL_VERSION = 1

export type RefusalReason = 'malformed' | 'version' | 'id-in-use' | 'unsupported' | 'stopped'

/** The status of a hub that a `welcome` message can hold. */
export type WelcomeStatus = 'created' | 'running'

export type ClientMessage =
  | { t: 'hello'; protocol: number; subsystems: { id: string; kind: string }[] }
  | { t: 'submit'; request: number; subsystem: string; input: Input }

export type HubMessage =
  | { t: 'welcome'; protocol: number; status: WelcomeStatus; seq: number; state: JoinedState }
  | { t: 'refused'; reason: RefusalReason; message: string; supported?: number[] }
  | { t: 'event'; event: 'started' | 'stopping' }
  | { t: 'applied'; input: RecordedInput; parts: Record<string, unknown> }
  | { t: 'result'; request: number; result?: SubmitResult; error?: string }

/** The result of a reader: a known message, or the type of a message that the reader does not know. */
export type Parsed<Message> =
  { readonly kind: 'message'; readonly message: Message } | { readonly kind: 'unknown'; readonly t: string }

const REASONS: readonly string[] = ['malformed', 'version', 'id-in-use', 'unsupported', 'stopped']
const STATUSES: readonly string[] = ['created', 'running']
const CLIENT_TYPES: readonly string[] = ['hello', 'submit']
const HUB_TYPES: readonly string[] = ['welcome', 'refused', 'event', 'applied', 'result']

type Fields = Record<string, unknown>

const isFields = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isString = (value: unknown): value is string => typeof value === 'string'

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const isInput = (value: unknown): value is Input => isFields(value) && isString(value.type)

const isRecordedInput = (value: unknown): value is RecordedInput =>
  isFields(value) && isCount(value.seq) && isString(value.source) && isString(value.type)

const isSubsystem = (value: unknown): value is { id: string; kind: string } =>
  isFields(value) && isString(value.id) && isString(value.kind)

const isHello = (fields: Fields) =>
  isNumber(fields.protocol) && Array.isArray(fields.subsystems) && fields.subsystems.every(isSubsystem)

const isSubmit = (fields: Fields) => isNumber(fields.request) && isString(fields.subsystem) && isInput(fields.input)

const isWelcome = (fields: Fields) =>
  isCount(fields.protocol) &&
  isString(fields.status) &&
  STATUSES.includes(fields.status) &&
  isCount(fields.seq) &&
  isFields(fields.state)

const isRefused = (fields: Fields) =>
  isString(fields.reason) &&
  REASONS.includes(fields.reason) &&
  isString(fields.message) &&
  (fields.supported === undefined || (Array.isArray(fields.supported) && fields.supported.every(isNumber)))

const isEvent = (fields: Fields) => fields.event === 'started' || fields.event === 'stopping'

const isApplied = (fields: Fields) => isRecordedInput(fields.input) && isFields(fields.parts)

const isResult = (fields: Fields) => {
  if (!isCount(fields.request) || 'result' in fields === 'error' in fields) {
    return false
  }
  return 'error' in fields ? isString(fields.error) : isFields(fields.result) && typeof fields.result.ok === 'boolean'
}

const CLIENT_CHECKS: Record<string, (fields: Fields) => boolean> = { hello: isHello, submit: isSubmit }
const HUB_CHECKS: Record<string, (fields: Fields) => boolean> = {
  welcome: isWelcome,
  refused: isRefused,
  event: isEvent,
  applied: isApplied,
  result: isResult,
}

const parse = <Message>(
  text: string,
  types: readonly string[],
  checks: Record<string, (fields: Fields) => boolean>,
): Parsed<Message> | undefined => {
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
    return { kind: 'unknown', t: value.t }
  }
  return checks[value.t](value) ? { kind: 'message', message: value as Message } : undefined
}

/**
 * Reads a message of the client. Gives `undefined` for text that is not a message.
 * Gives `{ kind: "unknown" }` for a type that is not known.
 */
export const parseClientMessage = (text: string) => parse<ClientMessage>(text, CLIENT_TYPES, CLIENT_CHECKS)

/**
 * Reads a message of the hub side. Gives `undefined` for text that is not a message.
 * Gives `{ kind: "unknown" }` for a type that is not known.
 */
export const parseHubMessage = (text: string) => parse<HubMessage>(text, HUB_TYPES, HUB_CHECKS)
