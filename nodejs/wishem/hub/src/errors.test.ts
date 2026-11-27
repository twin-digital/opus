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

  it('joins the messages of the problems with a semicolon', () => {
    const error = new InputRefusedError([{ message: 'first', path: ['x'] }, { message: 'second' }])
    expect(error.message).toBe('first; second')
  })

  it('gives a default message when there is no problem', () => {
    expect(new InputRefusedError([]).message).toBe('The input is refused.')
  })
})

describe('HubConfigurationError', () => {
  it('is an Error', () => {
    expect(new HubConfigurationError('x')).toBeInstanceOf(Error)
    expect(new HubConfigurationError('x').message).toBe('x')
  })
})
