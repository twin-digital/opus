import { describe, expect, it } from 'vitest'
import type { GmailMessagePayload } from './gmail-provider.js'
import { parseGmailMessage } from './gmail-shapes.js'

/**
 * Gmail payload → {@link FetchedMessage} normalization in isolation: header
 * mapping, `internalDate` (ms) → seconds, `Date`-header fallback, and the
 * read-path body invariant (`bodyFetched: false`).
 */

function payload(overrides: Partial<GmailMessagePayload> = {}): GmailMessagePayload {
  return {
    id: 'm1',
    threadId: 't1',
    snippet: 'a preview',
    internalDate: '1700000000000',
    headers: {
      from: 'sender@example.com',
      to: 'me@example.com',
      subject: 'Hello',
    },
    ...overrides,
  }
}

describe('parseGmailMessage', () => {
  it('maps headers, snippet, thread id, and internalDate (ms→s)', () => {
    const m = parseGmailMessage(payload())
    expect(m.backendMessageId).toBe('m1')
    expect(m.backendThreadId).toBe('t1')
    expect(m.from).toBe('sender@example.com')
    expect(m.to).toBe('me@example.com')
    expect(m.subject).toBe('Hello')
    expect(m.snippet).toBe('a preview')
    expect(m.receivedAt).toBe(1700000000)
    expect(m.bodyFetched).toBe(false)
    expect(m.headers).toEqual(payload().headers)
  })

  it('nulls absent headers', () => {
    const m = parseGmailMessage(payload({ headers: {}, threadId: null, snippet: null }))
    expect(m.from).toBeNull()
    expect(m.to).toBeNull()
    expect(m.subject).toBeNull()
    expect(m.backendThreadId).toBeNull()
    expect(m.snippet).toBeNull()
  })

  it('falls back to the Date header when internalDate is absent', () => {
    const m = parseGmailMessage(
      payload({
        internalDate: null,
        headers: { date: 'Tue, 14 Nov 2023 22:13:20 +0000' },
      }),
    )
    // Hard-coded oracle (1700000000 = 2023-11-14T22:13:20Z) rather than the
    // same Date.parse formula the code uses — an independent expected value.
    expect(m.receivedAt).toBe(1700000000)
  })

  it('falls back to the Date header when internalDate is non-finite (e.g. "NaN")', () => {
    // A garbage internalDate (`Number('abc')` → NaN) must not produce a NaN
    // receivedAt; the Date-header fallback covers it.
    const m = parseGmailMessage(
      payload({
        internalDate: 'not-a-number',
        headers: { date: 'Tue, 14 Nov 2023 22:13:20 +0000' },
      }),
    )
    expect(m.receivedAt).toBe(1700000000)
  })

  it('yields null receivedAt when internalDate is non-finite and no Date header exists', () => {
    const m = parseGmailMessage(payload({ internalDate: 'NaN', headers: { from: 'x@y.com' } }))
    expect(m.receivedAt).toBeNull()
  })

  it('yields null receivedAt when neither internalDate nor a parseable Date exists', () => {
    const m = parseGmailMessage(payload({ internalDate: null, headers: { from: 'x@y.com' } }))
    expect(m.receivedAt).toBeNull()
  })
})
