import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm'

import { type TokenCache } from './client.js'

/**
 * Durable `TokenCache` backed by an SSM SecureString parameter. Persists the Lynx JWT
 * across cold Lambda starts so the hourly schedule doesn't repeatedly hit `login` (the
 * JWT itself lasts ~95 days). A closure-scoped variable also caches the value across
 * warm-container invocations to avoid re-hitting SSM every dashboard call — including
 * the "no value yet" state, so a first-ever run doesn't re-poll SSM on every read.
 *
 * The parameter is created on demand: the first-ever `set` writes it with `Overwrite: true`
 * (SSM `PutParameter` creates if absent), and `get` treats `ParameterNotFound` as a cache
 * miss. No out-of-band setup — the initial cold start mints normally and populates the
 * parameter for future runs.
 *
 * Invariants:
 * - After `get` returns, subsequent `get` calls short-circuit until a successful `set`.
 * - After `set(t)` returns OR throws, the in-memory cache holds `t`. Persistence to SSM
 *   is best-effort — a durable-write failure loses the persistent cache-across-cold-start
 *   benefit, but the JWT itself is valid and stays reachable within the warm container.
 */

export interface SsmTokenCacheOptions {
  readonly parameterName: string
  /** Injectable for tests; defaults to a client configured from the Lambda's region. */
  readonly client?: SSMClient
}

export const createSsmTokenCache = (options: SsmTokenCacheOptions): TokenCache => {
  const client = options.client ?? new SSMClient({})
  let cached: string | undefined
  let loaded = false

  return {
    async get() {
      if (loaded) {
        return cached
      }
      try {
        const res = await client.send(new GetParameterCommand({ Name: options.parameterName, WithDecryption: true }))
        cached = res.Parameter?.Value
      } catch (error) {
        // First-ever run: parameter doesn't exist. Cache the "not found" state; a later
        // `set` populates it and future runs read fresh.
        if (!(error instanceof Error && error.name === 'ParameterNotFound')) {
          throw error
        }
      }
      loaded = true
      return cached
    },

    async set(token: string) {
      try {
        await client.send(
          new PutParameterCommand({
            Name: options.parameterName,
            Value: token,
            Type: 'SecureString',
            Overwrite: true,
          }),
        )
      } finally {
        // The JWT itself is valid regardless of whether the durable write landed. Update
        // in-memory unconditionally so the current warm container keeps working — a
        // subsequent `set` retries the persistent write on the next `login`.
        cached = token
        loaded = true
      }
    },
  }
}
