import { SSMProvider } from '@aws-lambda-powertools/parameters/ssm'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { mockClient } from 'aws-sdk-client-mock'
import { beforeEach, describe, expect, it } from 'vitest'

import { type LockLinkConfig } from './config.js'
import { loadSecrets } from './secrets.js'

const ssm = mockClient(SSMClient)

const CONFIG: LockLinkConfig = {
  accountId: 222262,
  userId: '232753',
  horizonDays: 14,
  slaHours: 48,
  graceMinutes: 30,
  alertTopicArn: 'arn:aws:sns:us-east-1:444705667097:lock-link-alerts',
  secretNames: {
    lynxUsername: '/lock-link/lynx-username',
    lynxPassword: '/lock-link/lynx-password',
    lodgifyApiKey: '/lock-link/lodgify-api-key',
  },
}

describe('loadSecrets', () => {
  beforeEach(() => {
    ssm.reset()
  })

  it('reads each SecureString and decrypts it', async () => {
    ssm
      .on(GetParameterCommand, { Name: '/lock-link/lynx-username', WithDecryption: true })
      .resolves({ Parameter: { Value: 'lynx-user' } })
    ssm
      .on(GetParameterCommand, { Name: '/lock-link/lynx-password', WithDecryption: true })
      .resolves({ Parameter: { Value: 'lynx-pass' } })
    ssm
      .on(GetParameterCommand, { Name: '/lock-link/lodgify-api-key', WithDecryption: true })
      .resolves({ Parameter: { Value: 'lodgify-key' } })

    const secrets = await loadSecrets(CONFIG, new SSMProvider())
    expect(secrets).toEqual({ lynxUsername: 'lynx-user', lynxPassword: 'lynx-pass', lodgifyApiKey: 'lodgify-key' })
  })

  it('throws when a SecureString is missing', async () => {
    ssm.on(GetParameterCommand).resolves({ Parameter: { Value: 'x' } })
    ssm
      .on(GetParameterCommand, { Name: '/lock-link/lodgify-api-key', WithDecryption: true })
      .resolves({ Parameter: {} })
    await expect(loadSecrets(CONFIG, new SSMProvider())).rejects.toThrow(/lodgify-api-key/)
  })
})
