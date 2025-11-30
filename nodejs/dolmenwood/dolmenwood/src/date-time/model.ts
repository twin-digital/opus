export const ROUNDS_PER_TURN = 60
export const TURNS_PER_HOUR = 6
export const HOURS_PER_DAY = 24
export const DAYS_IN_YEAR = 352

/**
 * Names of the units used to track dates & times in Dolmenwood.
 */
export const DateTimeUnits = ['day', 'hour', 'month', 'round', 'turn', 'year'] as const
export type DateTimeUnit = (typeof DateTimeUnits)[number]

/**
 * Number of rounds since the calendar epoch (i.e. the "first moment" tracked).
 */
export type GameTimestamp = number

/**
 * Represents a date in Dolmenwood's calendar.
 */
export interface GameDate {
  /**
   * Day of the month (1-31)
   */
  readonly day: number

  /**
   * Month of the year (1-12)
   */
  readonly month: number

  /**
   * Numeric year of this date
   */
  readonly year: number
}

/**
 * Represents a time in Dolmenwood's timekeeping system.
 */
export interface GameDateTime extends GameDate {
  /**
   * Hour of the day (0-23)
   */
  readonly hour: number

  /**
   * Ten-second round of the turn (1-60). Only used during (usually combat) encounters. Assumed to be 1 (or irrelevant)
   * if unset.
   */
  readonly round?: number

  /**
   * Ten-minute turn of the hour (1-6)
   */
  readonly turn: number
}
