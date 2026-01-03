import type { Context as LambdaContext } from 'aws-lambda'
import type { Metrics } from '@aws-lambda-powertools/metrics'
import type { Tracer } from '@aws-lambda-powertools/tracer'
import type { ObservableLogger } from '../core/logger.js'

/**
 * Extended Lambda Context with observability properties injected by middleware
 */
export interface ObservabilityContext extends LambdaContext {
  logger: ObservableLogger
  metrics: Metrics
  tracer: Tracer | null
}

/**
 * Lambda handler that receives observability context
 *
 * @example
 * \`\`\`typescript
 * const handler: ObservabilityHandler<MyEvent, MyResult> = async (event, context) => {
 *   const { logger, metrics } = context
 *   logger.info('Processing event')
 *   return { success: true }
 * }
 * \`\`\`
 */
export type ObservabilityHandler<TEvent = unknown, TResult = unknown> = (
  event: TEvent,
  context: ObservabilityContext,
) => Promise<TResult> | TResult
