export interface Input {
  /** For example `store/set-field`. */
  type: string
  /** JSON data. */
  payload?: unknown
}

export interface RecordedInput {
  /** Starts at 1. */
  readonly seq: number
  /** The ID of the subsystem that sent the input. */
  readonly source: string
  readonly type: string
  /** A frozen JSON copy. `null` when the sender gave no payload. */
  readonly payload: unknown
}

/** One key for each model subsystem, under its ID. */
export type JoinedState = Readonly<Record<string, unknown>>

export interface ApplyContext {
  /** Holds the new parts of the model subsystems that are earlier in the order. */
  read(): JoinedState
}

export interface ModelSubsystem<Part = unknown> {
  id: string
  /** The input types that this subsystem applies. */
  inputs: readonly string[]
  initial: Part
  /** Returns the new part, or the same object when nothing changes. Throws `InputRefusedError` to refuse. */
  apply(part: Part, input: RecordedInput, context: ApplyContext): Part
}

export interface InputProblem {
  readonly message: string
  readonly path?: readonly (string | number)[]
}

export interface IoSubsystem {
  readonly id: string
  readonly kind: 'input' | 'output'
}

export type RejectionReason = 'not-permitted' | 'not-running' | 'unknown-type' | 'invalid'

export type SubmitResult = { ok: true; seq: number } | { ok: false; reason: RejectionReason; problems: InputProblem[] }

export type HubEvent = { type: 'started' } | { type: 'applied'; input: RecordedInput } | { type: 'stopping' }

export interface Port {
  readonly subsystem: IoSubsystem
  submit(input: Input): Promise<SubmitResult>
  read(): JoinedState
  /** Returns a function that removes the listener. */
  subscribe(listener: (event: HubEvent) => void): () => void
  close(): void
}

export interface HubOptions {
  /** The order is the order in which the hub gives an input to the model subsystems. */
  subsystems: readonly ModelSubsystem[]
  /** Gets each error that a listener throws. */
  onError?: (error: unknown) => void
}

export type HubStatus = 'created' | 'running' | 'stopped'

export interface Hub {
  readonly status: HubStatus
  start(): void
  stop(): void
  attach(subsystem: IoSubsystem): Port
  read(): JoinedState
  record(): readonly RecordedInput[]
}
