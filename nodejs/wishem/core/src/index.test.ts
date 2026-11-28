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

  it('gives FIELD_TYPES with the five field types', () => {
    expect(api.FIELD_TYPES).toEqual(['string', 'number', 'boolean', 'reference', 'reference-list'])
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
  it('compares any two values', () => {
    expect(api.isEqual(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(api.isEqual(['a', 'b'], ['b', 'a'])).toBe(false)
    expect(api.isEqual([], [])).toBe(true)
    expect(api.isEqual(3, '3')).toBe(false)
    expect(api.isEqual('x', 'x')).toBe(true)
    expect(api.isEqual(false, false)).toBe(true)
    expect(api.isEqual(false, 0)).toBe(false)
  })

  it('compares by canonical JSON', () => {
    const a = { definitions: [], entities: [] }
    expect(api.isEqual(a, { entities: [], definitions: [] })).toBe(true)
    expect(api.isEqual(a, { definitions: [], entities: [{ id: 'e_1', components: {} }] })).toBe(false)
  })

  it('ignores the order of keys in nested records and not the order of lists', () => {
    const entity = (components: Record<string, Record<string, string>>) => ({ id: 'e_1', components })
    const one = entity({ ct_1: { a: 'x', b: 'y' }, ct_2: {} })
    const two = entity({ ct_2: {}, ct_1: { b: 'y', a: 'x' } })
    expect(api.isEqual({ definitions: [], entities: [one] }, { definitions: [], entities: [two] })).toBe(true)
    expect(
      api.isEqual({ definitions: [], entities: [one, entity({})] }, { definitions: [], entities: [entity({}), one] }),
    ).toBe(false)
  })
})
