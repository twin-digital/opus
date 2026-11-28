import { describe, expect, it } from 'vitest'
import { ModelError } from './errors.js'
import { createStore } from './store.js'

const ENT = 'e_c0d5e6f1-7a82-4b93-a104-5d6e7f8091a2'
const CT = 'ct_3f2a9c1e-8b47-4d0a-9e51-6c2f7a1b0d34'

const thrownBy = (model: unknown): ModelError => {
  try {
    createStore({ model })
  } catch (error) {
    return error as ModelError
  }
  throw new Error('createStore did not throw')
}

describe('ModelError', () => {
  it('has the name, the problems, and a message that holds the problem', () => {
    const error = thrownBy({ definitions: [], entities: [{ id: ENT, components: { [CT]: {} } }] })
    expect(error).toBeInstanceOf(ModelError)
    expect(error.name).toBe('ModelError')
    expect(error.problems).toHaveLength(1)
    expect(error.problems[0]?.severity).toBe('error')
    expect(error.message).toContain(error.problems[0]?.message)
  })

  it('gives every problem in the message', () => {
    const error = thrownBy({
      definitions: [],
      entities: [
        { id: ENT, components: { [CT]: {} } },
        { id: 'e_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', components: { [CT]: {} } },
      ],
    })
    expect(error.problems).toHaveLength(2)
    for (const problem of error.problems) {
      expect(error.message).toContain(problem.message)
    }
  })
})
