import type { TimeEntry } from './timesheet.js'

/** Quarter-hour units per hour — the line item is priced per ¼ hour. */
const UNITS_PER_HOUR = 4

/**
 * A computed invoice line item, in the shape we hand to Stripe as a pending
 * invoice item. `unitAmount` is in the currency's minor unit (e.g. cents).
 * `period` start/end are unix timestamps (seconds), which Stripe renders as the
 * "dates of service" range on the invoice.
 */
export interface LineItem {
  description: string
  quantity: number
  unitAmount: number
  currency: string
  period: { start: number; end: number }
}

export interface LineItemConfig {
  /** Line item title, e.g. `Development: Hotel Management System (¼ hour)`. */
  description: string
  /** Price per ¼ hour, in the currency's minor unit. */
  unitAmount: number
  /** ISO currency code, e.g. `usd`. */
  currency: string
}

/** Unix timestamp (seconds) for the first day of the given date's month, 00:00 UTC. */
const startOfMonth = (date: Date): number => Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1) / 1000)

/** Unix timestamp (seconds) for the last day of the given date's month, 00:00 UTC. */
const endOfMonth = (date: Date): number => Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0) / 1000)

/**
 * Rolls a set of selected time entries into a single invoice line item:
 * quantity is `4 × total hours` (¼-hour units), and the service period is
 * rounded out to month boundaries spanning the earliest and latest entries.
 *
 * Throws if given no entries — there is nothing to bill.
 */
export const buildLineItem = (entries: readonly TimeEntry[], config: LineItemConfig): LineItem => {
  if (entries.length === 0) {
    throw new Error('Cannot build a line item from zero entries.')
  }

  const totalHours = entries.reduce((sum, entry) => sum + entry.hours, 0)
  const times = entries.map((entry) => entry.date.getTime())
  const earliest = new Date(Math.min(...times))
  const latest = new Date(Math.max(...times))

  return {
    description: config.description,
    quantity: Math.round(UNITS_PER_HOUR * totalHours),
    unitAmount: config.unitAmount,
    currency: config.currency,
    period: { start: startOfMonth(earliest), end: endOfMonth(latest) },
  }
}
