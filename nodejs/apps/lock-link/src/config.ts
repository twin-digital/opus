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
  /** SNS topic the escalation Notifier publishes to. */
  readonly alertTopicArn: string
  /** SSM SecureString parameter names. Values stay in SSM, names live in config. */
  readonly secretNames: {
    readonly lynxUsername: string
    readonly lynxPassword: string
    readonly lodgifyApiKey: string
  }
}

// Empty/whitespace-only env values reject before use. For numeric envs, `Number('')` is
// `0` — a misconfigured `GRACE_MINUTES` would have silently degraded the grace window;
// for string envs, whitespace would flow through to Lynx as `hostId` or to SSM as a
// parameter name, failing later with a less-clear error. Applied uniformly.
const stringEnv = z.string().trim().min(1)
const numericEnv = stringEnv.pipe(z.coerce.number())

// Env vars are strings; coerce to numbers and validate every value (all required).
const envSchema = z.object({
  LOCK_LINK_ACCOUNT_ID: numericEnv.pipe(z.number().int().positive()),
  LOCK_LINK_USER_ID: stringEnv,
  LOCK_LINK_HORIZON_DAYS: numericEnv.pipe(z.number().int().positive()),
  LOCK_LINK_SLA_HOURS: numericEnv.pipe(z.number().positive()),
  LOCK_LINK_GRACE_MINUTES: numericEnv.pipe(z.number().nonnegative()),
  LOCK_LINK_ALERT_TOPIC_ARN: z
    .string()
    .regex(/^arn:aws:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]+$/, 'must be an SNS topic ARN'),
  LOCK_LINK_LYNX_USERNAME_PARAM: stringEnv,
  LOCK_LINK_LYNX_PASSWORD_PARAM: stringEnv,
  LOCK_LINK_LODGIFY_API_KEY_PARAM: stringEnv,
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
    alertTopicArn: parsed.LOCK_LINK_ALERT_TOPIC_ARN,
    secretNames: {
      lynxUsername: parsed.LOCK_LINK_LYNX_USERNAME_PARAM,
      lynxPassword: parsed.LOCK_LINK_LYNX_PASSWORD_PARAM,
      lodgifyApiKey: parsed.LOCK_LINK_LODGIFY_API_KEY_PARAM,
    },
  }
}
