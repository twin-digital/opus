import { describe, expect, it } from 'vitest'
import { addYears } from './math.js'
import type { GameDateTime } from './model.js'

describe('addYears', () => {
  it('adds positive years', () => {
    const date: GameDateTime = {
      year: 1,
      month: 5,
      day: 15,
      hour: 12,
      turn: 3,
      round: 45,
    }
    const result = addYears(date, 5)
    expect(result.year).toBe(6)
  })

  it('adds 1 year (verifies 352-day year constant)', () => {
    const date: GameDateTime = {
      year: 10,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addYears(date, 1)
    expect(result.year).toBe(11)
    expect(result.month).toBe(1)
    expect(result.day).toBe(1)
    expect(result.hour).toBe(0)
  })

  it('subtracts years (negative delta)', () => {
    const date: GameDateTime = {
      year: 10,
      month: 7,
      day: 20,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addYears(date, -3)
    expect(result.year).toBe(7)
  })

  it('preserves month, day, and time when adding years', () => {
    const date: GameDateTime = {
      year: 5,
      month: 8,
      day: 23,
      hour: 16,
      turn: 5,
      round: 42,
    }
    const result = addYears(date, 10)
    expect(result.year).toBe(15)
    expect(result.month).toBe(8)
    expect(result.day).toBe(23)
    expect(result.hour).toBe(16)
    expect(result.turn).toBe(5)
    expect(result.round).toBe(42)
  })

  it('handles large number of years', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addYears(date, 1000)
    expect(result.year).toBe(1001)
    expect(result.month).toBe(1)
    expect(result.day).toBe(1)
  })

  it('clamps to epoch when subtracting past year 1', () => {
    const date: GameDateTime = {
      year: 3,
      month: 6,
      day: 15,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addYears(date, -10)
    // Should clamp to epoch (year 1)
    expect(result.year).toBe(1)
    expect(result.month).toBe(1)
    expect(result.day).toBe(1)
  })

  it('adds years across century boundary', () => {
    const date: GameDateTime = {
      year: 95,
      month: 12,
      day: 30,
      hour: 23,
      turn: 6,
      round: 60,
    }
    const result = addYears(date, 10)
    expect(result.year).toBe(105)
    expect(result.month).toBe(12)
    expect(result.day).toBe(30)
  })

  it('handles adding zero years', () => {
    const date: GameDateTime = {
      year: 42,
      month: 7,
      day: 15,
      hour: 9,
      turn: 2,
      round: 30,
    }
    const result = addYears(date, 0)
    expect(result).toEqual(date)
  })

  it('verifies year addition does not affect shorter time units', () => {
    // Test that adding years doesn't inadvertently change day/month/hour/turn/round
    const date: GameDateTime = {
      year: 50,
      month: 2, // Lymewald (28 days)
      day: 28, // Last day of month
      hour: 23,
      turn: 6,
      round: 60,
    }
    const result = addYears(date, 50)
    expect(result.year).toBe(100)
    expect(result.month).toBe(2)
    expect(result.day).toBe(28)
    expect(result.hour).toBe(23)
    expect(result.turn).toBe(6)
    expect(result.round).toBe(60)
  })
})
