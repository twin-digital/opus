import { describe, expect, it } from 'vitest'
import * as api from './index.js'

describe('the package exports', () => {
  it('gives createCore, ModelError, and validateModel', () => {
    expect(api.createCore).toBeTypeOf('function')
    expect(api.ModelError).toBeTypeOf('function')
    expect(api.validateModel).toBeTypeOf('function')
  })
})
