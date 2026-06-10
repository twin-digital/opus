import { describe, expect, it } from 'vitest'

import { relativeTime } from './format.js'

describe('relativeTime', () => {
  const now = 1_700_000_000_000 // fixed ms
  const nowSec = Math.floor(now / 1000)

  it('renders "never" for null', () => {
    expect(relativeTime(null, now)).toBe('never')
  })

  it('renders seconds / minutes / hours / days', () => {
    expect(relativeTime(nowSec - 30, now)).toBe('30s ago')
    expect(relativeTime(nowSec - 120, now)).toBe('2m ago')
    expect(relativeTime(nowSec - 3 * 3600, now)).toBe('3h ago')
    expect(relativeTime(nowSec - 2 * 86_400, now)).toBe('2d ago')
  })

  it('renders "just now" for sub-5s deltas', () => {
    expect(relativeTime(nowSec, now)).toBe('just now')
  })

  it('pins the exact bucket thresholds', () => {
    // < 5s → just now; the boundary itself flips to seconds.
    expect(relativeTime(nowSec - 4, now)).toBe('just now')
    expect(relativeTime(nowSec - 5, now)).toBe('5s ago')
    // 59s is the last second-bucket; 60s flips to minutes.
    expect(relativeTime(nowSec - 59, now)).toBe('59s ago')
    expect(relativeTime(nowSec - 60, now)).toBe('1m ago')
    // 59m is the last minute-bucket; 60m flips to hours.
    expect(relativeTime(nowSec - 59 * 60, now)).toBe('59m ago')
    expect(relativeTime(nowSec - 60 * 60, now)).toBe('1h ago')
    // 23h is the last hour-bucket; 24h flips to days.
    expect(relativeTime(nowSec - 23 * 3600, now)).toBe('23h ago')
    expect(relativeTime(nowSec - 24 * 3600, now)).toBe('1d ago')
  })

  it('clamps a future timestamp to "just now" (no negative delta)', () => {
    expect(relativeTime(nowSec + 120, now)).toBe('just now')
  })
})
