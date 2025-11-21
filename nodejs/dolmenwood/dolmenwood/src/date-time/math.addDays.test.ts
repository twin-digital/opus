import { describe, expect, it } from 'vitest'
import { addDays } from './math.js'
import type { GameDateTime } from './model.js'

describe('addDays', () => {
  it('adds positive days without month rollover', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 5,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addDays(date, 10)
    expect(result.day).toBe(15)
    expect(result.month).toBe(1)
  })

  it('adds days causing month rollover in 28-day month (Lymewald)', () => {
    const date: GameDateTime = {
      year: 1,
      month: 2, // Lymewald, 28 days
      day: 20,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addDays(date, 15)
    // Day 20 + 15 = day 35, which is month 3 (Haggryme) day 7
    expect(result.month).toBe(3)
    expect(result.day).toBe(7)
  })

  it('adds days causing month rollover in 30-day month (Grimvold)', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1, // Grimvold, 30 days
      day: 25,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addDays(date, 10)
    // Day 25 + 10 = day 35, which is month 2 (Lymewald) day 5
    expect(result.month).toBe(2)
    expect(result.day).toBe(5)
  })

  it('adds days causing month rollover in 31-day month (Chysting)', () => {
    const date: GameDateTime = {
      year: 1,
      month: 7, // Chysting, 31 days
      day: 28,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addDays(date, 5)
    // Day 28 + 5 = day 33, which is month 8 (Lillipythe) day 2
    expect(result.month).toBe(8)
    expect(result.day).toBe(2)
  })

  it('adds days causing year rollover', () => {
    const date: GameDateTime = {
      year: 1,
      month: 12, // Braghold, 30 days (last month)
      day: 25,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addDays(date, 10)
    // Day 25 + 10 = day 35, which is year 2 month 1 day 5
    expect(result.year).toBe(2)
    expect(result.month).toBe(1)
    expect(result.day).toBe(5)
  })

  it('subtracts days (negative delta)', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 20,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addDays(date, -10)
    expect(result.day).toBe(10)
    expect(result.month).toBe(1)
  })

  it('subtracts days causing month rollback', () => {
    const date: GameDateTime = {
      year: 1,
      month: 3, // Haggryme
      day: 5,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addDays(date, -10)
    // Month 3 day 5 - 10 days = month 2 (Lymewald, 28 days) day 23
    expect(result.month).toBe(2)
    expect(result.day).toBe(23)
  })

  it('adds large number of days spanning multiple months', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addDays(date, 100)
    // 100 days: Grimvold(30) + Lymewald(28) + Haggryme(30) = 88, so day 12 of month 4
    expect(result.month).toBe(4)
    expect(result.day).toBe(13) // 100-88+1 = 13
  })

  it('preserves hour, turn, and round when adding days', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 5,
      hour: 14,
      turn: 3,
      round: 27,
    }
    const result = addDays(date, 5)
    expect(result.day).toBe(10)
    expect(result.hour).toBe(14)
    expect(result.turn).toBe(3)
    expect(result.round).toBe(27)
  })

  it('adds exactly 352 days (1 year)', () => {
    const date: GameDateTime = {
      year: 5,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addDays(date, 352)
    expect(result.year).toBe(6)
    expect(result.month).toBe(1)
    expect(result.day).toBe(1)
  })
})
