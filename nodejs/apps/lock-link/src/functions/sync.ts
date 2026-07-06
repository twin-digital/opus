import { withObservability } from '@twin-digital/observability-lib'
import type { ScheduledEvent } from 'aws-lambda'

import { loadConfig } from '../config.js'
import { LodgifyClient } from '../lodgify/client.js'
import { LynxClient } from '../lynx/client.js'
import { createSsmTokenCache } from '../lynx/ssm-token-cache.js'
import { loadSecrets } from '../secrets.js'
import { createSnsNotifier } from '../sync/sns-notifier.js'
import { runSync } from '../sync/sync.js'

/**
 * Scheduled entrypoint for the Lynx→Lodgify sync. On each tick: decrypt the SSM
 * SecureString creds (Powertools caches across warm invocations), build the clients +
 * SNS notifier, and run the gap-fill loop. Misconfiguration fails fast at *cold start*
 * (module load) rather than mid-run; a malformed `event.time` fails fast at invocation.
 * Any later failure (secrets, Lynx, Lodgify) is escalated through the `Notifier` before
 * rethrowing, so a run failure never disappears silently.
 *
 * Module-scoped `config` / `notify` / `tokenCache` survive across warm invocations —
 * the token cache in particular avoids re-hitting `login` on every hourly cold start.
 */
const config = loadConfig()
const notify = createSnsNotifier({ topicArn: config.alertTopicArn })
const tokenCache = createSsmTokenCache({ parameterName: config.tokenParamName })

export const handler = withObservability(
  async (event: ScheduledEvent, context) => {
    const now = Date.parse(event.time)
    if (Number.isNaN(now)) {
      throw new Error(`invalid event.time: "${event.time}"`)
    }

    try {
      const secrets = await loadSecrets(config)
      const lynx = new LynxClient({
        username: secrets.lynxUsername,
        password: secrets.lynxPassword,
        userId: config.userId,
        cache: tokenCache,
      })
      const lodgify = new LodgifyClient({ apiKey: secrets.lodgifyApiKey })

      const result = await runSync({ lynx, lodgify, notify, config, now })
      // Per obs-lib guidance, log business events — gaps found, codes written, escalations
      // raised — not generic invocation noise.
      context.logger.info('lock-link sync complete', result)
    } catch (error) {
      // Best-effort escalation on whole-run failure. Swallow a secondary notify failure so
      // the original error is what surfaces to the operator (via the Lambda's error
      // metric) — the notify contract is fire-and-forget.
      try {
        await notify({
          severity: 'critical',
          reason: 'lock-link run failed',
          details: [error instanceof Error ? `${error.name}: ${error.message}` : String(error)],
        })
      } catch (notifyError) {
        context.logger.error('notify failed while escalating run failure', { notifyError })
      }
      throw error
    }
  },
  { serviceName: 'lock-link' },
)
