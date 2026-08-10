import { describe, expect, it } from 'vitest'
import { latestDueOccurrence, tryParseCron, validateDigestSchedule } from './schedule.js'

/**
 * Spec: d-prxzi4zt (missed occurrences collapse into one) —
 * `latestDueOccurrence` answers "the most recent occurrence at or before now,
 * strictly after the last attempted one", which is the single occurrence a
 * tick may fire (missed occurrences collapse into it; none ⇒ nothing due).
 *
 * Times below are Unix seconds pinned to known UTC instants so cron matching
 * is deterministic regardless of the host clock; timezone cases pin an IANA
 * zone explicitly.
 */

/** 2026-06-10T00:00:00Z — a Wednesday. */
const JUN_10 = Date.UTC(2026, 5, 10) / 1000
const HOUR = 3600
const DAY = 86_400

describe('tryParseCron / validateDigestSchedule', () => {
  it('accepts a five-field cron expression', () => {
    expect(tryParseCron('0 20 * * *')).not.toBeNull()
    expect(validateDigestSchedule('0 20 * * *')).toBeNull()
  })

  it('accepts a valid IANA timezone', () => {
    expect(validateDigestSchedule('0 20 * * *', 'Asia/Tokyo')).toBeNull()
  })

  it('rejects a malformed pattern with croner’s reason', () => {
    expect(tryParseCron('not a cron')).toBeNull()
    expect(validateDigestSchedule('not a cron')).toMatch(/./)
  })

  it('rejects an unknown timezone', () => {
    expect(validateDigestSchedule('0 20 * * *', 'Mars/Olympus')).toMatch(/./)
  })
})

describe('latestDueOccurrence', () => {
  it('returns the single most recent occurrence <= now for a daily schedule', () => {
    // Daily at 20:00 UTC; now = Jun 10 21:00; last attempt long before.
    const due = latestDueOccurrence({
      schedule: '0 20 * * *',
      after: JUN_10 - 10 * DAY,
      now: JUN_10 + 21 * HOUR,
    })
    expect(due).toBe(JUN_10 + 20 * HOUR) // Jun 10 20:00, not any earlier day
  })

  it('returns null when no occurrence has elapsed since the last attempt', () => {
    // Last attempt was today's 20:00 fire; now is 21:00 the same day.
    const due = latestDueOccurrence({
      schedule: '0 20 * * *',
      after: JUN_10 + 20 * HOUR,
      now: JUN_10 + 21 * HOUR,
    })
    expect(due).toBeNull()
  })

  it('collapses several missed occurrences into the latest one (catch-up)', () => {
    // Down for three days: only Jun 9's 20:00 is due, never Jun 7/8's.
    const due = latestDueOccurrence({
      schedule: '0 20 * * *',
      after: JUN_10 - 4 * DAY + 20 * HOUR, // Jun 6 20:00 was attempted
      now: JUN_10 + HOUR, // Jun 10 01:00 — today's fire not yet reached
    })
    expect(due).toBe(JUN_10 - DAY + 20 * HOUR) // Jun 9 20:00
  })

  it('an occurrence exactly at `after` is not due again (strictly after)', () => {
    const twenty = JUN_10 + 20 * HOUR
    const due = latestDueOccurrence({
      schedule: '0 20 * * *',
      after: twenty,
      now: twenty,
    })
    expect(due).toBeNull()
  })

  it('an occurrence exactly at `now` is due (at or before now)', () => {
    const twenty = JUN_10 + 20 * HOUR
    const due = latestDueOccurrence({
      schedule: '0 20 * * *',
      after: JUN_10,
      now: twenty,
    })
    expect(due).toBe(twenty)
  })

  it('resolves a weekly schedule across a multi-day gap', () => {
    // Sundays at 08:00 UTC; Jun 7 2026 is a Sunday. Now = Wed Jun 10.
    const due = latestDueOccurrence({
      schedule: '0 8 * * 0',
      after: JUN_10 - 30 * DAY,
      now: JUN_10,
    })
    expect(due).toBe(Date.UTC(2026, 5, 7, 8) / 1000)
  })

  it('evaluates the schedule in the configured timezone', () => {
    // 20:00 Asia/Tokyo (UTC+9, no DST) = 11:00 UTC the same day.
    const due = latestDueOccurrence({
      schedule: '0 20 * * *',
      timezone: 'Asia/Tokyo',
      after: JUN_10 - 2 * DAY,
      now: JUN_10 + 12 * HOUR, // Jun 10 12:00Z, past today's 20:00 JST fire
    })
    expect(due).toBe(JUN_10 + 11 * HOUR) // Jun 10 11:00Z == Jun 10 20:00 JST
  })

  it('terminates on a dense schedule over a months-long gap (fallback floors)', () => {
    // Every minute, first-ever run with a floor ~6 months back: the scan must
    // still resolve the latest occurrence <= now without walking the gap.
    const now = JUN_10 + 20 * HOUR + 90 // 20:01:30
    const due = latestDueOccurrence({
      schedule: '* * * * *',
      after: JUN_10 - 180 * DAY,
      now,
    })
    expect(due).toBe(JUN_10 + 20 * HOUR + 60) // 20:01:00
  })

  it('returns null for an unparseable schedule or timezone', () => {
    expect(latestDueOccurrence({ schedule: 'nope', after: 0, now: JUN_10 })).toBeNull()
    expect(
      latestDueOccurrence({
        schedule: '0 20 * * *',
        timezone: 'Mars/Olympus',
        after: 0,
        now: JUN_10,
      }),
    ).toBeNull()
  })

  it('returns null when now <= after', () => {
    expect(
      latestDueOccurrence({
        schedule: '0 20 * * *',
        after: JUN_10,
        now: JUN_10,
      }),
    ).toBeNull()
  })
})
