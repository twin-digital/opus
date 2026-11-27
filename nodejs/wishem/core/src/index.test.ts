import { describe, expect, it } from 'vitest'
import * as api from './index.js'

describe('the package exports', () => {
  it('gives ModelError, validateModel, createStore, storeInputs, and isEqual', () => {
    expect(api.ModelError).toBeTypeOf('function')
    expect(api.validateModel).toBeTypeOf('function')
    expect(api.createStore).toBeTypeOf('function')
    expect(api.storeInputs).toBeTypeOf('function')
    expect(api.isEqual).toBeTypeOf('function')
  })

  it('does not give createCore', () => {
    expect('createCore' in api).toBe(false)
  })

  it('gives the ModelError class that createStore throws', () => {
    let error: unknown
    try {
      api.createStore({ model: 7 })
    } catch (thrown) {
      error = thrown
    }
    expect(error).toBeInstanceOf(api.ModelError)
  })
})

describe('isEqual', () => {
  it('compares by canonical JSON', () => {
    const a = { definitions: [], entities: [] }
    expect(api.isEqual(a, { entities: [], definitions: [] })).toBe(true)
    expect(api.isEqual(a, { definitions: [], entities: [{ id: 'e_1', components: {} }] })).toBe(false)
  })
})
