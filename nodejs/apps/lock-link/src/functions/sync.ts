import { MetricUnit, withObservability } from '@twin-digital/observability-lib'
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

      // Per-outcome logs — one line per gap the sync touched, easily grouped in
      // CloudWatch Logs Insights (`filter action = "written"` etc.). Covers the "where
      // did the code go?" question a run summary alone can't answer.
      //
      // NOTE: only the last two digits of `outcome.code` are logged (as `codeMasked`).
      // The code is the literal PIN a guest types on the physical lock, so the full
      // value doesn't belong in CloudWatch (broader IAM read access + 30-day+ retention).
      // The suffix lets an operator match a write against the value they see in Lodgify
      // without giving log-readers everything they need to enter a lock.
      for (const outcome of result.outcomes) {
        context.logger.info(`lock-link ${outcome.action}`, {
          bookingId: outcome.bookingId,
          action: outcome.action,
          ...(outcome.code !== undefined && { codeMasked: `**${outcome.code.slice(-2)}` }),
          roomTypeIds: outcome.roomTypeIds,
          confirmationCode: outcome.confirmationCode,
          reasons: outcome.reasons,
        })
      }

      // EMF metrics — dashboard/alarm surface. `GapsFound == 0` for a long window signals
      // a healthy steady state; `Escalated > 0` mirrors the SNS event. Also silences the
      // Powertools "No application metrics to publish" warning.
      context.metrics.addMetric('GapsFound', MetricUnit.Count, result.gaps)
      context.metrics.addMetric('CodesWritten', MetricUnit.Count, result.written)
      context.metrics.addMetric('Escalated', MetricUnit.Count, result.escalated)
      context.metrics.addMetric('Skipped', MetricUnit.Count, result.skipped)

      context.logger.info('lock-link sync complete', {
        gaps: result.gaps,
        written: result.written,
        escalated: result.escalated,
        skipped: result.skipped,
      })
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
