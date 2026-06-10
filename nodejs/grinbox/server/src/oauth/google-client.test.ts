import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The live {@link makeGoogleOAuthClient} adapter with `googleapis` mocked (no
 * network), mirroring `resources/gmail.test.ts`'s `vi.mock('googleapis')`. Every
 * other OAuth suite injects a fake {@link GoogleOAuthClient}, so this is the only
 * place the real adapter — and in particular the three-shape `isInvalidGrant`
 * detection — is exercised. A miss there is account-bricking: production would
 * fail to mark accounts needs-reauth while every faked test still passes.
 *
 * The mock replicates just enough of `Auth.OAuth2Client`: `generateAuthUrl`
 * (faithful URL construction so the consent-URL params are real assertions),
 * `getToken`, `setCredentials`, and `refreshAccessToken`. `google.gmail` is a
 * factory returning a `users.getProfile` stub for `fetchProfileEmail`.
 */

// --- googleapis mock --------------------------------------------------------

const generateAuthUrl = vi.fn()
const getToken = vi.fn()
const refreshAccessToken = vi.fn()
const setCredentials = vi.fn()
const getProfile = vi.fn()

/** Records the (clientId, clientSecret, redirectUri) each OAuth2 is built with. */
const oauth2Ctor = vi.fn()

class FakeOAuth2 {
  credentials: Record<string, unknown> = {}
  constructor(clientId?: string, clientSecret?: string, redirectUri?: string) {
    oauth2Ctor(clientId, clientSecret, redirectUri)
  }
  // Faithful enough to assert the adapter's option set: query-encode the opts
  // exactly as the real client would surface them on the consent URL.
  generateAuthUrl(opts: Record<string, string | string[] | undefined>): string {
    generateAuthUrl(opts)
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', 'client-123')
    url.searchParams.set('redirect_uri', 'https://grinbox.example/oauth/callback')
    for (const [key, value] of Object.entries(opts)) {
      if (value === undefined) {
        continue
      }
      url.searchParams.set(key, Array.isArray(value) ? value.join(' ') : value)
    }
    return url.toString()
  }
  async getToken(args: unknown): Promise<unknown> {
    return getToken(args)
  }
  setCredentials(creds: Record<string, unknown>): void {
    setCredentials(creds)
    this.credentials = creds
  }
  async refreshAccessToken(): Promise<unknown> {
    return refreshAccessToken()
  }
}

const gmailFactory = vi.fn(() => ({
  users: { getProfile },
}))

vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: FakeOAuth2 },
    gmail: gmailFactory,
  },
}))

const { makeGoogleOAuthClient, InvalidGrantError, GMAIL_SCOPES } = await import('./google-client.js')

const CONFIG = {
  clientId: 'client-123',
  clientSecret: 'secret-xyz',
  redirectUri: 'https://grinbox.example/oauth/callback',
}

describe('makeGoogleOAuthClient (live googleapis adapter)', () => {
  beforeEach(() => {
    generateAuthUrl.mockReset()
    getToken.mockReset()
    refreshAccessToken.mockReset()
    setCredentials.mockReset()
    getProfile.mockReset()
    oauth2Ctor.mockClear()
    gmailFactory.mockClear()
  })

  describe('isInvalidGrant (via refreshAccessToken)', () => {
    // The three documented shapes (google-client.ts:132-145). Each must map to
    // InvalidGrantError so the token lifecycle marks the Account needs-reauth.
    it('detects shape 1: a thrown InvalidGrantError passes through', async () => {
      const client = makeGoogleOAuthClient(CONFIG)
      refreshAccessToken.mockRejectedValue(new InvalidGrantError())
      await expect(client.refreshAccessToken('rt')).rejects.toBeInstanceOf(InvalidGrantError)
    })

    it('detects shape 2: response.data.error === "invalid_grant"', async () => {
      const client = makeGoogleOAuthClient(CONFIG)
      refreshAccessToken.mockRejectedValue({
        response: { data: { error: 'invalid_grant' } },
      })
      await expect(client.refreshAccessToken('rt')).rejects.toBeInstanceOf(InvalidGrantError)
    })

    it('detects shape 3: an Error whose message includes "invalid_grant"', async () => {
      const client = makeGoogleOAuthClient(CONFIG)
      refreshAccessToken.mockRejectedValue(new Error('invalid_grant: token has been expired or revoked'))
      await expect(client.refreshAccessToken('rt')).rejects.toBeInstanceOf(InvalidGrantError)
    })

    it('does NOT misclassify an unrelated error as invalid_grant (rethrows as-is)', async () => {
      const client = makeGoogleOAuthClient(CONFIG)
      const transient = new Error('503 backend unavailable')
      refreshAccessToken.mockRejectedValue(transient)
      await expect(client.refreshAccessToken('rt')).rejects.toBe(transient)
    })

    it('does NOT misclassify a non-invalid_grant response error', async () => {
      const client = makeGoogleOAuthClient(CONFIG)
      const err = { response: { data: { error: 'temporarily_unavailable' } } }
      refreshAccessToken.mockRejectedValue(err)
      await expect(client.refreshAccessToken('rt')).rejects.toBe(err)
    })
  })

  describe('refreshAccessToken (success)', () => {
    it('uses the refresh token as credentials and converts expiry_date to seconds', async () => {
      const client = makeGoogleOAuthClient(CONFIG)
      const nowMs = Date.now()
      refreshAccessToken.mockResolvedValue({
        credentials: {
          access_token: 'fresh-access',
          expiry_date: nowMs + 7200 * 1000,
        },
      })
      const result = await client.refreshAccessToken('the-refresh-token')
      expect(result.accessToken).toBe('fresh-access')
      // ~7200s out (allow a small clock-skew window for the Date.now() inside).
      expect(result.expiresInSeconds).toBeGreaterThan(7100)
      expect(result.expiresInSeconds).toBeLessThanOrEqual(7200)
      expect(setCredentials).toHaveBeenCalledWith({
        refresh_token: 'the-refresh-token',
      })
    })

    it('falls back to 3600s when the refresh response omits expiry_date', async () => {
      const client = makeGoogleOAuthClient(CONFIG)
      refreshAccessToken.mockResolvedValue({
        credentials: { access_token: 'fresh-access' },
      })
      const result = await client.refreshAccessToken('rt')
      expect(result.expiresInSeconds).toBe(3600)
    })
  })

  describe('exchangeCode', () => {
    it('converts expiry_date to a relative second lifetime', async () => {
      const client = makeGoogleOAuthClient(CONFIG)
      const nowMs = Date.now()
      getToken.mockResolvedValue({
        tokens: {
          refresh_token: 'rt-1',
          access_token: 'at-1',
          expiry_date: nowMs + 3600 * 1000,
          scope: GMAIL_SCOPES.join(' '),
        },
      })
      const result = await client.exchangeCode({
        code: 'auth-code',
        codeVerifier: 'verifier-abc',
      })
      expect(result.refreshToken).toBe('rt-1')
      expect(result.accessToken).toBe('at-1')
      expect(result.scope).toBe(GMAIL_SCOPES.join(' '))
      expect(result.expiresInSeconds).toBeGreaterThan(3500)
      expect(result.expiresInSeconds).toBeLessThanOrEqual(3600)
    })

    it('falls back to 3600s when the token response omits expiry_date', async () => {
      const client = makeGoogleOAuthClient(CONFIG)
      getToken.mockResolvedValue({
        tokens: { access_token: 'at-1', scope: '' },
      })
      const result = await client.exchangeCode({
        code: 'c',
        codeVerifier: 'v',
      })
      expect(result.expiresInSeconds).toBe(3600)
      expect(result.refreshToken).toBeUndefined()
    })

    it('passes the exact PKCE code verifier through to getToken', async () => {
      const client = makeGoogleOAuthClient(CONFIG)
      getToken.mockResolvedValue({ tokens: { access_token: 'at' } })
      await client.exchangeCode({
        code: 'the-code',
        codeVerifier: 'the-stored-verifier',
      })
      expect(getToken).toHaveBeenCalledWith({
        code: 'the-code',
        codeVerifier: 'the-stored-verifier',
      })
    })
  })

  describe('fetchProfileEmail', () => {
    it('returns the Gmail profile email using the access token as auth', async () => {
      const client = makeGoogleOAuthClient(CONFIG)
      getProfile.mockResolvedValue({
        data: { emailAddress: 'mailbox@example.com' },
      })
      const email = await client.fetchProfileEmail('access-token-1')
      expect(email).toBe('mailbox@example.com')
      // The access token was set on the auth client passed to google.gmail.
      expect(setCredentials).toHaveBeenCalledWith({
        access_token: 'access-token-1',
      })
      expect(gmailFactory).toHaveBeenCalledWith(expect.objectContaining({ version: 'v1' }))
    })

    it('throws when the profile has no email address', async () => {
      const client = makeGoogleOAuthClient(CONFIG)
      getProfile.mockResolvedValue({ data: {} })
      await expect(client.fetchProfileEmail('at')).rejects.toThrow(/did not include an email/)
    })
  })

  describe('buildConsentUrl', () => {
    it('emits the spec-mandatory consent params on the live adapter URL', () => {
      const client = makeGoogleOAuthClient(CONFIG)
      const consentUrl = client.buildConsentUrl({
        state: 'state-xyz',
        codeChallenge: 'challenge-abc',
      })
      const url = new URL(consentUrl)
      expect(url.searchParams.get('access_type')).toBe('offline')
      expect(url.searchParams.get('prompt')).toBe('consent')
      expect(url.searchParams.get('code_challenge')).toBe('challenge-abc')
      expect(url.searchParams.get('code_challenge_method')).toBe('S256')
      expect(url.searchParams.get('state')).toBe('state-xyz')
      // Both Gmail scopes, space-delimited.
      expect(url.searchParams.get('scope')).toBe(GMAIL_SCOPES.join(' '))
      expect(GMAIL_SCOPES).toContain('https://www.googleapis.com/auth/gmail.modify')
      expect(GMAIL_SCOPES).toContain('https://www.googleapis.com/auth/gmail.send')
    })

    it('constructs the OAuth2 client with the deployment client id/secret/redirect', () => {
      const client = makeGoogleOAuthClient(CONFIG)
      client.buildConsentUrl({ state: 's', codeChallenge: 'c' })
      expect(oauth2Ctor).toHaveBeenCalledWith('client-123', 'secret-xyz', 'https://grinbox.example/oauth/callback')
    })
  })
})
