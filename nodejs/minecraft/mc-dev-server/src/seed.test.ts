import { describe, expect, it } from 'vitest'

import { SEED_MAX, SEED_MIN, SeedRangeError, formatSeed, parseSeed, randomSeed } from './seed.js'

describe('parseSeed', () => {
  // d-41m3iws5 — the range is exact and its edges matter
  it.each([SEED_MIN, SEED_MAX, 0n, -1n])('keeps %s exactly', (seed) => {
    expect(parseSeed(seed.toString())).toBe(seed)
  })

  it.each(['9223372036854775808', '-9223372036854775809', 'hello', '1.5', ''])(
    'rejects %s, which the server would hash as text',
    (value) => {
      expect(() => parseSeed(value)).toThrow(SeedRangeError)
    },
  )
})

describe('randomSeed', () => {
  // d-41m3iws5 — a uniformly random signed 64-bit integer the harness records
  it('stays inside the range the server keeps exactly', () => {
    for (let i = 0; i < 200; i += 1) {
      const seed = randomSeed()
      expect(seed).toBeGreaterThanOrEqual(SEED_MIN)
      expect(seed).toBeLessThanOrEqual(SEED_MAX)
    }
  })

  it('is not a constant', () => {
    const seeds = new Set(Array.from({ length: 20 }, () => randomSeed()))

    expect(seeds.size).toBeGreaterThan(1)
  })
})

describe('formatSeed', () => {
  // d-41m3iws5 — emitted as plain decimal
  it('writes plain decimal', () => {
    expect(formatSeed(SEED_MIN)).toBe('-9223372036854775808')
  })
})
