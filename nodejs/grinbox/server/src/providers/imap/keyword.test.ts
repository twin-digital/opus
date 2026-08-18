import { describe, expect, it } from 'vitest'
import { isCarriableKeyword, makeCarriable, uncarriableCharacters } from './keyword.js'

describe('isCarriableKeyword (d-8v30vkou, f-xltd4r4v)', () => {
  it('admits the characters a keyword admits', () => {
    for (const value of ['finance', 'grinbox/finance', 'a.b-c_d', '$Forwarded', 'ünïcode', '#tag!', "it's"]) {
      expect(isCarriableKeyword(value)).toBe(true)
    }
  })

  it('bars the ten atom-specials and the empty string', () => {
    for (const value of ['a(b', 'a)b', 'a{b', 'a b', 'a%b', 'a*b', 'a"b', 'a\\b', 'a]b', 'ab', '']) {
      expect(isCarriableKeyword(value)).toBe(false)
    }
  })
})

describe('uncarriableCharacters', () => {
  it('names each barred character once, in order', () => {
    expect(uncarriableCharacters('a b (c) b')).toEqual([' ', '(', ')'])
  })

  it('names nothing for a carriable category', () => {
    expect(uncarriableCharacters('grinbox/finance')).toEqual([])
  })
})

describe('makeCarriable (d-mbh2pthe)', () => {
  it('replaces each character a keyword cannot carry with an underscore', () => {
    expect(makeCarriable('ACME Corp (2026)')).toBe('ACME_Corp__2026_')
  })

  it('leaves a carriable rendering alone', () => {
    expect(makeCarriable('grinbox/finance')).toBe('grinbox/finance')
  })

  it('has no carriable form for an empty rendering', () => {
    expect(makeCarriable('')).toBeNull()
  })
})
