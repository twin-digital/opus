import type { Problem } from './model.js'

export class ModelError extends Error {
  readonly problems: Problem[]

  constructor(problems: Problem[]) {
    super(`The model is not correct: ${problems.map((problem) => problem.message).join('; ')}`)
    this.name = 'ModelError'
    this.problems = problems
  }
}
