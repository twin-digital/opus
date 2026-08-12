import { describe, expect, it } from 'vitest'

import { formatSeconds, relativeTime, timeUntil } from './format'

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

describe('timeUntil', () => {
  const now = 1_700_000_000_000
  const nowSec = Math.floor(now / 1000)

  it('counts down in seconds / minutes / hours / days', () => {
    expect(timeUntil(nowSec + 45, now)).toBe('in 45s')
    expect(timeUntil(nowSec + 600, now)).toBe('in 10m')
    expect(timeUntil(nowSec + 2 * 3600, now)).toBe('in 2h')
    expect(timeUntil(nowSec + 5 * 86_400, now)).toBe('in 5d')
  })

  // A due moment grinbox has not swept yet is imminent, not missed
  // (d-gzv0jty7: the sweep acts late rather than never).
  it('reads a past-due moment as "due now"', () => {
    expect(timeUntil(nowSec, now)).toBe('due now')
    expect(timeUntil(nowSec - 3600, now)).toBe('due now')
  })
})

describe('formatSeconds', () => {
  it('renders the largest whole unit', () => {
    expect(formatSeconds(45)).toBe('45s')
    expect(formatSeconds(600)).toBe('10m')
    expect(formatSeconds(3600)).toBe('1h')
    expect(formatSeconds(86_400)).toBe('1d')
    // Not a whole minute → stays in seconds.
    expect(formatSeconds(90)).toBe('90s')
  })
})
