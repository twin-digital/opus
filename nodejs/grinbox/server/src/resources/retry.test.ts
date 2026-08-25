import { describe, expect, it, vi } from 'vitest'
import { RetryAbortedError, policyFor, withRetry } from './retry.js'

/**
 * Retry policy + wrapper. Uses a zero-delay policy so tests don't wait on real
 * backoff timers. Covers: success after N transient failures, exhaustion →
 * throw, no-retry op called exactly once, and abort stops retrying.
 */

const FAST_3X = { maxRetries: 3, baseDelayMs: 0, exponential: false }
const NO_RETRY = { maxRetries: 0, baseDelayMs: 0, exponential: false }

describe('policyFor', () => {
  it('maps the documented retry policies', () => {
    expect(policyFor('pushover_api', 'send_notification').maxRetries).toBe(0)
    expect(policyFor('mail_sender', 'send_message').maxRetries).toBe(0)
    expect(policyFor('mailbox', 'apply_category').maxRetries).toBe(2)
    expect(policyFor('mailbox', 'fetch_metadata').maxRetries).toBe(3)
    expect(policyFor('mailbox', 'list_messages').maxRetries).toBe(3)
    expect(policyFor('llm_bedrock', 'invoke_model').maxRetries).toBe(3)
  })

  it('defaults an unknown op to no retry', () => {
    expect(policyFor('mailbox', 'unknown_op').maxRetries).toBe(0)
  })
})

describe('withRetry', () => {
  it('succeeds after N transient failures within policy', async () => {
    const ctrl = new AbortController()
    let calls = 0
    const op = vi.fn(async () => {
      calls++
      if (calls < 3) {
        throw new Error('transient')
      }
      return 'ok'
    })
    const result = await withRetry(FAST_3X, ctrl.signal, op)
    expect(result).toBe('ok')
    expect(op).toHaveBeenCalledTimes(3)
  })

  it('throws the last error once retries are exhausted', async () => {
    const ctrl = new AbortController()
    const op = vi.fn(async () => {
      throw new Error('always')
    })
    await expect(withRetry(FAST_3X, ctrl.signal, op)).rejects.toThrow('always')
    // 1 initial + 3 retries = 4 attempts.
    expect(op).toHaveBeenCalledTimes(4)
  })

  it('a no-retry op fails immediately — underlying called once', async () => {
    const ctrl = new AbortController()
    const op = vi.fn(async () => {
      throw new Error('boom')
    })
    await expect(withRetry(NO_RETRY, ctrl.signal, op)).rejects.toThrow('boom')
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('stops retrying when the signal aborts during the backoff', async () => {
    const ctrl = new AbortController()
    let calls = 0
    const op = vi.fn(async () => {
      calls++
      // Abort after the first failure, while we are about to back off.
      if (calls === 1) {
        ctrl.abort('timeout')
      }
      throw new Error('fail')
    })
    await expect(withRetry({ maxRetries: 3, baseDelayMs: 50, exponential: false }, ctrl.signal, op)).rejects.toThrow()
    // The first attempt ran and threw; the abort prevented further attempts.
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('does not invoke the op at all if already aborted', async () => {
    const ctrl = new AbortController()
    ctrl.abort('pre-aborted')
    const op = vi.fn(async () => 'never')
    await expect(withRetry(FAST_3X, ctrl.signal, op)).rejects.toBeInstanceOf(RetryAbortedError)
    expect(op).not.toHaveBeenCalled()
  })
})

describe('the three retry classes (d-b4yifc70)', () => {
  it('gives every mailbox write two further attempts at a fixed wait', () => {
    for (const operation of ['apply_category', 'archive', 'file']) {
      expect(policyFor('mailbox', operation)).toEqual({ maxRetries: 2, baseDelayMs: 200, exponential: false })
    }
  })

  it('gives every read three further attempts with a doubling wait', () => {
    for (const [resource, operation] of [
      ['mailbox', 'fetch_metadata'],
      ['mailbox', 'fetch_body'],
      ['mailbox', 'list_messages'],
      ['llm_bedrock', 'invoke_model'],
    ] as const) {
      expect(policyFor(resource, operation)).toMatchObject({ maxRetries: 3, exponential: true })
    }
  })

  it('never retries a notification or a send', () => {
    expect(policyFor('pushover_api', 'send_notification').maxRetries).toBe(0)
    expect(policyFor('mail_sender', 'send_message').maxRetries).toBe(0)
  })

  it('never retries an operation with no policy of its own', () => {
    expect(policyFor('mailbox', 'something_new').maxRetries).toBe(0)
  })
})
