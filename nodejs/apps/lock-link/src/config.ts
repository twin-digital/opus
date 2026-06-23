import { z } from 'zod'

import { type SyncConfig } from './sync/sync.js'

/**
 * Operational config for the sync, sourced from the environment so the tunable knobs —
 * poll horizon, escalation thresholds, which Lynx account/user — can change without a
 * code change or redeploy of logic. CDK sets these on the Lambda (see infra/stack.ts).
 *
 * Secrets (Lynx credentials, Lodgify API key) are deliberately NOT here: they're read
 * from SSM SecureString at runtime so they stay encrypted at rest and rotatable.
 *
 * `LockLinkConfig` extends `SyncConfig`, so it's provably a superset of what `runSync`
 * needs; `userId` is the extra the Lynx client requires.
 */
export interface LockLinkConfig extends SyncConfig {
  /** Lynx per-user id sent as `hostId`/`loggedInUserId` (NOT the account id). */
  readonly userId: string
}

// Env vars are strings; coerce to numbers and validate every value (all required).
const envSchema = z.object({
  LOCK_LINK_ACCOUNT_ID: z.coerce.number().int().positive(),
  LOCK_LINK_USER_ID: z.string().min(1),
  LOCK_LINK_HORIZON_DAYS: z.coerce.number().int().positive(),
  LOCK_LINK_SLA_HOURS: z.coerce.number().positive(),
  LOCK_LINK_GRACE_MINUTES: z.coerce.number().nonnegative(),
})

/**
 * Read + validate config from the environment. A missing or invalid value throws (fail
 * fast at cold start rather than mid-run).
 */
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): LockLinkConfig => {
  const parsed = envSchema.parse(env)
  return {
    accountId: parsed.LOCK_LINK_ACCOUNT_ID,
    userId: parsed.LOCK_LINK_USER_ID,
    horizonDays: parsed.LOCK_LINK_HORIZON_DAYS,
    slaHours: parsed.LOCK_LINK_SLA_HOURS,
    graceMinutes: parsed.LOCK_LINK_GRACE_MINUTES,
  }
}
