import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MessageApiError, errorMessage, messageKey, toApiError, toQueryParams, useReplayMessage } from './messages.js'

/**
 * Data-layer pure helpers for the Inbox / Message-detail surface. These never
 * run under the component tests (which mock at the hook boundary), so the
 * error-mapping, query-param construction, and cache-invalidation behavior are
 * pinned directly here.
 */

// Mock the typed client so the replay mutation resolves without a network call.
const replayPost = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }))
vi.mock('./api.js', () => ({
  apiBase: '',
  api: {
    api: {
      messages: {
        ':id': { replay: { $post: () => replayPost() } },
      },
    },
  },
}))

afterEach(() => {
  vi.clearAllMocks()
})

/** A minimal `Response`-shaped stub whose `json()` resolves the given body. */
function jsonResponse(status: number, body: unknown): Response {
  return {
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

/** A `Response` whose `json()` rejects (non-JSON error body). */
function nonJsonResponse(status: number): Response {
  return {
    status,
    json: () => Promise.reject(new SyntaxError('Unexpected token')),
  } as unknown as Response
}

describe('toApiError', () => {
  it('maps an object error body to its code + message', async () => {
    const err = await toApiError(
      jsonResponse(400, {
        error: { code: 'bad_request', message: 'Nope.' },
      }),
    )
    expect(err).toBeInstanceOf(MessageApiError)
    expect(err.code).toBe('bad_request')
    expect(err.message).toBe('Nope.')
  })

  it('defaults code + message when the object error omits them', async () => {
    const err = await toApiError(jsonResponse(418, { error: {} }))
    expect(err.code).toBe('error')
    expect(err.message).toBe('Request failed (HTTP 418).')
  })

  it('maps a string error body to the code with a generic message', async () => {
    const err = await toApiError(jsonResponse(409, { error: 'in_use' }))
    expect(err.code).toBe('in_use')
    expect(err.message).toBe('Request failed (HTTP 409).')
  })

  it('falls back to a generic error when no error field is present', async () => {
    const err = await toApiError(jsonResponse(500, {}))
    expect(err.code).toBe('error')
    expect(err.message).toBe('Request failed (HTTP 500).')
  })

  it('falls back to a generic error when the body is not JSON', async () => {
    const err = await toApiError(nonJsonResponse(502))
    expect(err.code).toBe('error')
    expect(err.message).toBe('Request failed (HTTP 502).')
  })
})

describe('toQueryParams', () => {
  it('always includes limit + offset and omits undefined filters', () => {
    expect(toQueryParams({ limit: 25, offset: 50 })).toEqual({
      limit: '25',
      offset: '50',
    })
  })

  it('includes every set filter, stringifying numbers', () => {
    expect(
      toQueryParams({
        accountId: 1,
        pipelineId: 7,
        status: 'failed',
        tagKey: 'urgency',
        tagValue: 'high',
        dateFrom: 100,
        dateTo: 200,
        q: 'invoice',
        limit: 25,
        offset: 0,
      }),
    ).toEqual({
      accountId: '1',
      pipelineId: '7',
      status: 'failed',
      tagKey: 'urgency',
      tagValue: 'high',
      dateFrom: '100',
      dateTo: '200',
      q: 'invoice',
      limit: '25',
      offset: '0',
    })
  })

  it('drops an empty-string q via the length guard', () => {
    expect(toQueryParams({ q: '', limit: 25, offset: 0 })).toEqual({
      limit: '25',
      offset: '0',
    })
  })
})

describe('errorMessage', () => {
  it('returns a MessageApiError message', () => {
    expect(errorMessage(new MessageApiError('x', 'boom'))).toBe('boom')
  })

  it('returns a plain Error message', () => {
    expect(errorMessage(new Error('generic'))).toBe('generic')
  })

  it('returns a fallback for a non-Error value', () => {
    expect(errorMessage('just a string')).toBe('Something went wrong.')
  })
})

describe('useReplayMessage cache invalidation', () => {
  it('invalidates the message detail + the messages list on success', async () => {
    const qc = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    })
    const invalidate = vi.spyOn(qc, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )

    const { result } = renderHook(() => useReplayMessage(42), { wrapper })
    result.current.mutate()

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })

    expect(replayPost).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: messageKey(42) })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['messages'] })
  })
})
