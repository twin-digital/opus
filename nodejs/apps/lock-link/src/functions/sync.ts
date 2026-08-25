import { MetricUnit, withObservability } from '@twin-digital/observability-lib'
import type { ScheduledEvent } from 'aws-lambda'

import { loadConfig } from '../config.js'
import { LodgifyClient } from '../lodgify/client.js'
import { LynxClient } from '../lynx/client.js'
import { createSsmTokenCache } from '../lynx/ssm-token-cache.js'
import { loadSecrets } from '../secrets.js'
import { SERVICE_NAME } from '../service.js'
import { createSnsNotifier } from '../sync/sns-notifier.js'
import { runSync } from '../sync/sync.js'
import { buildOutcomeLogFields, buildSnapshotLogFields } from './log-format.js'

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
        // Counted at call time (not run end) so a login on a later-failing run still
        // flushes — the observability wrapper publishes metrics on the error path too.
        onLogin: () => {
          context.metrics.addMetric('LynxLogins', MetricUnit.Count, 1)
        },
      })
      const lodgify = new LodgifyClient({ apiKey: secrets.lodgifyApiKey })

      const result = await runSync({ lynx, lodgify, notify, config, now })

      // Snapshot logs — one line per Lodgify booking the sync considered, categorized so
      // an operator can trace any bookingId. Answers "why didn't booking X get a code?"
      // without needing to reproduce a run: filter on bookingId to see BOTH the
      // `considered` line (category = gap / code-set / out-of-horizon / not-booked /
      // deleted) AND any matching `written` / `skipped` / `escalated` outcome below.
      for (const b of result.snapshot) {
        context.logger.info(`lock-link considered ${b.category}`, buildSnapshotLogFields(b))
      }

      // Per-outcome logs — one line per gap the sync touched, easily grouped in
      // CloudWatch Logs Insights (`filter action = "written"` etc.). Covers the "where
      // did the code go?" question a run summary alone can't answer. The full door PIN
      // never enters the payload — see `buildOutcomeLogFields` for the masked-suffix rule.
      for (const outcome of result.outcomes) {
        context.logger.info(`lock-link ${outcome.action}`, buildOutcomeLogFields(outcome))
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
  { serviceName: SERVICE_NAME },
)
