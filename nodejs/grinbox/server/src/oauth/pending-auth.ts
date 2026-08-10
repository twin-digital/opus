/**
 * The pending-auth store: a short-TTL, single-use map of `state → { pkceVerifier,
 * accountId?, createdAt }` correlating an internal `/oauth/start` with the public
 * `/oauth/callback` (oauth-flow.md "The flow").
 *
 * In-memory is the right shape for the single-process Daemon: the entire flow
 * begins and ends within one process lifetime, and a flow that outlives its
 * short TTL (5 minutes) is meant to fail anyway. The one documented consequence
 * is that **a Daemon restart mid-consent fails the in-flight flow** — the
 * operator simply clicks Add Account again. Persisting these to the DB would buy
 * nothing for that window and would add a table whose only content is ephemeral
 * single-use secrets; the data-model deliberately has no such table.
 *
 * Two invariants the store enforces:
 *  - **Single-use.** {@link PendingAuthStore.consume} atomically deletes the
 *    entry as it returns it, so a replayed `state` finds nothing.
 *  - **TTL expiry.** Entries older than the TTL are treated as absent (and
 *    pruned), so a stale `state` is rejected exactly like an unknown one.
 */

/** A pending authorization flow awaiting its callback. */
export interface PendingAuth {
  /** The PKCE verifier; replayed into the token exchange. */
  readonly pkceVerifier: string
  /**
   * The existing Account this flow re-authorizes, or `undefined` for a new
   * Account (oauth-flow.md "Re-auth"). The callback binds to it instead of
   * creating a fresh Account.
   */
  readonly accountId?: number
  /** Unix milliseconds the entry was created; drives TTL expiry. */
  readonly createdAt: number
}

export interface PendingAuthStore {
  /** Persist a pending flow keyed by its `state`. */
  put(state: string, entry: Omit<PendingAuth, 'createdAt'>): void
  /**
   * Atomically fetch-and-remove the entry for `state`, returning it only if it
   * exists and has not expired. A second call with the same `state` (replay), an
   * unknown `state`, or an expired one all return `undefined`. Single-use.
   */
  consume(state: string): PendingAuth | undefined
  /** Drop expired entries. Called opportunistically; not required for safety. */
  prune(): void
  /** Current entry count (test/observability). */
  size(): number
}

/** Default pending-auth TTL: 5 minutes (oauth-flow.md "short TTL"). */
export const DEFAULT_PENDING_AUTH_TTL_MS = 5 * 60 * 1000

export interface PendingAuthStoreOptions {
  /** Entry lifetime in milliseconds. Defaults to {@link DEFAULT_PENDING_AUTH_TTL_MS}. */
  readonly ttlMs?: number
  /** Injected clock (Unix ms) for deterministic tests; defaults to `Date.now`. */
  readonly now?: () => number
}

/**
 * Build an in-memory {@link PendingAuthStore}. The map is process-local and
 * unbounded only by the TTL — fine for a single operator clicking Add Account a
 * handful of times.
 */
export function createPendingAuthStore(options: PendingAuthStoreOptions = {}): PendingAuthStore {
  const ttlMs = options.ttlMs ?? DEFAULT_PENDING_AUTH_TTL_MS
  const now = options.now ?? Date.now
  const entries = new Map<string, PendingAuth>()

  function isExpired(entry: PendingAuth, at: number): boolean {
    return at - entry.createdAt >= ttlMs
  }

  return {
    put(state, entry): void {
      entries.set(state, { ...entry, createdAt: now() })
    },

    consume(state): PendingAuth | undefined {
      const entry = entries.get(state)
      if (entry === undefined) {
        return undefined
      }
      // Single-use: remove on read regardless of expiry, so a stale entry is
      // also cleaned up as it's rejected.
      entries.delete(state)
      if (isExpired(entry, now())) {
        return undefined
      }
      return entry
    },

    prune(): void {
      const at = now()
      for (const [state, entry] of entries) {
        if (isExpired(entry, at)) {
          entries.delete(state)
        }
      }
    },

    size(): number {
      return entries.size
    },
  }
}
