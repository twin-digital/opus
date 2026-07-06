import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm'

import { type TokenCache } from './client.js'

/**
 * Durable `TokenCache` backed by an SSM SecureString parameter. Persists the Lynx JWT
 * across cold Lambda starts so the hourly schedule doesn't repeatedly hit `login` (the
 * JWT itself lasts ~95 days). A closure-scoped variable also caches the value across
 * warm-container invocations to avoid re-hitting SSM every dashboard call.
 *
 * The parameter is created on demand: the first-ever `set` writes it with `Overwrite: true`
 * (SSM `PutParameter` creates if absent), and `get` treats `ParameterNotFound` as a cache
 * miss. No out-of-band setup — the initial cold start mints normally and populates the
 * parameter for future runs.
 */

export interface SsmTokenCacheOptions {
  readonly parameterName: string
  /** Injectable for tests; defaults to a client configured from the Lambda's region. */
  readonly client?: SSMClient
}

export const createSsmTokenCache = (options: SsmTokenCacheOptions): TokenCache => {
  const client = options.client ?? new SSMClient({})
  let cached: string | undefined

  return {
    async get() {
      if (cached !== undefined) {
        return cached
      }
      try {
        const res = await client.send(new GetParameterCommand({ Name: options.parameterName, WithDecryption: true }))
        cached = res.Parameter?.Value
        return cached
      } catch (error) {
        // First-ever run: the parameter doesn't exist yet. Signal a cache miss; the client
        // will call `login()` and then `set` — which creates the parameter for next time.
        if (error instanceof Error && error.name === 'ParameterNotFound') {
          return undefined
        }
        throw error
      }
    },

    async set(token: string) {
      await client.send(
        new PutParameterCommand({
          Name: options.parameterName,
          Value: token,
          Type: 'SecureString',
          Overwrite: true,
        }),
      )
      cached = token
    },
  }
}
