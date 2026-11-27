export interface Input {
  /** For example `store/set-field`. */
  type: string
  /** JSON data. */
  payload?: unknown
}

/** The payload of the input `hub/rewind`. */
export interface RewindPayload {
  /** The target. The joined state becomes the state after this input. 0 is the first state. */
  seq: number
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

/** The joined state after one sequence number. It refers to the parts and copies none. */
export interface Checkpoint {
  readonly seq: number
  readonly state: JoinedState
}

/** The start of a record and the inputs after it, in the order of the sequence numbers, with no gap. */
export interface HubRecord {
  readonly start: Checkpoint
  readonly inputs: readonly RecordedInput[]
}

export interface HubOptions {
  /** The order is the order in which the hub gives an input to the model subsystems. */
  subsystems: readonly ModelSubsystem[]
  /** Gets each error that a listener throws. */
  onError?: (error: unknown) => void
  /** A positive integer. Default 100. */
  checkpointInterval?: number
  /** A positive integer, not smaller than `checkpointInterval`. Default 100000. */
  recordLimit?: number
}

export type HubStatus = 'created' | 'running' | 'stopped'

export interface Hub {
  readonly status: HubStatus
  /** The sequence number of the last accepted input. 0 for none. */
  readonly seq: number
  start(): void
  stop(): void
  attach(subsystem: IoSubsystem): Port
  read(): JoinedState
  /** The inputs after the start of the record. */
  record(): readonly RecordedInput[]
  recordStart(): Checkpoint
}
