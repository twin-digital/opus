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
  LOCK_LINK_LYNX_TOKEN_PARAM: '/lock-link/lynx-token',
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
      tokenParamName: '/lock-link/lynx-token',
    })
  })

  it('allows zero grace minutes', () => {
    expect(loadConfig({ ...validEnv, LOCK_LINK_GRACE_MINUTES: '0' }).graceMinutes).toBe(0)
  })

  it.each<[string, Partial<Record<keyof typeof validEnv, string | undefined>>]>([
    ['required value absent', { LOCK_LINK_SLA_HOURS: undefined }],
    ['empty required string', { LOCK_LINK_USER_ID: '' }],
    ['non-positive horizon', { LOCK_LINK_HORIZON_DAYS: '0' }],
    ['non-numeric threshold', { LOCK_LINK_SLA_HOURS: 'soon' }],
    ['empty numeric — GRACE_MINUTES', { LOCK_LINK_GRACE_MINUTES: '' }],
    ['whitespace numeric — GRACE_MINUTES', { LOCK_LINK_GRACE_MINUTES: '   ' }],
    ['empty numeric — SLA_HOURS', { LOCK_LINK_SLA_HOURS: '' }],
    ['empty numeric — HORIZON_DAYS', { LOCK_LINK_HORIZON_DAYS: '' }],
    ['empty numeric — ACCOUNT_ID', { LOCK_LINK_ACCOUNT_ID: '' }],
    ['whitespace string — USER_ID', { LOCK_LINK_USER_ID: '   ' }],
    ['whitespace string — LYNX_USERNAME_PARAM', { LOCK_LINK_LYNX_USERNAME_PARAM: '   ' }],
    ['whitespace string — LYNX_PASSWORD_PARAM', { LOCK_LINK_LYNX_PASSWORD_PARAM: '   ' }],
    ['whitespace string — LODGIFY_API_KEY_PARAM', { LOCK_LINK_LODGIFY_API_KEY_PARAM: '   ' }],
    ['whitespace string — LYNX_TOKEN_PARAM', { LOCK_LINK_LYNX_TOKEN_PARAM: '   ' }],
    ['empty secret-parameter name', { LOCK_LINK_LYNX_PASSWORD_PARAM: '' }],
    ['empty token-parameter name', { LOCK_LINK_LYNX_TOKEN_PARAM: '' }],
    ['ARN not well-formed', { LOCK_LINK_ALERT_TOPIC_ARN: 'not-an-arn' }],
    ['ARN prefix only', { LOCK_LINK_ALERT_TOPIC_ARN: 'arn:aws:sns:' }],
    ['ARN bad account id', { LOCK_LINK_ALERT_TOPIC_ARN: 'arn:aws:sns:us-east-1:foo:topic' }],
    // Infinity would silently disable the SLA / grace guards (positive/nonnegative accept it).
    ['SLA_HOURS Infinity literal', { LOCK_LINK_SLA_HOURS: 'Infinity' }],
    ['SLA_HOURS 1e999 overflow', { LOCK_LINK_SLA_HOURS: '1e999' }],
    ['GRACE_MINUTES Infinity literal', { LOCK_LINK_GRACE_MINUTES: 'Infinity' }],
    ['GRACE_MINUTES 1e999 overflow', { LOCK_LINK_GRACE_MINUTES: '1e999' }],
  ])('rejects %s', (_, override) => {
    expect(() => loadConfig({ ...validEnv, ...override })).toThrow()
  })
})
