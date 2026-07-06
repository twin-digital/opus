import { describe, expect, it } from 'vitest'

import { loadConfig } from './config.js'

const validEnv = {
  LOCK_LINK_ACCOUNT_ID: '222262',
  LOCK_LINK_USER_ID: '232753',
  LOCK_LINK_HORIZON_DAYS: '14',
  LOCK_LINK_SLA_HOURS: '48',
  LOCK_LINK_GRACE_MINUTES: '30',
  LOCK_LINK_ALERT_TOPIC_ARN: 'arn:aws:sns:us-east-1:444705667097:lock-link-alerts',
  LOCK_LINK_LYNX_USERNAME_PARAM: '/lock-link/lynx-username',
  LOCK_LINK_LYNX_PASSWORD_PARAM: '/lock-link/lynx-password',
  LOCK_LINK_LODGIFY_API_KEY_PARAM: '/lock-link/lodgify-api-key',
}

describe('loadConfig', () => {
  it('parses and coerces a complete environment', () => {
    expect(loadConfig(validEnv)).toEqual({
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
    })
  })

  it('rejects an empty secret-parameter name', () => {
    expect(() => loadConfig({ ...validEnv, LOCK_LINK_LYNX_PASSWORD_PARAM: '' })).toThrow()
  })

  it('rejects an alert topic ARN that is not a well-formed SNS ARN', () => {
    expect(() => loadConfig({ ...validEnv, LOCK_LINK_ALERT_TOPIC_ARN: 'not-an-arn' })).toThrow()
    // Prefix-only strings passed the loose /^arn:aws:sns:/ check; must be rejected now.
    expect(() => loadConfig({ ...validEnv, LOCK_LINK_ALERT_TOPIC_ARN: 'arn:aws:sns:' })).toThrow()
    expect(() => loadConfig({ ...validEnv, LOCK_LINK_ALERT_TOPIC_ARN: 'arn:aws:sns:us-east-1:foo:topic' })).toThrow()
  })

  it('throws when a required value is absent', () => {
    expect(() => loadConfig({ ...validEnv, LOCK_LINK_SLA_HOURS: undefined })).toThrow()
    expect(() => loadConfig({ ...validEnv, LOCK_LINK_USER_ID: '' })).toThrow()
  })

  it('rejects a non-positive horizon and a non-numeric threshold', () => {
    expect(() => loadConfig({ ...validEnv, LOCK_LINK_HORIZON_DAYS: '0' })).toThrow()
    expect(() => loadConfig({ ...validEnv, LOCK_LINK_SLA_HOURS: 'soon' })).toThrow()
  })

  it('allows zero grace minutes', () => {
    expect(loadConfig({ ...validEnv, LOCK_LINK_GRACE_MINUTES: '0' }).graceMinutes).toBe(0)
  })
})
