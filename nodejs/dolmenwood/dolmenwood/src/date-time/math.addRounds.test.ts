import { describe, expect, it } from 'vitest'
import { addRounds } from './math.js'
import type { GameDateTime } from './model.js'

describe('addRounds', () => {
  it('adds positive rounds without rollover', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
      round: 10,
    }
    const result = addRounds(date, 10)
    expect(result.round).toBe(20)
    expect(result.turn).toBe(1)
  })

  it('adds rounds causing turn rollover', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
      round: 10,
    }
    const result = addRounds(date, 55)
    // Round 10 + 55 = round 65, which is turn 2, round 5
    expect(result.turn).toBe(2)
    expect(result.round).toBe(5)
  })

  it('adds rounds causing hour rollover', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 5,
      round: 30,
    }
    const result = addRounds(date, 100)
    // Turn 5 round 30 = 269 rounds into hour, + 100 = 369 rounds
    // 369 / 360 = 1 hour, 9 rounds remaining = turn 1 round 10
    expect(result.hour).toBe(1)
    expect(result.turn).toBe(1)
    expect(result.round).toBe(10)
  })

  it('adds rounds causing day rollover', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 23,
      turn: 6,
      round: 60,
    }
    const result = addRounds(date, 10)
    // Last round of day 1 + 10 rounds = day 2
    expect(result.day).toBe(2)
    expect(result.hour).toBe(0)
    expect(result.turn).toBe(1)
    expect(result.round).toBe(10)
  })

  it('adds rounds causing month rollover', () => {
    // Last round of Lymewald (28 days)
    const date: GameDateTime = {
      year: 1,
      month: 2,
      day: 28,
      hour: 23,
      turn: 6,
      round: 60,
    }
    const result = addRounds(date, 1)
    expect(result.month).toBe(3)
    expect(result.day).toBe(1)
    expect(result.hour).toBe(0)
    expect(result.turn).toBe(1)
    expect(result.round).toBe(1)
  })

  it('subtracts rounds (negative delta)', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
      round: 30,
    }
    const result = addRounds(date, -20)
    expect(result.round).toBe(10)
  })

  it('subtracts rounds causing turn rollback', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 3,
      round: 10,
    }
    const result = addRounds(date, -20)
    // Turn 3 round 10 = 130 rounds from epoch
    // - 20 = 110 rounds from epoch
    // 110 rounds = 1 turn (60 rounds) + 50 rounds = turn 2 round 50
    expect(result.turn).toBe(2)
    expect(result.round).toBe(50)
  })

  it('clamps result to epoch when subtracting past it', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
      round: 10,
    }
    const result = addRounds(date, -1000)
    // Should clamp to timestamp 0 (epoch)
    expect(result).toEqual({
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
      round: 1,
    })
  })

  it('adds large number of rounds spanning multiple units', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
      round: 1,
    }
    // Add 1 million rounds (less than 1 year which is 3,041,280 rounds)
    const result = addRounds(date, 1_000_000)
    // 1 million rounds = 115 days approximately
    expect(result.year).toBe(1)
    expect(result.month).toBeGreaterThanOrEqual(1)
    expect(result.month).toBeLessThanOrEqual(12)
    expect(result.day).toBeGreaterThan(1)
  })

  it('handles adding zero rounds', () => {
    const date: GameDateTime = {
      year: 5,
      month: 7,
      day: 15,
      hour: 12,
      turn: 3,
      round: 45,
    }
    const result = addRounds(date, 0)
    expect(result).toEqual(date)
  })
})
