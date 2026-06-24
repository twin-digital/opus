import { SSMProvider } from '@aws-lambda-powertools/parameters/ssm'

import { type LockLinkConfig } from './config.js'

/**
 * Runtime reads of the Lynx/Lodgify credentials from SSM SecureString. Powertools
 * decrypts and caches the values across warm Lambda invocations so steady-state runs
 * don't repeatedly call SSM. Names live in config (env); values live encrypted in SSM
 * and are rotatable without redeploy.
 */

export interface LockLinkSecrets {
  readonly lynxUsername: string
  readonly lynxPassword: string
  readonly lodgifyApiKey: string
}

// 15 minutes ≫ the schedule cadence: a warm container reuses the cached value, and a
// rotation propagates within one TTL without redeploy.
const TTL_SECONDS = 900

/**
 * Module-scoped provider so its cache survives between handler invocations on a warm
 * container. Tests pass their own.
 */
const defaultProvider = new SSMProvider()

const fetchOne = async (provider: SSMProvider, name: string): Promise<string> => {
  const value = await provider.get(name, { decrypt: true, maxAge: TTL_SECONDS })
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`SSM parameter "${name}" is missing or empty`)
  }
  return value
}

export const loadSecrets = async (
  config: LockLinkConfig,
  provider: SSMProvider = defaultProvider,
): Promise<LockLinkSecrets> => {
  const [lynxUsername, lynxPassword, lodgifyApiKey] = await Promise.all([
    fetchOne(provider, config.secretNames.lynxUsername),
    fetchOne(provider, config.secretNames.lynxPassword),
    fetchOne(provider, config.secretNames.lodgifyApiKey),
  ])
  return { lynxUsername, lynxPassword, lodgifyApiKey }
}
