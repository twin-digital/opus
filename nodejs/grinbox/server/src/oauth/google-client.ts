/**
 * The Google-client seam: the three external interactions the OAuth flow makes
 * against Google, abstracted behind one injectable interface so the routes and
 * the token lifecycle are fully unit-testable without a network (oauth-flow.md
 * "The flow"). Tests pass a fake; the live path is {@link makeGoogleOAuthClient}.
 *
 * The seam is deliberately thin — it exposes exactly the four operations the
 * flow needs and nothing of `googleapis`' surface:
 *  - {@link GoogleOAuthClient.buildConsentUrl} — pure URL construction (no I/O).
 *  - {@link GoogleOAuthClient.exchangeCode} — authorization-code → tokens.
 *  - {@link GoogleOAuthClient.fetchProfileEmail} — access token → mailbox email.
 *  - {@link GoogleOAuthClient.refreshAccessToken} — refresh token → new access
 *    token (or {@link InvalidGrantError} when the grant is gone).
 *
 * The `client_secret` lives only inside the live implementation (deployment
 * config, never the DB, never the browser, never logs — oauth-flow.md "Client
 * credentials are deployment config, not DB state").
 */

import { type Auth, google } from 'googleapis'

/** The Gmail scopes Grinbox requests at first consent (oauth-flow.md "Scopes"). */
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
] as const

/**
 * Parameters for building a consent URL. `state` and `codeChallenge` are
 * generated per flow by the pending-auth store; `redirectUri` and `clientId`
 * are deployment config.
 */
export interface ConsentUrlParams {
  readonly state: string
  /** The S256 PKCE code challenge (base64url of SHA-256(verifier)). */
  readonly codeChallenge: string
}

/** Tokens returned by the authorization-code exchange. */
export interface TokenExchangeResult {
  /**
   * The durable refresh token. Optional because Google only returns one when
   * `prompt=consent` forced a fresh grant; the callback asserts its presence
   * (oauth-flow.md "The flow" notes).
   */
  readonly refreshToken?: string
  readonly accessToken: string
  /** Access-token lifetime in seconds from now (`expires_in`). */
  readonly expiresInSeconds: number
  /** The space-delimited granted scope string Google returned. */
  readonly scope: string
}

/** A refreshed access token. */
export interface RefreshResult {
  readonly accessToken: string
  readonly expiresInSeconds: number
}

/**
 * Raised by {@link GoogleOAuthClient.refreshAccessToken} when Google returns
 * `invalid_grant` — the refresh token is no longer valid (revoked, password
 * changed, or lapsed past ~6 months of disuse; oauth-flow.md "Revocation /
 * expiry"). The token lifecycle catches this to mark the Account needs-reauth.
 */
export class InvalidGrantError extends Error {
  override readonly name = 'InvalidGrantError'
  constructor(message = 'Google refused the refresh token (invalid_grant)') {
    super(message)
  }
}

/**
 * Raised by the callback path when the token exchange succeeded but Google did
 * not return a refresh token. This is the `prompt=consent` failure mode: surfaced
 * to the operator as a retry instruction, with no credential stored
 * (oauth-flow.md "The flow" notes).
 */
export class MissingRefreshTokenError extends Error {
  override readonly name = 'MissingRefreshTokenError'
  constructor(
    message = 'Google did not return a refresh token; retry the authorization (the consent screen must be shown — prompt=consent)',
  ) {
    super(message)
  }
}

/**
 * The injectable Google-client seam. Every external Google interaction the OAuth
 * flow performs goes through this interface; the daemon injects the live
 * implementation, tests inject a fake.
 */
export interface GoogleOAuthClient {
  /**
   * Build the Google consent URL (pure; no network). Includes
   * `access_type=offline`, `prompt=consent`, the Gmail scopes, the client id,
   * the registered redirect URI, the `state`, and the PKCE `code_challenge`
   * (S256) — the mandatory set from oauth-flow.md.
   */
  buildConsentUrl(params: ConsentUrlParams): string

  /**
   * Exchange an authorization code + PKCE verifier for tokens, authenticating
   * with the `client_secret`. Rejects on a failed exchange.
   */
  exchangeCode(args: { code: string; codeVerifier: string }): Promise<TokenExchangeResult>

  /**
   * Fetch the Gmail profile email address for an access token
   * (`users.getProfile`), used to populate `accounts.settings_json.email`.
   */
  fetchProfileEmail(accessToken: string): Promise<string>

  /**
   * Refresh an access token from a refresh token. Throws {@link InvalidGrantError}
   * when Google reports the grant is gone.
   */
  refreshAccessToken(refreshToken: string): Promise<RefreshResult>
}

/** Deployment config the live Google client closes over. */
export interface GoogleOAuthClientConfig {
  readonly clientId: string
  readonly clientSecret: string
  readonly redirectUri: string
}

/** Whether a thrown googleapis error is Google's `invalid_grant` response. */
function isInvalidGrant(err: unknown): boolean {
  if (err instanceof InvalidGrantError) {
    return true
  }
  if (typeof err === 'object' && err !== null) {
    const e = err as {
      message?: unknown
      response?: { data?: { error?: unknown } }
    }
    if (e.response?.data?.error === 'invalid_grant') {
      return true
    }
    if (typeof e.message === 'string' && e.message.includes('invalid_grant')) {
      return true
    }
  }
  return false
}

/**
 * The live Google-client implementation over `googleapis`. Kept thin: it owns
 * the `client_secret` and the redirect URI but no flow logic. `google` is a value
 * import (it constructs OAuth2 clients and the Gmail service), per
 * verbatimModuleSyntax — `import type` would break the instantiation.
 *
 * Constructed by the daemon only when `GRINBOX_OAUTH_CLIENT_ID`/`_SECRET` are
 * present; the routes report "not configured" otherwise (so boot never crashes
 * on a missing OAuth client).
 */
export function makeGoogleOAuthClient(config: GoogleOAuthClientConfig): GoogleOAuthClient {
  function newOAuth2Client(): Auth.OAuth2Client {
    return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri)
  }

  return {
    buildConsentUrl(params: ConsentUrlParams): string {
      const client = newOAuth2Client()
      return client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [...GMAIL_SCOPES],
        state: params.state,
        code_challenge: params.codeChallenge,
        code_challenge_method: 'S256' as Auth.CodeChallengeMethod,
      })
    },

    async exchangeCode(args: { code: string; codeVerifier: string }): Promise<TokenExchangeResult> {
      const client = newOAuth2Client()
      const { tokens } = await client.getToken({
        code: args.code,
        codeVerifier: args.codeVerifier,
      })
      // `expiry_date` is an absolute epoch-ms timestamp; derive a relative
      // lifetime in seconds, defaulting to a conservative hour if absent.
      const expiresInSeconds =
        typeof tokens.expiry_date === 'number' ?
          Math.max(0, Math.floor((tokens.expiry_date - Date.now()) / 1000))
        : 3600
      return {
        refreshToken: tokens.refresh_token ?? undefined,
        accessToken: tokens.access_token ?? '',
        expiresInSeconds,
        scope: tokens.scope ?? '',
      }
    },

    async fetchProfileEmail(accessToken: string): Promise<string> {
      const auth = newOAuth2Client()
      auth.setCredentials({ access_token: accessToken })
      const gmail = google.gmail({ version: 'v1', auth })
      const res = await gmail.users.getProfile({ userId: 'me' })
      const email = res.data.emailAddress
      if (!email) {
        throw new Error('Gmail profile did not include an email address')
      }
      return email
    },

    async refreshAccessToken(refreshToken: string): Promise<RefreshResult> {
      const client = newOAuth2Client()
      client.setCredentials({ refresh_token: refreshToken })
      try {
        const { credentials } = await client.refreshAccessToken()
        const expiresInSeconds =
          typeof credentials.expiry_date === 'number' ?
            Math.max(0, Math.floor((credentials.expiry_date - Date.now()) / 1000))
          : 3600
        return {
          accessToken: credentials.access_token ?? '',
          expiresInSeconds,
        }
      } catch (err) {
        if (isInvalidGrant(err)) {
          throw new InvalidGrantError()
        }
        throw err
      }
    },
  }
}
