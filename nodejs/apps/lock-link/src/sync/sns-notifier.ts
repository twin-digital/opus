import { PublishCommand, SNSClient } from '@aws-sdk/client-sns'

import { type Notifier } from './notify.js'

/**
 * A `Notifier` that publishes each escalation to an SNS topic. The topic (with an email
 * subscription) is provisioned by CDK for now and passed in by ARN, so it can later
 * become a shared cross-workload channel without touching this code. Severity rides as a
 * message attribute so subscribers can filter/route.
 */
export interface SnsNotifierOptions {
  readonly topicArn: string
  /** Injectable for tests; defaults to a client configured from the Lambda's region. */
  readonly client?: SNSClient
}

export const createSnsNotifier = (options: SnsNotifierOptions): Notifier => {
  const client = options.client ?? new SNSClient({})
  return async (event) => {
    await client.send(
      new PublishCommand({
        TopicArn: options.topicArn,
        // SNS subjects must be single-line ASCII, ≤100 chars.
        Subject: `[lock-link ${event.severity}] ${event.reason}`.slice(0, 100),
        Message: JSON.stringify(event, null, 2),
        MessageAttributes: { severity: { DataType: 'String', StringValue: event.severity } },
      }),
    )
  }
}
