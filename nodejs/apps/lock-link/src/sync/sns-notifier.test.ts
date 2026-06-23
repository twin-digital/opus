import { PublishCommand, SNSClient } from '@aws-sdk/client-sns'
import { mockClient } from 'aws-sdk-client-mock'
import { beforeEach, describe, expect, it } from 'vitest'

import { createSnsNotifier } from './sns-notifier.js'

const sns = mockClient(SNSClient)

describe('createSnsNotifier', () => {
  beforeEach(() => {
    sns.reset()
    sns.on(PublishCommand).resolves({ MessageId: 'm-1' })
  })

  it('publishes the event to the topic with a severity subject + attribute', async () => {
    const topicArn = 'arn:aws:sns:us-east-1:444705667097:lock-link-alerts'
    const notify = createSnsNotifier({ topicArn })

    await notify({ severity: 'warning', reason: 'door code not ready before arrival', bookingId: 20559349 })

    const calls = sns.commandCalls(PublishCommand)
    expect(calls).toHaveLength(1)
    const { input } = calls[0].args[0]
    expect(input.TopicArn).toBe(topicArn)
    expect(input.Subject).toContain('warning')
    expect(input.Message).toContain('door code not ready')
    expect(input.MessageAttributes?.severity.StringValue).toBe('warning')
  })
})
