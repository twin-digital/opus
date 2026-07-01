import { describe, expect, it } from 'vitest'

import { createRateLimiter } from './rate-limit.js'

describe('createRateLimiter', () => {
  it('allows a burst then throttles until refilled', () => {
    const limiter = createRateLimiter(30, 1) // 1 token, refills 1 per 30s
    expect(limiter.tryAcquire(0)).toBe(true) // spend the burst token
    expect(limiter.tryAcquire(1_000)).toBe(false) // 1s later: not enough refill
    expect(limiter.tryAcquire(15_000)).toBe(false) // 15s: half a token
    expect(limiter.tryAcquire(30_000)).toBe(true) // 30s: one token refilled
  })

  it('honors a larger burst', () => {
    const limiter = createRateLimiter(60, 3)
    expect(limiter.tryAcquire(0)).toBe(true)
    expect(limiter.tryAcquire(0)).toBe(true)
    expect(limiter.tryAcquire(0)).toBe(true)
    expect(limiter.tryAcquire(0)).toBe(false) // burst exhausted
  })

  it('never accrues beyond the burst capacity', () => {
    const limiter = createRateLimiter(10, 2)
    expect(limiter.tryAcquire(0)).toBe(true)
    // idle for a long time — capacity stays capped at 2, not unbounded
    expect(limiter.tryAcquire(1_000_000)).toBe(true)
    expect(limiter.tryAcquire(1_000_000)).toBe(true)
    expect(limiter.tryAcquire(1_000_000)).toBe(false)
  })
})
