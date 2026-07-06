import { withObservability } from '@twin-digital/observability-lib'
import type { ScheduledEvent } from 'aws-lambda'

import { loadConfig } from '../config.js'
import { LodgifyClient } from '../lodgify/client.js'
import { LynxClient } from '../lynx/client.js'
import { loadSecrets } from '../secrets.js'
import { createSnsNotifier } from '../sync/sns-notifier.js'
import { runSync } from '../sync/sync.js'

/**
 * Scheduled entrypoint for the Lynx→Lodgify sync. On each tick: validate env config,
 * decrypt the SSM SecureString secrets (Powertools caches across warm invocations),
 * build the clients + SNS notifier, and run the gap-fill loop. Misconfiguration and a
 * malformed `event.time` both fail fast at cold start — better than mid-run — and any
 * later failure (secrets, Lynx, Lodgify) is escalated to the same `Notifier` sink before
 * rethrowing, so a run failure never disappears silently.
 */
export const handler = withObservability(
  async (event: ScheduledEvent, context) => {
    const config = loadConfig()
    // Fail fast rather than let a NaN `now` cascade to a false zero-gap "success":
    // horizonCutoff would be NaN and every arrival comparison would filter to false.
    const now = Date.parse(event.time)
    if (Number.isNaN(now)) {
      throw new Error(`invalid event.time: "${event.time}"`)
    }

    // Build the notifier BEFORE anything that can throw, so a failure inside
    // loadSecrets / runSync can still reach the escalation sink.
    const notify = createSnsNotifier({ topicArn: config.alertTopicArn })

    try {
      const secrets = await loadSecrets(config)
      const lynx = new LynxClient({
        username: secrets.lynxUsername,
        password: secrets.lynxPassword,
        userId: config.userId,
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
