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
 * build the clients + SNS notifier, and run the gap-fill loop. Misconfiguration fails
 * fast at cold start — better than discovering it mid-run.
 */
export const handler = withObservability(
  async (event: ScheduledEvent, context) => {
    const config = loadConfig()
    const secrets = await loadSecrets(config)

    const lynx = new LynxClient({
      username: secrets.lynxUsername,
      password: secrets.lynxPassword,
      userId: config.userId,
    })
    const lodgify = new LodgifyClient({ apiKey: secrets.lodgifyApiKey })
    const notify = createSnsNotifier({ topicArn: config.alertTopicArn })

    const result = await runSync({ lynx, lodgify, notify, config, now: Date.parse(event.time) })

    // Per obs-lib guidance, log business events — gaps found, codes written, escalations
    // raised — not generic invocation noise.
    context.logger.info('lock-link sync complete', result)
  },
  { serviceName: 'lock-link' },
)
