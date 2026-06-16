import { Logger } from '@aws-lambda-powertools/logger'
import type { ScheduledHandler } from 'aws-lambda'

const logger = new Logger({ serviceName: 'lynx-lodgify-sync' })

/**
 * Scheduled entrypoint for the Lynx→Lodgify sync. For now it only records that it ran; the
 * read → resolve → validate → diff → write loop will be filled in here.
 */
export const handler: ScheduledHandler = (event) => {
  logger.info('lynx-lodgify-sync invoked', { scheduledTime: event.time })
}
