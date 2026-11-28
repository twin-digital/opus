import type { InputProblem } from './types.js'

/** Thrown by `createHub` and `attach` for a configuration that is not correct. */
export class HubConfigurationError extends Error {}

/** Thrown by `ModelSubsystem.apply` to refuse an input. */
export class InputRefusedError extends Error {
  readonly problems: InputProblem[]

  constructor(problems: InputProblem[]) {
    super(problems.map((problem) => problem.message).join('; ') || 'The input is refused.')
    this.name = 'InputRefusedError'
    this.problems = problems
  }
}

/** Thrown by `createHub` when an input of the record does not apply. */
export class ReplayError extends Error {
  readonly seq: number
  readonly problems: InputProblem[]

  constructor(seq: number, problems: InputProblem[]) {
    super(`The input ${seq} of the record does not apply: ${problems.map((problem) => problem.message).join('; ')}`)
    this.name = 'ReplayError'
    this.seq = seq
    this.problems = problems
  }
}
