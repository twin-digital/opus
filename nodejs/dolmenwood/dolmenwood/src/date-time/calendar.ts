import type { GameDateTime } from './model.js'

export interface Month {
  /**
   * Number of days in this month
   */
  readonly days: number

  /**
   * Name of this month
   */
  readonly name: string
}

export const Months: Month[] = [
  {
    name: 'Grimvold',
    days: 30,
  },
  {
    name: 'Lymewald',
    days: 28,
  },
  {
    name: 'Haggryme',
    days: 30,
  },
  {
    name: 'Symswald',
    days: 29,
  },
  {
    name: 'Harchment',
    days: 29,
  },
  {
    name: 'Iggwyld',
    days: 30,
  },
  {
    name: 'Chysting',
    days: 31,
  },
  {
    name: 'Lillipythe',
    days: 29,
  },
  {
    name: 'Haelhold',
    days: 28,
  },
  {
    name: 'Reedwryme',
    days: 30,
  },
  {
    name: 'Obthryme',
    days: 28,
  },
  {
    name: 'Braghold',
    days: 30,
  },
] as const satisfies Month[]

/**
 * DCB p14
 */
export const DEFAULT_CURRENT_YEAR = 1089

export const DEFAULT_DATE_TIME = {
  day: 1,
  hour: 12,
  month: 1,
  turn: 1,
  year: DEFAULT_CURRENT_YEAR,
} satisfies GameDateTime

/**
 * First moment from which all others are tracked.
 */
export const CalendarEpoch: GameDateTime = {
  day: 1,
  hour: 0,
  month: 1,
  round: 1,
  turn: 1,
  year: 1,
}
