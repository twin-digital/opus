import { describe, it, expect } from 'vitest'

import { createRng } from './rng.js'

describe('createRng', () => {
  it('same seed yields the same stream', () => {
    const a = createRng(123)
    const b = createRng(123)
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next())
    }
  })

  it('different seeds diverge', () => {
    const a = createRng(1)
    const b = createRng(2)
    expect(a.next()).not.toBe(b.next())
  })

  it('int stays within inclusive bounds', () => {
    const r = createRng(7)
    for (let i = 0; i < 1000; i++) {
      const n = r.int(3, 9)
      expect(n >= 3 && n <= 9, `out of range: ${n}`).toBe(true)
    }
  })

  it('sample returns the requested count of distinct elements', () => {
    const r = createRng(5)
    const picked = r.sample([1, 2, 3, 4, 5, 6], 4)
    expect(picked.length).toBe(4)
    expect(new Set(picked).size).toBe(4)
  })

  it('pick and weighted throw on an empty array', () => {
    const r = createRng(0)
    expect(() => r.pick([])).toThrow(RangeError)
    expect(() => r.weighted([], () => 1)).toThrow(RangeError)
  })
})
