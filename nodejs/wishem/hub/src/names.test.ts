import { describe, expect, it } from 'vitest'
import { isId, isInputType } from './names.js'

describe('isId', () => {
  it.each(['time', 'store', 'set-field', 'a1', 'a1-b2-c3', 'renderer'])('accepts %s', (name) => {
    expect(isId(name)).toBe(true)
  })

  it.each(['', 'Time', '1time', '-time', 'time-', 'a--b', 'a_b', 'a/b', 'a b', 'tIme'])('rejects %j', (name) => {
    expect(isId(name)).toBe(false)
  })
})

describe('isInputType', () => {
  it.each(['store/set-field', 'time/advance', 'a/b'])('accepts %s', (name) => {
    expect(isInputType(name)).toBe(true)
  })

  it.each([
    '',
    'SetField',
    'store',
    'store/',
    '/set',
    'a/b/c',
    'Store/set',
    'store/Set',
    'store/1x',
    'store//x',
    'store:set',
    'store.set',
  ])('rejects %j', (name) => {
    expect(isInputType(name)).toBe(false)
  })
})
