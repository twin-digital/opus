import { describe, expect, it } from 'vitest'

import { assignTiers } from './tiers.js'

describe('assignTiers', () => {
  it('breaks tiers where the drop exceeds mean + z·stddev of the pool drops', () => {
    // gaps: 2, 1, 17, 1, 19 → mean 8, stddev ≈ 8.2, threshold ≈ 16.2 → breaks at 17 and 19
    expect(assignTiers([100, 98, 97, 80, 79, 60])).toEqual([1, 1, 1, 2, 2, 3])
  })

  it('keeps a flat position in one tier', () => {
    expect(assignTiers([50, 49, 48, 47, 46])).toEqual([1, 1, 1, 1, 1])
  })

  it('scales the threshold to the position variance', () => {
    // The same absolute 10-point drop breaks a tight position but not a volatile one.
    expect(assignTiers([100, 99, 98, 88, 87])).toEqual([1, 1, 1, 2, 2])
    expect(assignTiers([100, 90, 80, 70, 60])).toEqual([1, 1, 1, 1, 1])
  })

  it('dumps everyone past the pool into one trailing tier', () => {
    const tiers = assignTiers([100, 98, 60, 58, 30, 29, 28], { poolSize: 4 })
    expect(tiers.slice(0, 4)).toEqual([1, 1, 2, 2])
    expect(tiers.slice(4)).toEqual([3, 3, 3])
  })

  it('handles empty and single-player inputs', () => {
    expect(assignTiers([])).toEqual([])
    expect(assignTiers([100])).toEqual([1])
  })
})
