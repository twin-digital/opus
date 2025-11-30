import { describe, expect, it } from 'vitest'
import { addMonths } from './math.js'
import type { GameDateTime } from './model.js'

describe('addMonths', () => {
  it('adds positive months without year rollover', () => {
    const date: GameDateTime = {
      year: 1,
      month: 3,
      day: 15,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addMonths(date, 3)
    expect(result.month).toBe(6)
    expect(result.year).toBe(1)
  })

  it('adds months with varying lengths (Lymewald to Haggryme)', () => {
    // Lymewald has 28 days, Haggryme has 30 days
    const date: GameDateTime = {
      year: 1,
      month: 2, // Lymewald
      day: 15,
      hour: 12,
      turn: 3,
      round: 30,
    }
    const result = addMonths(date, 1)
    expect(result.month).toBe(3) // Haggryme
    // addMonths adds the number of days in the current month (Lymewald = 28 days)
    // Day 15 + 28 days = day 43, which is 13 days into Haggryme (30 days)
    // So day 15 remains day 15 after adding a month's worth of days
    expect(result.day).toBe(15)
  })

  it('adds months causing year rollover', () => {
    const date: GameDateTime = {
      year: 1,
      month: 10,
      day: 15,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addMonths(date, 5)
    // Month 10 + 5 = month 15, which is year 2 month 3
    expect(result.year).toBe(2)
    expect(result.month).toBe(3)
  })

  it('adds exactly 12 months (1 year)', () => {
    const date: GameDateTime = {
      year: 3,
      month: 7,
      day: 20,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addMonths(date, 12)
    expect(result.year).toBe(4)
    expect(result.month).toBe(7)
  })

  it('subtracts months without year change', () => {
    const date: GameDateTime = {
      year: 1,
      month: 8,
      day: 15,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addMonths(date, -2)
    expect(result.month).toBe(6)
    expect(result.year).toBe(1)
  })

  it('subtracts months causing year rollback', () => {
    const date: GameDateTime = {
      year: 5,
      month: 2,
      day: 15,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addMonths(date, -5)
    // Month 2 - 5 = month -3, which is year 4 month 9
    expect(result.year).toBe(4)
    expect(result.month).toBe(9)
  })

  it('handles day overflow when target month is shorter', () => {
    // Start on day 30 of Grimvold (30 days), add 1 month to Lymewald (28 days)
    const date: GameDateTime = {
      year: 1,
      month: 1, // Grimvold, 30 days
      day: 30,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addMonths(date, 1)
    // Adding 30 days from day 30 = day 60
    // Lymewald has 28 days, so day 60 - 28 = day 32 of next month (Haggryme)
    // Actually: day 30 + 30 days = overflows into month 3
    expect(result.month).toBe(3)
  })

  it('preserves time-of-day when adding months', () => {
    const date: GameDateTime = {
      year: 1,
      month: 5,
      day: 15,
      hour: 18,
      turn: 4,
      round: 35,
    }
    const result = addMonths(date, 3)
    expect(result.month).toBe(8)
    expect(result.hour).toBe(18)
    expect(result.turn).toBe(4)
    expect(result.round).toBe(35)
  })

  it('adds large number of months spanning multiple years', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addMonths(date, 50)
    // 50 months = 4 years and 2 months
    expect(result.year).toBe(5)
    expect(result.month).toBe(3)
  })

  it('handles subtracting months to earlier day in shorter month', () => {
    // Start in Haggryme (30 days) day 29, subtract 1 month
    const date: GameDateTime = {
      year: 1,
      month: 3, // Haggryme
      day: 29,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addMonths(date, -1)
    // Subtracting 1 month subtracts days in previous month (Lymewald = 28 days)
    // Month 3 day 29 - 28 days = still month 3 day 1
    expect(result.month).toBe(3)
    expect(result.day).toBe(1)
  })

  it('handles month wrap-around at year boundary', () => {
    const date: GameDateTime = {
      year: 1,
      month: 11,
      day: 15,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addMonths(date, 3)
    // Month 11 + 3 = month 14, wraps to year 2 month 2
    expect(result.year).toBe(2)
    expect(result.month).toBe(2)
  })
})
