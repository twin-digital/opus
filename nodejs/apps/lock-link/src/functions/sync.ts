import { withObservability } from '@twin-digital/observability-lib'
import type { ScheduledEvent } from 'aws-lambda'

import { loadConfig } from '../config.js'

/**
 * Scheduled entrypoint for the Lynx→Lodgify sync. Loads + validates operational config
 * from the environment (set by CDK) so a misconfigured deploy fails fast at cold start.
 *
 * Remaining wiring (next PR): build the Lynx + Lodgify clients from SSM SecureString
 * secrets and a concrete Notifier, then `runSync({ ...config, lynx, lodgify, notify, now:
 * Date.now() })`. Secrets are read at runtime (not env) so they stay encrypted/rotatable.
 */
export const handler = withObservability(
  (event: ScheduledEvent, context) => {
    const config = loadConfig()
    context.logger.info('lock-link tick', { scheduledTime: event.time, config })
  },
  { serviceName: 'lock-link' },
)
