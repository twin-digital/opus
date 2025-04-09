import { describe, it, expect } from 'vitest'
import { validateMessage } from '../src/index.js'

describe('validateMessage', () => {
  it('validates a good message', () => {
    expect(
      validateMessage({ id: '123', body: 'hello', timestamp: Date.now() }),
    ).toBe(true)
  })

  it('rejects a bad message', () => {
    expect(validateMessage({ id: '', body: '', timestamp: NaN })).toBe(false)
  })
})
