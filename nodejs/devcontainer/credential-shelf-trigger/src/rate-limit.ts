/**
 * Token-bucket rate limiter. A trigger kicks an AWS device-authorization flow, so repeated
 * triggers can hit AWS's device-auth limits and *block* the legitimate refresh — throttle
 * hard. `intervalSec` is the seconds to refill one token; `burst` is the bucket capacity.
 * Time is passed in (not read from a clock) so it stays deterministic under test.
 */
export interface RateLimiter {
  /** Consume a token if one is available. Returns false when the caller should be throttled. */
  tryAcquire: (nowMs: number) => boolean
}

export const createRateLimiter = (intervalSec: number, burst: number): RateLimiter => {
  let tokens = burst
  let last: number | null = null

  return {
    tryAcquire: (nowMs: number): boolean => {
      if (last !== null) {
        const refill = (nowMs - last) / 1000 / intervalSec
        tokens = Math.min(burst, tokens + refill)
      }
      last = nowMs
      if (tokens >= 1) {
        tokens -= 1
        return true
      }
      return false
    },
  }
}
