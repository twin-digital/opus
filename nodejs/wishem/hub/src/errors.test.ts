import { describe, expect, it } from 'vitest'
import { HubConfigurationError, InputRefusedError, ReplayError } from './errors.js'

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

describe('ReplayError', () => {
  it('keeps the sequence number and the problems', () => {
    const problems = [{ message: 'a', path: ['x'] }]
    const error = new ReplayError(3, problems)
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ReplayError')
    expect(error.seq).toBe(3)
    expect(error.problems).toEqual(problems)
  })
})
