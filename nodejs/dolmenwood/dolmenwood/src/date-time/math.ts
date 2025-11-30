import { CalendarEpoch, Months } from './calendar.js'
import {
  DAYS_IN_YEAR,
  HOURS_PER_DAY,
  ROUNDS_PER_TURN,
  TURNS_PER_HOUR,
  type DateTimeUnit,
  type GameDateTime,
  type GameTimestamp,
} from './model.js'

const ROUNDS_PER_HOUR = ROUNDS_PER_TURN * TURNS_PER_HOUR
const ROUNDS_PER_DAY = ROUNDS_PER_HOUR * HOURS_PER_DAY
const ROUNDS_PER_YEAR = ROUNDS_PER_DAY * DAYS_IN_YEAR

/**
 * Calculate total days in months from start of year to target month (exclusive)
 */
const getDaysInMonths = (fromMonth: number, toMonth: number): number => {
  let totalDays = 0
  for (let m = fromMonth; m < toMonth; m++) {
    totalDays += Months[m - 1].days
  }
  return totalDays
}

/**
 * Given a game timestamp (number of rounds since the {@link CalendarEpoch}), return the corresponding
 * {@link GameDateTime}. If 'timestamp' is zero, then the CalendarEpoch is returned exactly. If timestamp is 1, then
 * an GameDateTime equal to the (epoch + 1 round) will be returned, etc.
 */
export const fromTimestamp = (timestamp: GameTimestamp): GameDateTime => {
  // Start with total rounds from epoch (timestamp is rounds since epoch, not including epoch's round)
  const totalRounds = timestamp

  // Calculate years
  const totalYearsFromEpoch = Math.floor(totalRounds / ROUNDS_PER_YEAR)
  const year = CalendarEpoch.year + totalYearsFromEpoch
  const roundsAfterYears = totalRounds % ROUNDS_PER_YEAR

  // Calculate months and days (need to iterate through months due to varying days)
  let month = 1
  let day = 1
  const remainingDays = Math.floor(roundsAfterYears / ROUNDS_PER_DAY)
  const roundsAfterDays = roundsAfterYears % ROUNDS_PER_DAY

  // Add remaining days
  day += remainingDays

  // Overflow days into months
  while (day > Months[month - 1].days) {
    day -= Months[month - 1].days
    month++
    if (month > 12) {
      month = 1
    }
  }

  // Calculate hours from remaining rounds
  const hour = Math.floor(roundsAfterDays / ROUNDS_PER_HOUR)
  const roundsAfterHours = roundsAfterDays % ROUNDS_PER_HOUR

  // Calculate turns from remaining rounds
  const turn = Math.floor(roundsAfterHours / ROUNDS_PER_TURN) + 1 // turns are 1-indexed
  const round = (roundsAfterHours % ROUNDS_PER_TURN) + 1 // rounds are 1-indexed

  return {
    day,
    hour,
    month,
    round,
    turn,
    year,
  }
}

/**
 * Given a {@link GameDateTime}, return the corresponding game timestamps (number of rounds since the
 * {@link CalendarEpoch}). If `dateTime` is zero, the CalendarEpoch is returned, and so on.
 */
export const toTimestamp = (dateTime: GameDateTime): GameTimestamp => {
  // Calculate rounds from complete years since epoch (year 1 = epoch, year 2 = +1 year, etc.)
  const yearDiff = dateTime.year - CalendarEpoch.year
  const yearRounds = yearDiff * ROUNDS_PER_YEAR

  // Calculate rounds from complete months within the current year (month 1 to target month)
  const monthDays = getDaysInMonths(1, dateTime.month)
  const monthRounds = monthDays * ROUNDS_PER_DAY

  // Calculate rounds from complete days within the current month (day 1 = 0 days elapsed)
  const dayRounds = (dateTime.day - 1) * ROUNDS_PER_DAY

  // Calculate rounds from complete hours within the current day (hour 0 = 0 hours elapsed)
  const hourRounds = dateTime.hour * ROUNDS_PER_HOUR

  // Calculate rounds from complete turns within the current hour (turn 1 = 0 turns elapsed, turn is 1-indexed)
  const turnRounds = (dateTime.turn - 1) * ROUNDS_PER_TURN

  // Calculate rounds within the current turn (round 1 = 0 rounds elapsed, round is 1-indexed)
  const roundsInTurn = (dateTime.round ?? 1) - 1

  return yearRounds + monthRounds + dayRounds + hourRounds + turnRounds + roundsInTurn
}

/**
 * Adds the specified number of rounds to a GameDateTime.
 * @param dateTime - The starting date/time
 * @param delta - Number of rounds to add (can be negative)
 * @returns New GameDateTime with rounds added
 */
export const addRounds = (dateTime: GameDateTime, delta: number): GameDateTime => {
  const timestamp = toTimestamp(dateTime)
  const newTimestamp = Math.max(0, timestamp + delta)
  return fromTimestamp(newTimestamp)
}

/**
 * Adds the specified number of turns to a GameDateTime.
 * @param dateTime - The starting date/time
 * @param delta - Number of turns to add (can be negative)
 * @returns New GameDateTime with turns added
 */
export const addTurns = (dateTime: GameDateTime, delta: number): GameDateTime => {
  const roundsDelta = delta * ROUNDS_PER_TURN
  return addRounds(dateTime, roundsDelta)
}

/**
 * Adds the specified number of hours to a GameDateTime.
 * @param dateTime - The starting date/time
 * @param delta - Number of hours to add (can be negative)
 * @returns New GameDateTime with hours added
 */
export const addHours = (dateTime: GameDateTime, delta: number): GameDateTime => {
  const roundsDelta = delta * ROUNDS_PER_HOUR
  return addRounds(dateTime, roundsDelta)
}

/**
 * Adds the specified number of days to a GameDateTime.
 * @param dateTime - The starting date/time
 * @param delta - Number of days to add (can be negative)
 * @returns New GameDateTime with days added
 */
export const addDays = (dateTime: GameDateTime, delta: number): GameDateTime => {
  const roundsDelta = delta * ROUNDS_PER_DAY
  return addRounds(dateTime, roundsDelta)
}

/**
 * Adds the specified number of months to a GameDateTime.
 * @param dateTime - The starting date/time
 * @param delta - Number of months to add (can be negative)
 * @returns New GameDateTime with months added
 */
export const addMonths = (dateTime: GameDateTime, delta: number): GameDateTime => {
  // Calculate total rounds in the months being added
  let roundsDelta = 0

  if (delta > 0) {
    // Adding months forward
    let currentMonth = dateTime.month
    for (let i = 0; i < delta; i++) {
      roundsDelta += Months[currentMonth - 1].days * ROUNDS_PER_DAY
      currentMonth++
      if (currentMonth > 12) {
        currentMonth = 1
      }
    }
  } else if (delta < 0) {
    // Adding months backward
    let currentMonth = dateTime.month
    for (let i = 0; i > delta; i--) {
      currentMonth--
      if (currentMonth < 1) {
        currentMonth = 12
      }
      roundsDelta -= Months[currentMonth - 1].days * ROUNDS_PER_DAY
    }
  }

  return addRounds(dateTime, roundsDelta)
}

/**
 * Adds the specified number of years to a GameDateTime.
 * @param dateTime - The starting date/time
 * @param delta - Number of years to add (can be negative)
 * @returns New GameDateTime with years added
 */
export const addYears = (dateTime: GameDateTime, delta: number): GameDateTime => {
  const roundsDelta = delta * ROUNDS_PER_YEAR
  return addRounds(dateTime, roundsDelta)
}

/**
 * Computes the signed difference between two Dolmenwood date-times in whole
 * units of the given `unit`.
 *
 * The result is:
 * - `> 0` if `to` is later than `from`
 * - `< 0` if `to` is earlier than `from`
 * - `0` if they are equal or fewer than one whole `unit` apart
 *
 * Semantics by unit:
 *
 * - For `'round' | 'turn' | 'hour' | 'day'`:
 *   Both dates are converted to an absolute round count. The difference in rounds
 *   is divided by the number of rounds per unit and truncated toward zero
 *   (any remainder is discarded).
 *
 * - For `'month' | 'year'`:
 *   Calendar arithmetic is used based on the Dolmenwood month table:
 *   variable month lengths and month-end clamping are respected,
 *   and only the `year`, `month`, and `day` fields are considered.
 *   Time-of-day (`hour`, `turn`, `round`) is ignored, and partial months/years
 *   are discarded (again truncating toward zero).
 *
 * Missing `round` values are treated as `1`.
 *
 * @param from - The starting (reference) date-time.
 * @param to - The target date-time to compare against `from`.
 * @param unit - The unit in which to express the result.
 *
 * @example
 * const from: GameDateTime = {
 *   year: 1089,
 *   month: 4,
 *   day: 1,
 *   hour: 15,
 *   turn: 1,
 *   round: 11,
 * };
 *
 * const to: GameDateTime = {
 *   year: 1089,
 *   month: 4,
 *   day: 1,
 *   hour: 15,
 *   turn: 2,
 *   round: 25,
 * };
 *
 * difference(from, to, 'round'); // 74
 * difference(from, to, 'turn');  // 1  (74 rounds / 60, truncated toward zero)
 * difference(from, to, 'hour');  // 0  (not a full hour)
 *
 * @example
 * // Calendar months vs. linear days
 * const a: GameDateTime = {
 *   year: 1089,
 *   month: 2,
 *   day: 15,
 *   hour: 10,
 *   turn: 1,
 *   round: 1,
 * };
 *
 * const b: GameDateTime = {
 *   year: 1089,
 *   month: 5,
 *   day: 20,
 *   hour: 14,
 *   turn: 1,
 *   round: 1,
 * };
 *
 * difference(a, b, 'month'); // 3  (three complete month boundaries crossed)
 * difference(a, b, 'day');   // 92 (total whole days; partial hours discarded)
 */
export const difference = (from: GameDateTime, to: GameDateTime, unit: DateTimeUnit): number => {
  const fromTs = toTimestamp(from)
  const toTs = toTimestamp(to)
  const diffRounds = toTs - fromTs

  switch (unit) {
    case 'round':
      return diffRounds
    case 'turn':
      return Math.trunc(diffRounds / ROUNDS_PER_TURN)
    case 'hour':
      return Math.trunc(diffRounds / ROUNDS_PER_HOUR)
    case 'day':
      return Math.trunc(diffRounds / ROUNDS_PER_DAY)
    case 'month': {
      // For months, we use calendar-based calculation (following standard date library patterns)
      // A month is complete when we reach the same day-of-month in the target month
      const direction = diffRounds >= 0 ? 1 : -1
      const [start, end] = direction > 0 ? [from, to] : [to, from]

      let months = (end.year - start.year) * 12 + (end.month - start.month)

      // Check if we've reached the same day in the target month
      // Handle month-end clamping: if start day doesn't exist in end month, treat reaching the last day as complete
      const endMonthLastDay = Months[end.month - 1].days
      const effectiveStartDay = Math.min(start.day, endMonthLastDay)

      if (end.day < effectiveStartDay) {
        months--
      }

      return months * direction
    }
    case 'year': {
      // Use calendar arithmetic, ignoring time-of-day (like months)
      const direction = diffRounds >= 0 ? 1 : -1
      const [start, end] = direction > 0 ? [from, to] : [to, from]

      let years = end.year - start.year

      // Check if we've reached the same date (month and day) in the target year
      // If not, we haven't completed a full calendar year
      if (end.month < start.month || (end.month === start.month && end.day < start.day)) {
        years--
      }

      return years * direction
    }
  }
}
