import { describe, expect, it } from 'vitest'

import { type BookingSnapshot, type Outcome } from '../sync/sync.js'
import { buildOutcomeLogFields, buildSnapshotLogFields, maskCode } from './log-format.js'

describe('maskCode', () => {
  it('returns `**` + the last two digits of a 4-digit PIN', () => {
    expect(maskCode('9234')).toBe('**34')
  })

  it('handles longer codes by taking only the trailing pair', () => {
    expect(maskCode('123456')).toBe('**56')
  })

  it('preserves whatever length is present when shorter than two chars', () => {
    // Real Lynx door codes are 4+ digits, but the function is total: it always returns
    // a `**`-prefixed value even on unexpected input, so log payloads never carry a
    // partially-masked or empty PIN.
    expect(maskCode('7')).toBe('**7')
    expect(maskCode('')).toBe('**')
  })
})

describe('buildOutcomeLogFields', () => {
  const base: Outcome = {
    bookingId: 20559349,
    action: 'written',
    confirmationCode: '20559349VK222262',
    code: '9234',
    roomTypeIds: [501],
  }

  it('never includes the raw `code` field, only `codeMasked`', () => {
    // The security posture of the observability layer rests on this: broader CloudWatch
    // IAM access + 30d+ retention makes the raw PIN the wrong thing to persist.
    const fields = buildOutcomeLogFields(base)
    expect(fields).not.toHaveProperty('code')
    expect(fields.codeMasked).toBe('**34')
  })

  it('omits `codeMasked` for outcomes with no code (skipped / escalated)', () => {
    const skipped: Outcome = {
      bookingId: 20559349,
      action: 'skipped',
      confirmationCode: '20559349VK222262',
      reasons: ['lock "Front Door" is "scheduled", not "success"'],
    }
    const fields = buildOutcomeLogFields(skipped)
    expect(fields).not.toHaveProperty('code')
    expect(fields).not.toHaveProperty('codeMasked')
    expect(fields.action).toBe('skipped')
    expect(fields.reasons).toEqual(['lock "Front Door" is "scheduled", not "success"'])
  })

  it('carries confirmationCode + roomTypeIds through unchanged', () => {
    const fields = buildOutcomeLogFields(base)
    expect(fields.confirmationCode).toBe('20559349VK222262')
    expect(fields.roomTypeIds).toEqual([501])
    expect(fields.bookingId).toBe(20559349)
    expect(fields.action).toBe('written')
  })
})

describe('buildSnapshotLogFields', () => {
  it('projects the four fields the handler cares about', () => {
    const snap: BookingSnapshot = {
      bookingId: 20559349,
      arrival: '2026-06-15T21:00:00.000Z',
      category: 'gap',
      status: 'Booked',
    }
    expect(buildSnapshotLogFields(snap)).toEqual({
      bookingId: 20559349,
      arrival: '2026-06-15T21:00:00.000Z',
      category: 'gap',
      status: 'Booked',
    })
  })

  it('carries an undefined status through (some categories may not need it)', () => {
    const snap: BookingSnapshot = { bookingId: 1, arrival: 'x', category: 'code-set' }
    expect(buildSnapshotLogFields(snap).status).toBeUndefined()
  })
})
