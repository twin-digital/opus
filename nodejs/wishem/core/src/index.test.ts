import { describe, expect, it } from 'vitest'
import * as api from './index.js'

describe('the package exports', () => {
  it('gives createCore, ModelError, and validateModel', () => {
    expect(api.createCore).toBeTypeOf('function')
    expect(api.ModelError).toBeTypeOf('function')
    expect(api.validateModel).toBeTypeOf('function')
  })
})

describe('isEqual', () => {
  it('is exported by the package root and compares by canonical JSON', () => {
    const a = { definitions: [], entities: [] }
    expect(api.isEqual).toBeTypeOf('function')
    expect(api.isEqual(a, { entities: [], definitions: [] })).toBe(true)
    expect(api.isEqual(a, { definitions: [], entities: [{ id: 'e_1', components: {} }] })).toBe(false)
  })
})

describe('CoreReader', () => {
  it('accepts a core and has no operation that changes the model', () => {
    const core = api.createCore({ definitions: [], entities: [] })
    const read = (reader: api.CoreReader) => {
      // @ts-expect-error a reader has no setModel
      void reader.setModel
      return reader.getSnapshot()
    }
    expect(read(core)).toEqual({ definitions: [], entities: [] })
  })
})
