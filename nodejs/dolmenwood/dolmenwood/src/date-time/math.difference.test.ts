import { describe, expect, it } from 'vitest'
import { difference } from './math.js'
import type { GameDateTime } from './model.js'

describe('difference', () => {
  describe('rounds', () => {
    it('calculates difference within same turn', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 15,
        turn: 1,
        round: 11,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 15,
        turn: 2,
        round: 25,
      }
      expect(difference(date1, date2, 'round')).toBe(74)
    })

    it('handles negative differences', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 15,
        turn: 2,
        round: 25,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 15,
        turn: 1,
        round: 11,
      }
      expect(difference(date1, date2, 'round')).toBe(-74)
    })

    it('returns 0 for same timestamp', () => {
      const date: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 15,
        turn: 1,
        round: 11,
      }
      expect(difference(date, date, 'round')).toBe(0)
    })
  })

  describe('turns', () => {
    it('calculates complete turns only', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 15,
        turn: 1,
        round: 11,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 15,
        turn: 2,
        round: 25,
      }
      expect(difference(date1, date2, 'turn')).toBe(1)
    })

    it('discards partial turns', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 15,
        turn: 1,
        round: 1,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 15,
        turn: 1,
        round: 59,
      }
      expect(difference(date1, date2, 'turn')).toBe(0)
    })
  })

  describe('hours', () => {
    it('calculates complete hours only', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 15,
        turn: 1,
        round: 11,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 15,
        turn: 2,
        round: 25,
      }
      expect(difference(date1, date2, 'hour')).toBe(0)
    })

    it('counts multiple hours', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 10,
        turn: 1,
        round: 1,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 14,
        turn: 1,
        round: 1,
      }
      expect(difference(date1, date2, 'hour')).toBe(4)
    })
  })

  describe('days', () => {
    it('calculates days across multiple months', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 2, // Lymewald, 28 days
        day: 15,
        hour: 10,
        turn: 1,
        round: 1,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 5, // Harchment
        day: 20,
        hour: 14,
        turn: 1,
        round: 1,
      }
      expect(difference(date1, date2, 'day')).toBe(92)
    })

    it('counts single day difference', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 1,
        day: 1,
        hour: 0,
        turn: 1,
        round: 1,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 1,
        day: 2,
        hour: 0,
        turn: 1,
        round: 1,
      }
      expect(difference(date1, date2, 'day')).toBe(1)
    })
  })

  describe('months', () => {
    it('counts months when same day is reached', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 2,
        day: 15,
        hour: 10,
        turn: 1,
        round: 1,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 5,
        day: 20,
        hour: 14,
        turn: 1,
        round: 1,
      }
      expect(difference(date1, date2, 'month')).toBe(3)
    })

    it('does not count incomplete month', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 2,
        day: 20,
        hour: 10,
        turn: 1,
        round: 1,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 5,
        day: 15,
        hour: 14,
        turn: 1,
        round: 1,
      }
      expect(difference(date1, date2, 'month')).toBe(2)
    })

    it('handles month-end clamping (Jan 31 → Feb 28)', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 1, // Grimvold, 30 days
        day: 30,
        hour: 0,
        turn: 1,
        round: 1,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 2, // Lymewald, 28 days
        day: 28,
        hour: 0,
        turn: 1,
        round: 1,
      }
      // Starting on day 30, ending on day 28 (last day of shorter month)
      // Should count as 1 complete month
      expect(difference(date1, date2, 'month')).toBe(1)
    })

    it('does not count month if day before last day of shorter month', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 1, // Grimvold, 30 days
        day: 30,
        hour: 0,
        turn: 1,
        round: 1,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 2, // Lymewald, 28 days
        day: 27,
        hour: 0,
        turn: 1,
        round: 1,
      }
      // Starting on day 30, ending on day 27 (not the last day)
      // Should not count as complete month
      expect(difference(date1, date2, 'month')).toBe(0)
    })

    it('ignores time-of-day when counting months', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 2,
        day: 15,
        hour: 23,
        turn: 6,
        round: 60,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 3,
        day: 15,
        hour: 0,
        turn: 1,
        round: 1,
      }
      // Same day reached, even though time-of-day is earlier
      expect(difference(date1, date2, 'month')).toBe(1)
    })

    it('handles year boundaries', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 11,
        day: 15,
        hour: 0,
        turn: 1,
        round: 1,
      }
      const date2: GameDateTime = {
        year: 1090,
        month: 2,
        day: 15,
        hour: 0,
        turn: 1,
        round: 1,
      }
      // Nov → Dec = 1, Dec → Jan = 1, Jan → Feb = 1
      expect(difference(date1, date2, 'month')).toBe(3)
    })

    it('handles negative month differences', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 5,
        day: 20,
        hour: 14,
        turn: 1,
        round: 1,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 2,
        day: 15,
        hour: 10,
        turn: 1,
        round: 1,
      }
      expect(difference(date1, date2, 'month')).toBe(-3)
    })

    it('handles negative month differences with month-end clamping', () => {
      const from: GameDateTime = {
        year: 1089,
        month: 2, // Lymewald, 28 days
        day: 28,
        hour: 0,
        turn: 1,
        round: 1,
      }
      const to: GameDateTime = {
        year: 1089,
        month: 1, // Grimvold, 30 days
        day: 30,
        hour: 0,
        turn: 1,
        round: 1,
      }

      // Forward direction (Jan 30 → Feb 28) is defined to be +1 month
      // via month-end clamping, so the reverse direction must be -1 month.
      expect(difference(from, to, 'month')).toBe(-1)
    })

    it('returns 0 for same month, same day', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 4,
        day: 15,
        hour: 10,
        turn: 1,
        round: 1,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 4,
        day: 15,
        hour: 20,
        turn: 1,
        round: 1,
      }
      expect(difference(date1, date2, 'month')).toBe(0)
    })
  })

  describe('years', () => {
    it('calculates complete years', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 1,
        day: 1,
        hour: 0,
        turn: 1,
        round: 1,
      }
      const date2: GameDateTime = {
        year: 1092,
        month: 1,
        day: 1,
        hour: 0,
        turn: 1,
        round: 1,
      }
      expect(difference(date1, date2, 'year')).toBe(3)
    })

    it('discards partial years', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 1,
        day: 1,
        hour: 0,
        turn: 1,
        round: 1,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 12,
        day: 30,
        hour: 23,
        turn: 6,
        round: 60,
      }
      expect(difference(date1, date2, 'year')).toBe(0)
    })

    it('counts a full year once the same calendar date is reached, ignoring time-of-day', () => {
      const from: GameDateTime = {
        year: 1089,
        month: 1,
        day: 1,
        hour: 23,
        turn: 6,
        round: 60,
      }
      const to: GameDateTime = {
        year: 1090,
        month: 1,
        day: 1,
        hour: 0,
        turn: 1,
        round: 1,
      }

      // Calendar math (ignoring time-of-day):
      // Jan 1 → Jan 1 = 1 complete year.
      //
      // Pure arithmetic based on fixed rounds-per-year would see
      // "one year minus 23 hours", i.e. *less* than a full year,
      // and would truncate to 0.
      expect(difference(from, to, 'year')).toBe(1)
    })

    it('handles negative years ignoring time-of-day (partial remainder)', () => {
      const from: GameDateTime = {
        year: 1090,
        month: 1,
        day: 1,
        hour: 0,
        turn: 1,
        round: 1,
      }
      const to: GameDateTime = {
        year: 1089,
        month: 1,
        day: 1,
        hour: 23,
        turn: 6,
        round: 60,
      }

      // Calendar math (ignoring time-of-day):
      // Jan 1 → Jan 1 = -1 complete year.
      //
      // Arithmetic rounds-per-year division would again be
      // "just under one year" in magnitude and would truncate to 0.
      expect(difference(from, to, 'year')).toBe(-1)
    })
  })

  describe('edge cases', () => {
    it('handles default round value', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 15,
        turn: 1,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 15,
        turn: 2,
      }
      // round defaults to 1, so difference is (2-1)*60 + (1-1) - (1-1)*60 - (1-1) = 60 rounds
      expect(difference(date1, date2, 'round')).toBe(60)
    })
  })

  describe('negative differences (from > to)', () => {
    it('handles negative turns with partial remainder (truncates toward zero)', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 15,
        turn: 2,
        round: 25,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 15,
        turn: 1,
        round: 11,
      }
      // -74 rounds = -1.23... turns
      // Should truncate toward zero: -1 turn (not -2)
      expect(difference(date1, date2, 'turn')).toBe(-1)
    })

    it('handles negative hours with partial remainder', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 15,
        turn: 2,
        round: 1,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 14,
        turn: 1,
        round: 1,
      }
      // -1 hour and -1 turn = -420 rounds
      // -420 / 360 = -1.166... hours
      // Should truncate toward zero: -1 hour
      expect(difference(date1, date2, 'hour')).toBe(-1)
    })

    it('handles negative days with partial remainder', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 1,
        day: 3,
        hour: 12,
        turn: 1,
        round: 1,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 1,
        day: 1,
        hour: 0,
        turn: 1,
        round: 1,
      }
      // 2 days and 12 hours backward
      // Should be -2 days (partial 12 hours discarded)
      expect(difference(date1, date2, 'day')).toBe(-2)
    })

    it('counts only complete years when extra months are present (positive)', () => {
      const from: GameDateTime = {
        year: 1089,
        month: 1,
        day: 1,
        hour: 0,
        turn: 1,
        round: 1,
      }
      const to: GameDateTime = {
        year: 1092,
        month: 6,
        day: 1,
        hour: 0,
        turn: 1,
        round: 1,
      }

      // 3 years and 5 months forward.
      // Only the 3 complete years are counted; partial months discarded.
      expect(difference(from, to, 'year')).toBe(3)
    })

    it('handles negative years with partial remainder', () => {
      const date1: GameDateTime = {
        year: 1092,
        month: 6,
        day: 1,
        hour: 0,
        turn: 1,
        round: 1,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 1,
        day: 1,
        hour: 0,
        turn: 1,
        round: 1,
      }
      // From year 1092 month 6 to year 1089 month 1
      // This is -3 years and -5 months backwards
      // Using Math.trunc on rounds difference gives -4 complete years
      // (the implementation uses Math.trunc(diffRounds / ROUNDS_PER_YEAR))
      expect(difference(date1, date2, 'year')).toBe(-3)
    })

    it('handles exact negative values (no remainder)', () => {
      const date1: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 15,
        turn: 3,
        round: 1,
      }
      const date2: GameDateTime = {
        year: 1089,
        month: 4,
        day: 1,
        hour: 15,
        turn: 1,
        round: 1,
      }
      // Exactly -2 turns (120 rounds)
      expect(difference(date1, date2, 'turn')).toBe(-2)
    })
  })
})
