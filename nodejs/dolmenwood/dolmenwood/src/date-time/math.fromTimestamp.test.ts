import { describe, expect, it } from 'vitest'
import { fromTimestamp } from './math.js'
import { CalendarEpoch } from './calendar.js'

describe('fromTimestamp', () => {
  it('returns CalendarEpoch for timestamp 0', () => {
    const result = fromTimestamp(0)
    expect(result).toEqual(CalendarEpoch)
  })

  it('increments round by 1 for timestamp 1', () => {
    const result = fromTimestamp(1)
    expect(result).toEqual({
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
      round: 2,
    })
  })

  it('rolls to turn 2 for a full turn (60 rounds)', () => {
    const result = fromTimestamp(60)
    expect(result).toEqual({
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 2,
      round: 1,
    })
  })

  it('rolls to hour 1 for a full hour (360 rounds)', () => {
    const result = fromTimestamp(360)
    expect(result).toEqual({
      year: 1,
      month: 1,
      day: 1,
      hour: 1,
      turn: 1,
      round: 1,
    })
  })

  it('rolls to day 2 for a full day (8640 rounds)', () => {
    const result = fromTimestamp(8640)
    expect(result).toEqual({
      year: 1,
      month: 1,
      day: 2,
      hour: 0,
      turn: 1,
      round: 1,
    })
  })

  it('handles month boundary for Lymewald (28 days)', () => {
    // 28 days in month 2 (Lymewald) = 28 * 8640 = 241,920 rounds
    // Plus 30 days in month 1 (Grimvold) = 30 * 8640 = 259,200 rounds
    const grimvoldDays = 30 * 8640
    const result = fromTimestamp(grimvoldDays)
    expect(result.month).toBe(2)
    expect(result.day).toBe(1)
  })

  it('handles year boundary (352 days)', () => {
    // 352 days = 352 * 8640 = 3,041,280 rounds
    const result = fromTimestamp(3_041_280)
    expect(result).toEqual({
      year: 2,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
      round: 1,
    })
  })

  it('calculates correctly for large timestamp (multiple years)', () => {
    // 5 years + 100 days + 12 hours + 3 turns + 15 rounds
    const fiveYears = 5 * 3_041_280
    const hundredDays = 100 * 8640
    const twelveHours = 12 * 360
    const threeTurns = 3 * 60
    const fifteenRounds = 15
    const timestamp = fiveYears + hundredDays + twelveHours + threeTurns + fifteenRounds

    const result = fromTimestamp(timestamp)
    expect(result.year).toBe(6)
    // 100 days into year 6: Grimvold (30) + Lymewald (28) + Haggryme (30) = 88 days, so day 12 of month 4
    expect(result.month).toBe(4)
    expect(result.day).toBe(13) // 100 - 88 = 12, but day is 1-indexed so day 13
    expect(result.hour).toBe(12)
    expect(result.turn).toBe(4) // turn 1 + 3 more = turn 4
    expect(result.round).toBe(16) // round 1 + 15 more = round 16
  })

  it('handles complex timestamp with all units', () => {
    // Build a specific timestamp: Year 10, Month 7 (Chysting), Day 15, Hour 18, Turn 4, Round 35
    // Years: 9 * 3,041,280 = 27,371,520
    // Months 1-6: (30+28+30+29+29+30) = 176 days = 1,520,640 rounds
    // Days: 14 * 8640 = 120,960
    // Hours: 18 * 360 = 6,480
    // Turns: 3 * 60 = 180 (turn 4 = 3 complete turns)
    // Rounds: 34 (round 35 = 34 complete rounds)
    const timestamp = 27_371_520 + 1_520_640 + 120_960 + 6_480 + 180 + 34

    const result = fromTimestamp(timestamp)
    expect(result).toEqual({
      year: 10,
      month: 7,
      day: 15,
      hour: 18,
      turn: 4,
      round: 35,
    })
  })
})
