import { withObservability } from '@twin-digital/observability-lib'
import type { ScheduledEvent } from 'aws-lambda'

/**
 * Scheduled entrypoint for the Lynx→Lodgify sync. Placeholder body for now — the
 * read → resolve → validate → diff → write loop will replace this with real business
 * events/metrics (per obs-lib guidance, avoid generic invocation logging then).
 */
export const handler = withObservability(
  (event: ScheduledEvent, context) => {
    context.logger.info('lock-link tick', { scheduledTime: event.time })
  },
  { serviceName: 'lock-link' },
)
