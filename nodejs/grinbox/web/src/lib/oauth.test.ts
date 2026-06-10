import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { callbackOriginFromConsentUrl, runOAuthFlow } from './oauth.js'

/**
 * OAuth client-flow tests (no network, no real pop-up). Covers origin
 * derivation; the security-critical fail-closed origin check (a wrong-origin or
 * undeterminable-origin post must not be trusted); and every OAuthResult outcome
 * the UI must handle without hanging — success, not_configured, popup_blocked,
 * cancelled, message-error, and the fetch/non-503 error branches.
 */

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const CALLBACK = 'https://grinbox.pegasuspad.com/oauth/callback'

/** A Google-style consent URL whose `redirect_uri` is the public callback. */
function consentUrlWith(redirectUri = CALLBACK): string {
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=x&redirect_uri=${encodeURIComponent(redirectUri)}&state=abc`
}

describe('callbackOriginFromConsentUrl', () => {
  it('extracts the public callback origin from redirect_uri', () => {
    expect(callbackOriginFromConsentUrl(consentUrlWith())).toBe('https://grinbox.pegasuspad.com')
  })

  it('returns null when redirect_uri is absent or unparseable', () => {
    expect(callbackOriginFromConsentUrl('https://accounts.google.com/o/oauth2')).toBeNull()
    expect(callbackOriginFromConsentUrl('not a url')).toBeNull()
  })
})

describe('runOAuthFlow', () => {
  // Fake timers so the pop-up close-poll (a 500ms setInterval) can be advanced
  // deterministically. Microtasks (the awaited fetch/json mocks) are not faked,
  // so `await Promise.resolve()` still flushes them.
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns not_configured on a 503 from /oauth/start', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 503,
          json: () =>
            Promise.resolve({
              error: 'oauth_not_configured',
              message: 'OAuth is not configured',
            }),
        }),
      ),
    )
    const result = await runOAuthFlow()
    expect(result).toEqual({
      kind: 'not_configured',
      message: 'OAuth is not configured',
    })
  })

  it('returns popup_blocked when window.open yields null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ consent_url: consentUrlWith() }),
        }),
      ),
    )
    vi.stubGlobal(
      'open',
      vi.fn(() => null),
    )
    const result = await runOAuthFlow()
    expect(result).toEqual({ kind: 'popup_blocked' })
  })

  it('resolves success when the pop-up posts a trusted message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ consent_url: consentUrlWith() }),
        }),
      ),
    )
    const fakePopup = { closed: false } as Window
    vi.stubGlobal(
      'open',
      vi.fn(() => fakePopup),
    )

    const promise = runOAuthFlow()
    // Let the start fetch settle and the listener attach.
    await Promise.resolve()
    await Promise.resolve()

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://grinbox.pegasuspad.com',
        data: { source: 'grinbox-oauth', ok: true, account_id: 42 },
      }),
    )

    await expect(promise).resolves.toEqual({ kind: 'success', accountId: 42 })
  })

  it('ignores a post from the wrong origin and trusts only the callback origin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ consent_url: consentUrlWith() }),
        }),
      ),
    )
    const fakePopup = { closed: false } as Window
    vi.stubGlobal(
      'open',
      vi.fn(() => fakePopup),
    )

    const promise = runOAuthFlow()
    await Promise.resolve()
    await Promise.resolve()

    // The evil-origin message carries a DISTINCT account_id so that if the
    // origin guard is bypassed (it settles the promise first), the resolved
    // result is `{ success, accountId: 999 }` and the `not 999` assertion fails.
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://evil.example.com',
        data: { source: 'grinbox-oauth', ok: true, account_id: 999 },
      }),
    )
    // Only the public callback origin is trusted.
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://grinbox.pegasuspad.com',
        data: { source: 'grinbox-oauth', ok: true, account_id: 42 },
      }),
    )

    await expect(promise).resolves.toEqual({ kind: 'success', accountId: 42 })
  })

  it('fails closed: trusts no post when the expected origin is unknown', async () => {
    // No parseable redirect_uri → callbackOriginFromConsentUrl returns null →
    // expectedOrigin is null. The flow must NOT trust any post (fail closed); it
    // should only settle when the user closes the pop-up (cancelled).
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              consent_url: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc',
            }),
        }),
      ),
    )
    const fakePopup = { closed: false }
    vi.stubGlobal(
      'open',
      vi.fn(() => fakePopup as Window),
    )

    const promise = runOAuthFlow()
    await Promise.resolve()
    await Promise.resolve()

    // A would-be-success post from the (only) plausible origin must be ignored.
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://grinbox.pegasuspad.com',
        data: { source: 'grinbox-oauth', ok: true, account_id: 42 },
      }),
    )
    // Give the ignored post a chance to (wrongly) settle the promise.
    await Promise.resolve()
    await Promise.resolve()

    // It did not resolve success; the pop-up closing is the only way out.
    fakePopup.closed = true
    await vi.advanceTimersByTimeAsync(600)

    await expect(promise).resolves.toEqual({ kind: 'cancelled' })
  })

  it('resolves cancelled when the user closes the pop-up', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ consent_url: consentUrlWith() }),
        }),
      ),
    )
    const fakePopup = { closed: false }
    vi.stubGlobal(
      'open',
      vi.fn(() => fakePopup as Window),
    )

    const promise = runOAuthFlow()
    await Promise.resolve()
    await Promise.resolve()

    fakePopup.closed = true
    await vi.advanceTimersByTimeAsync(600)

    await expect(promise).resolves.toEqual({ kind: 'cancelled' })
  })

  it('resolves error when the callback posts a failure message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ consent_url: consentUrlWith() }),
        }),
      ),
    )
    const fakePopup = { closed: false } as Window
    vi.stubGlobal(
      'open',
      vi.fn(() => fakePopup),
    )

    const promise = runOAuthFlow()
    await Promise.resolve()
    await Promise.resolve()

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://grinbox.pegasuspad.com',
        data: { source: 'grinbox-oauth', ok: false, error: 'consent denied' },
      }),
    )

    await expect(promise).resolves.toEqual({
      kind: 'error',
      message: 'consent denied',
    })
  })

  it('returns error when the start fetch throws (network down)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('network down'))),
    )
    const result = await runOAuthFlow()
    expect(result.kind).toBe('error')
  })

  it('returns error on a non-503 !ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        }),
      ),
    )
    const result = await runOAuthFlow()
    expect(result).toEqual({
      kind: 'error',
      message: "Couldn't start authorization (HTTP 500).",
    })
  })

  it('falls back to default copy on a 503 with no message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ error: 'oauth_not_configured' }),
        }),
      ),
    )
    const result = await runOAuthFlow()
    expect(result.kind).toBe('not_configured')
    if (result.kind === 'not_configured') {
      expect(result.message).toMatch(/isn't configured/)
    }
  })
})
