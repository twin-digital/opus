import type { Model, Problem, Snapshot, ValidationResult } from './model.js'
import { validateModel } from './validate-model.js'

export interface Core {
  getSnapshot(): Snapshot
  /** Returns a function that stops the registration. */
  subscribe(listener: (snapshot: Snapshot) => void): () => void
  /** For the host. Keeps the current model when the result is not ok. */
  setModel(data: unknown): ValidationResult
}

export class ModelError extends Error {
  readonly problems: Problem[]

  constructor(problems: Problem[]) {
    super(`The model is not correct: ${problems.map((problem) => problem.message).join('; ')}`)
    this.name = 'ModelError'
    this.problems = problems
  }
}

/** JSON text with sorted record keys. */
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'object' && item !== null && !Array.isArray(item) ?
      Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
    : item,
  )

const isEqual = (a: Model, b: Model): boolean => canonical(a) === canonical(b)

/** Throws a `ModelError` that holds the problems when the model is not correct. */
export const createCore = (data: unknown): Core => {
  const first = validateModel(data)
  if (!first.ok) {
    throw new ModelError(first.problems)
  }

  let model = first.model
  const listeners = new Set<(snapshot: Snapshot) => void>()

  return {
    getSnapshot: () => model,

    subscribe: (listener) => {
      // Wrap the listener so that two registrations of one function stay separate.
      const entry = (snapshot: Snapshot): void => {
        listener(snapshot)
      }
      listeners.add(entry)
      return () => {
        listeners.delete(entry)
      }
    },

    setModel: (next) => {
      const result = validateModel(next)
      if (result.ok && !isEqual(result.model, model)) {
        model = result.model
        for (const listener of [...listeners]) {
          listener(model)
        }
      }
      return result
    },
  }
}
