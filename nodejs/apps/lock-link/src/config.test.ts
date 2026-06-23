import { describe, expect, it } from 'vitest'

import { loadConfig } from './config.js'

const validEnv = {
  LOCK_LINK_ACCOUNT_ID: '222262',
  LOCK_LINK_USER_ID: '232753',
  LOCK_LINK_HORIZON_DAYS: '14',
  LOCK_LINK_SLA_HOURS: '48',
  LOCK_LINK_GRACE_MINUTES: '30',
}

describe('loadConfig', () => {
  it('parses and coerces a complete environment', () => {
    expect(loadConfig(validEnv)).toEqual({
      accountId: 222262,
      userId: '232753',
      horizonDays: 14,
      slaHours: 48,
      graceMinutes: 30,
    })
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
