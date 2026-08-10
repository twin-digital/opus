/**
 * Gmail OAuth surface (oauth-flow.md): the Google-client seam, the in-memory
 * pending-auth store, the start/callback flow, the encrypted token storage +
 * refresh lifecycle, and the Hono `/oauth/*` routes.
 *
 * The live ProviderFactory follow-up consumes {@link resolveGmailAccessToken} to
 * build an authenticated `GmailProviderClient`: call it per Account to obtain a
 * fresh access token (it refreshes + persists as needed), set it on a
 * `google.auth.OAuth2` client, and back the `GmailProviderClient` with that auth.
 * A {@link NeedsReauthError} / {@link NoGmailCredentialError} means "skip this
 * Account" — the factory returns `null` and the poll loop skips it.
 */

export {
  type GoogleOAuthClient,
  type GoogleOAuthClientConfig,
  type ConsentUrlParams,
  type TokenExchangeResult,
  type RefreshResult,
  GMAIL_SCOPES,
  InvalidGrantError,
  MissingRefreshTokenError,
  makeGoogleOAuthClient,
} from './google-client.js'

export {
  type PendingAuth,
  type PendingAuthStore,
  type PendingAuthStoreOptions,
  DEFAULT_PENDING_AUTH_TTL_MS,
  createPendingAuthStore,
} from './pending-auth.js'

export { type PkcePair, generatePkcePair, generateState } from './pkce.js'

export {
  type StartAuthorizationInput,
  type StartAuthorizationResult,
  type CompleteAuthorizationInput,
  type CompleteAuthorizationResult,
  AccountNotFoundError,
  InvalidStateError,
  DEFAULT_USER_ID,
  startAuthorization,
  completeAuthorization,
} from './flow.js'

export {
  type GmailTokenPayload,
  ACCESS_TOKEN_REFRESH_SKEW_SECONDS,
  GMAIL_OAUTH_KIND,
  NeedsReauthError,
  NoGmailCredentialError,
  decryptTokenPayload,
  encryptTokenPayload,
  gmailTokenPayloadSchema,
  resolveGmailAccessToken,
  storeGmailCredential,
} from './token-store.js'

export { type OAuthRouteDeps, createOAuthRoutes } from './routes.js'
