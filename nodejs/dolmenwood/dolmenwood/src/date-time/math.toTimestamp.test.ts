import { describe, expect, it } from 'vitest'
import { toTimestamp, fromTimestamp } from './math.js'
import { CalendarEpoch } from './calendar.js'
import type { GameDateTime } from './model.js'

describe('toTimestamp', () => {
  it('returns 0 for CalendarEpoch', () => {
    const result = toTimestamp(CalendarEpoch)
    expect(result).toBe(0)
  })

  it('returns 1 for round 2 of epoch', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
      round: 2,
    }
    expect(toTimestamp(date)).toBe(1)
  })

  it('calculates turn offset correctly', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 3,
      round: 1,
    }
    // Turn 3 = (3-1) * 60 = 120 rounds
    expect(toTimestamp(date)).toBe(120)
  })

  it('calculates hour offset correctly', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 5,
      turn: 1,
      round: 1,
    }
    // Hour 5 = 5 * 360 = 1,800 rounds
    expect(toTimestamp(date)).toBe(1800)
  })

  it('calculates day offset correctly', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 10,
      hour: 0,
      turn: 1,
      round: 1,
    }
    // Day 10 = (10-1) * 8640 = 77,760 rounds
    expect(toTimestamp(date)).toBe(77_760)
  })

  it('calculates month offset with varying lengths', () => {
    // Month 3 (Haggryme) means months 1-2 have elapsed
    // Grimvold (30) + Lymewald (28) = 58 days = 501,120 rounds
    const date: GameDateTime = {
      year: 1,
      month: 3,
      day: 1,
      hour: 0,
      turn: 1,
      round: 1,
    }
    expect(toTimestamp(date)).toBe(501_120)
  })

  it('calculates year offset correctly', () => {
    const date: GameDateTime = {
      year: 3,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
      round: 1,
    }
    // Year 3 = (3-1) * 3,041,280 = 6,082,560 rounds
    expect(toTimestamp(date)).toBe(6_082_560)
  })

  it('treats undefined round as round 1', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
    }
    expect(toTimestamp(date)).toBe(0)
  })

  it('maintains round-trip consistency with fromTimestamp', () => {
    const timestamps = [0, 1, 100, 1000, 10_000, 100_000, 1_000_000, 10_000_000]

    for (const ts of timestamps) {
      const date = fromTimestamp(ts)
      const backToTimestamp = toTimestamp(date)
      expect(backToTimestamp).toBe(ts)
    }
  })

  it('handles complex date with all units', () => {
    const date: GameDateTime = {
      year: 5,
      month: 8,
      day: 20,
      hour: 14,
      turn: 3,
      round: 45,
    }

    // Years: 4 * 3,041,280 = 12,165,120
    // Months 1-7: (30+28+30+29+29+30+31) = 207 days = 1,788,480 rounds
    // Days: 19 * 8640 = 164,160
    // Hours: 14 * 360 = 5,040
    // Turns: 2 * 60 = 120
    // Rounds: 44
    const expected = 12_165_120 + 1_788_480 + 164_160 + 5_040 + 120 + 44

    expect(toTimestamp(date)).toBe(expected)
  })

  it('handles month boundaries correctly', () => {
    // Last day of Lymewald (month 2, 28 days)
    const lastDayFeb: GameDateTime = {
      year: 1,
      month: 2,
      day: 28,
      hour: 23,
      turn: 6,
      round: 60,
    }

    // First day of Haggryme (month 3)
    const firstDayMar: GameDateTime = {
      year: 1,
      month: 3,
      day: 1,
      hour: 0,
      turn: 1,
      round: 1,
    }

    const diff = toTimestamp(firstDayMar) - toTimestamp(lastDayFeb)
    // Should be 1 round difference (last round of Feb to first round of Mar)
    expect(diff).toBe(1)
  })
})
