import { describe, expect, it } from 'vitest'
import { addHours } from './math.js'
import type { GameDateTime } from './model.js'

describe('addHours', () => {
  it('adds positive hours without day rollover', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 5,
      turn: 1,
      round: 1,
    }
    const result = addHours(date, 5)
    expect(result.hour).toBe(10)
    expect(result.day).toBe(1)
  })

  it('adds hours causing day rollover', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 10,
      turn: 1,
      round: 1,
    }
    const result = addHours(date, 20)
    // Hour 10 + 20 = hour 30, which is day 2 hour 6
    expect(result.day).toBe(2)
    expect(result.hour).toBe(6)
  })

  it('adds hours causing month rollover', () => {
    // Last day of Lymewald (28 days)
    const date: GameDateTime = {
      year: 1,
      month: 2,
      day: 28,
      hour: 12,
      turn: 1,
      round: 1,
    }
    const result = addHours(date, 48)
    // 28th hour 12 + 48 hours = 2 days later = month 3 day 2 hour 12
    expect(result.month).toBe(3)
    expect(result.day).toBe(2)
    expect(result.hour).toBe(12)
  })

  it('subtracts hours (negative delta)', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 10,
      turn: 1,
      round: 1,
    }
    const result = addHours(date, -3)
    expect(result.hour).toBe(7)
  })

  it('adds exactly 24 hours (1 day)', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 10,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addHours(date, 24)
    expect(result.day).toBe(11)
    expect(result.hour).toBe(0)
    expect(result.turn).toBe(1)
  })

  it('subtracts hours causing day rollback', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 5,
      hour: 5,
      turn: 1,
      round: 1,
    }
    const result = addHours(date, -10)
    // Day 5 hour 5 - 10 hours = day 4 hour 19
    expect(result.day).toBe(4)
    expect(result.hour).toBe(19)
  })

  it('handles large number of hours spanning months', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
      round: 1,
    }
    // 1000 hours = 41.67 days, should cross into month 2
    const result = addHours(date, 1000)
    expect(result.month).toBe(2)
  })

  it('preserves turn and round when adding hours', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 5,
      turn: 3,
      round: 45,
    }
    const result = addHours(date, 2)
    expect(result.hour).toBe(7)
    expect(result.turn).toBe(3)
    expect(result.round).toBe(45)
  })

  it('adds hours causing year rollover', () => {
    const date: GameDateTime = {
      year: 1,
      month: 12,
      day: 30, // Last day of year (Braghold has 30 days)
      hour: 20,
      turn: 1,
      round: 1,
    }
    const result = addHours(date, 10)
    // Should roll into year 2
    expect(result.year).toBe(2)
    expect(result.month).toBe(1)
    expect(result.day).toBe(1)
    expect(result.hour).toBe(6)
  })
})
