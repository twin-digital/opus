/**
 * The {@link ProviderFactory} seam: maps an Account to a live {@link Provider},
 * or `null` when the Account has no usable backend client yet.
 *
 * This is the single injection point between the poll scheduler and the
 * credential-backed Provider transports. The scheduler resolves each due Account
 * through the factory and **skips** the ones it returns `null` for (logging "no
 * provider configured / needs auth"), so the poll loop runs harmlessly against
 * an Account that isn't authenticated rather than crashing the cycle.
 *
 * ## What the OAuth task fills
 *
 * For Gmail, building a live `GmailProvider` requires the Account's stored OAuth
 * Credential (`credentials` row, `kind='gmail_oauth'`, account-scoped): the
 * factory must resolve that Credential, decrypt `data_enc`, refresh the access
 * token if expired, and construct the `GmailProviderClient` over the
 * authenticated `googleapis` client (see `GmailProvider`'s injected-client
 * seam). **None of that lives here** — credential resolution and token refresh
 * are the OAuth task's responsibility. This module defines only the seam shape
 * and the production factory's null-until-auth behavior.
 *
 * {@link productionProviderFactory} therefore returns `null` for every Account
 * today: there is no credential resolver wired in, so no Account has a usable
 * Provider. When OAuth lands, its resolver is injected here (or this factory is
 * replaced by one that closes over it) and Gmail Accounts begin returning a real
 * `GmailProvider`; the scheduler and `pollAccount` need no change.
 */

import type { Provider } from '../providers/provider.js'
import type { PollableAccount } from './poll-cycle.js'

/**
 * Maps an Account to the Provider that polls it, or `null` when the Account has
 * no usable backend client (no credential / not yet authenticated / unsupported
 * provider type). The scheduler skips `null` Accounts.
 *
 * Synchronous by design: resolving the seam is a cheap lookup/construction.
 * Token refresh — the one potentially-async step — is the OAuth task's concern
 * and happens lazily inside the live `GmailProviderClient`'s calls, not here.
 */
export type ProviderFactory = (account: PollableAccount) => Provider | null

/**
 * The production factory. Returns `null` for every Account until the OAuth task
 * wires credential resolution + a Gmail client builder (see module header).
 * Until then the poll loop ticks and finds nothing pollable, which is the
 * intended idle-but-wired state.
 */
export function productionProviderFactory(): ProviderFactory {
  return (account: PollableAccount): Provider | null => {
    console.info(`[grinbox][poll] account=${account.id} has no provider configured (needs auth); skipping`)
    return null
  }
}
