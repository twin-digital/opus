/**
 * The live, credential-backed {@link ProviderFactory} (the production one until
 * OAuth landed was {@link productionProviderFactory}, which returns `null` for
 * every Account). For a Gmail Account it builds a {@link GmailProvider} whose
 * injected client resolves + refreshes the Account's `gmail_oauth` credential
 * per call (see {@link makeLiveGmailClient}); the scheduler then polls it.
 *
 * ## The needs-auth / no-credential / non-gmail → skip contract
 *
 * The {@link ProviderFactory} seam is synchronous (the scheduler calls it inline
 * and skips a `null` result). Credential resolution, by contrast, is async — a
 * decrypt and a possible token refresh — so the factory cannot itself await a
 * credential check to decide `null`. The design therefore splits the skip
 * decision by *when it is knowable*:
 *
 *  - **Synchronously knowable — handled here.** A non-Gmail `provider_type` has
 *    no Gmail transport, so the factory returns `null` immediately (logged), and
 *    the scheduler skips the Account. (Only Gmail is supported today; an IMAP
 *    Provider slots in here later.)
 *  - **Only async-knowable — realized lazily as a skip.** Whether the Account
 *    has a usable credential (present, refreshable, not `invalid_grant`) is not
 *    known until the first Gmail call. The poll cycle's first call is
 *    `listCandidates`; the live client resolves the token there and, on
 *    {@link NoGmailCredentialError} / {@link NeedsReauthError}, throws *before*
 *    any State-DB write. {@link pollDueAccounts} catches that, logs it, and moves
 *    on without advancing the cursor — the Account is skipped and (its credential
 *    already absent / soft-deleted) stays in the needs-auth state. The net effect
 *    is identical to the factory having returned `null`; it just happens one call
 *    later, which is the only point at which the credential state is known.
 *
 * So "needs-reauth / no-credential → skipped, Account shows needs-auth" holds for
 * every path; the synchronous cases short-circuit here, the async ones surface as
 * a logged skip on the first call.
 */

import type { Encryptor } from '../crypto/encryption.js'
import type { DB } from '../db/schema.js'
import type { GoogleOAuthClient } from '../oauth/google-client.js'
import { GmailProvider } from '../providers/gmail-provider.js'
import { makeLiveGmailClient } from '../providers/live-gmail-client.js'
import type { Provider, ProviderAccount } from '../providers/provider.js'
import type { PollableAccount } from './poll-cycle.js'
import type { ProviderFactory } from './provider-factory.js'

/** Dependencies the live factory closes over. */
export interface LiveProviderFactoryDeps {
  readonly db: DB
  readonly encryptor: Encryptor
  /** The live Google OAuth client — only built when OAuth is configured, which
   * is exactly when this factory is wired in (see daemon). */
  readonly googleClient: GoogleOAuthClient
  /** Provider config (initial-sync window). Passed through to `GmailProvider`. */
  readonly providerConfig?: ConstructorParameters<typeof GmailProvider>[2]
}

/** A Gmail Account's `provider_type` value. */
const GMAIL_PROVIDER_TYPE = 'gmail'

/**
 * Build the live {@link ProviderFactory}. Returns a `GmailProvider` for a Gmail
 * Account and `null` for any non-Gmail `provider_type` (logged). Credential
 * resolution / needs-reauth skipping is realized lazily inside the Provider's
 * client (see the module header).
 */
export function createLiveProviderFactory(deps: LiveProviderFactoryDeps): ProviderFactory {
  // One Provider instance, reused across Accounts: it is stateless w.r.t. the
  // Account (it takes the ProviderAccount per call) and resolves a per-Account
  // live client through `makeClient`.
  const provider = new GmailProvider(
    deps.db,
    (account: ProviderAccount) =>
      makeLiveGmailClient({
        db: deps.db,
        encryptor: deps.encryptor,
        googleClient: deps.googleClient,
        accountId: account.id,
      }),
    deps.providerConfig,
  )

  return (account: PollableAccount): Provider | null => {
    if (account.providerType !== GMAIL_PROVIDER_TYPE) {
      console.info(
        `[grinbox][poll] account=${account.id} provider_type='${account.providerType}' is not supported; skipping`,
      )
      return null
    }
    return provider
  }
}
