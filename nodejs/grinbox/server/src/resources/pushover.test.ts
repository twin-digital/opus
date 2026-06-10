import { describe, expect, it, vi } from 'vitest'
import { type FetchLike, PushoverApiError, sendNotification } from './pushover.js'

/**
 * Pushover underlying client with a mocked fetch transport (no network).
 * Exercises a representative send and the non-2xx → error path.
 */

const creds = { appToken: 'app', userKey: 'usr' }

describe('pushover sendNotification', () => {
  it('posts credentials + message and returns the request id', async () => {
    const fetch: FetchLike = vi.fn(async (_url, init) => {
      expect(init.method).toBe('POST')
      const params = new URLSearchParams(init.body)
      expect(params.get('token')).toBe('app')
      expect(params.get('user')).toBe('usr')
      expect(params.get('message')).toBe('hello')
      expect(params.get('title')).toBe('Greeting')
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ status: 1, request: 'req-123' }),
      }
    })
    const result = await sendNotification(
      { fetch, credentials: creds, signal: new AbortController().signal },
      { title: 'Greeting', message: 'hello' },
    )
    expect(result).toEqual({ message_id: 'req-123' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('throws PushoverApiError on a non-2xx response', async () => {
    const fetch: FetchLike = vi.fn(async () => ({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    }))
    await expect(
      sendNotification({ fetch, credentials: creds, signal: new AbortController().signal }, { message: 'x' }),
    ).rejects.toBeInstanceOf(PushoverApiError)
  })
})
