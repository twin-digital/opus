import { describe, expect, it } from 'vitest'
import { HubConfigurationError, InputRefusedError } from './errors.js'

describe('InputRefusedError', () => {
  it('has the name InputRefusedError', () => {
    expect(new InputRefusedError([]).name).toBe('InputRefusedError')
  })

  it('keeps the problems', () => {
    const problems = [{ message: 'a', path: ['x'] }, { message: 'b' }]
    expect(new InputRefusedError(problems).problems).toEqual(problems)
  })

  it('holds the message of each problem in its message', () => {
    const error = new InputRefusedError([{ message: 'first', path: ['x'] }, { message: 'second' }])
    expect(error.message).toContain('first')
    expect(error.message).toContain('second')
  })

  it('has a message that is not empty when there is no problem', () => {
    expect(new InputRefusedError([]).message).not.toBe('')
  })
})

describe('HubConfigurationError', () => {
  it('is an Error that is not an InputRefusedError', () => {
    const error = new HubConfigurationError('x')
    expect(error).toBeInstanceOf(HubConfigurationError)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(InputRefusedError)
    expect(error.message).toBe('x')
  })
})
