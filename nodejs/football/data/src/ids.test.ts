import { describe, expect, it } from 'vitest'

import { ID_PREFIXES, isPlayerId, mintPlayerId } from './ids.js'

describe('mintPlayerId', () => {
  it('mints p-<ulid> with a hyphen delimiter', () => {
    const id = mintPlayerId()
    expect(id).toMatch(/^p-[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it('mints unique ids', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => mintPlayerId()))
    expect(ids.size).toBe(1000)
  })
})

describe('isPlayerId', () => {
  it('accepts minted ids', () => {
    expect(isPlayerId(mintPlayerId())).toBe(true)
  })

  it('rejects other prefixes, delimiters, and malformed ulids', () => {
    expect(isPlayerId('x-01J8ZQ3M9WVXK2T7F0A1B2C3D4')).toBe(false)
    expect(isPlayerId('p_01J8ZQ3M9WVXK2T7F0A1B2C3D4')).toBe(false)
    expect(isPlayerId('p-not-a-ulid')).toBe(false)
    expect(isPlayerId('4429795')).toBe(false)
  })
})

describe('ID_PREFIXES', () => {
  it('registers p for Player, with 1-3 character prefixes', () => {
    expect(ID_PREFIXES.p).toBe('Player')
    for (const prefix of Object.keys(ID_PREFIXES)) {
      expect(prefix.length).toBeGreaterThanOrEqual(1)
      expect(prefix.length).toBeLessThanOrEqual(3)
    }
  })
})
