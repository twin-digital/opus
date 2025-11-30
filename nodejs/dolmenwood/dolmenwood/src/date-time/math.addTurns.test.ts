import { describe, expect, it } from 'vitest'
import { addTurns } from './math.js'
import type { GameDateTime } from './model.js'

describe('addTurns', () => {
  it('adds positive turns without hour rollover', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addTurns(date, 3)
    expect(result.turn).toBe(4)
    expect(result.hour).toBe(0)
  })

  it('adds turns causing hour rollover', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 4,
      round: 1,
    }
    const result = addTurns(date, 5)
    // Turn 4 + 5 = turn 9, which is hour 1 turn 3 (6 turns per hour)
    expect(result.hour).toBe(1)
    expect(result.turn).toBe(3)
  })

  it('adds turns causing day rollover', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 23,
      turn: 5,
      round: 1,
    }
    const result = addTurns(date, 3)
    // Hour 23 turn 5 + 3 turns = day 2
    expect(result.day).toBe(2)
    expect(result.hour).toBe(0)
    expect(result.turn).toBe(2)
  })

  it('subtracts turns (negative delta)', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 1,
      turn: 3,
      round: 1,
    }
    const result = addTurns(date, -2)
    expect(result.hour).toBe(1)
    expect(result.turn).toBe(1)
  })

  it('adds exactly 6 turns (1 hour)', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 5,
      turn: 1,
      round: 1,
    }
    const result = addTurns(date, 6)
    expect(result.hour).toBe(6)
    expect(result.turn).toBe(1)
    expect(result.round).toBe(1)
  })

  it('adds exactly 144 turns (1 day)', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 5,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addTurns(date, 144)
    expect(result.day).toBe(6)
    expect(result.hour).toBe(0)
    expect(result.turn).toBe(1)
  })

  it('subtracts turns causing hour rollback', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 2,
      turn: 2,
      round: 1,
    }
    const result = addTurns(date, -10)
    // Hour 2 turn 2 - 10 turns = hour 0 turn 4
    expect(result.hour).toBe(0)
    expect(result.turn).toBe(4)
  })

  it('handles large number of turns', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
      round: 1,
    }
    const result = addTurns(date, 1000)
    // 1000 turns = 166.67 hours = 6.94 days
    expect(result.day).toBe(7)
  })

  it('preserves round value when adding turns', () => {
    const date: GameDateTime = {
      year: 1,
      month: 1,
      day: 1,
      hour: 0,
      turn: 1,
      round: 45,
    }
    const result = addTurns(date, 2)
    expect(result.turn).toBe(3)
    expect(result.round).toBe(45)
  })
})
