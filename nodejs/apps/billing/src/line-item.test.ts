import { describe, expect, it } from 'vitest'
import { buildLineItem, type LineItemConfig } from './line-item.js'
import type { TimeEntry } from './timesheet.js'

const config: LineItemConfig = {
  description: 'Development: Hotel Management System (¼ hour)',
  unitAmount: 2500,
  currency: 'usd',
}

const entry = (date: Date, hours: number): TimeEntry => ({
  client: 'acme',
  billable: true,
  date,
  hours,
})

const unix = (y: number, m: number, d: number): number => Math.floor(Date.UTC(y, m, d) / 1000)

describe('buildLineItem', () => {
  it('rolls hours into quarter-hour quantity', () => {
    const item = buildLineItem(
      [entry(new Date(Date.UTC(2025, 11, 3)), 2), entry(new Date(Date.UTC(2025, 11, 10)), 1.5)],
      config,
    )
    expect(item.quantity).toBe(14) // 4 * 3.5
  })

  it('carries through description, unit price, and currency', () => {
    const item = buildLineItem([entry(new Date(Date.UTC(2025, 11, 3)), 1)], config)
    expect(item).toMatchObject({
      description: config.description,
      unitAmount: 2500,
      currency: 'usd',
    })
  })

  it('rounds the period out to month boundaries within a single month', () => {
    const item = buildLineItem(
      [entry(new Date(Date.UTC(2025, 11, 3)), 1), entry(new Date(Date.UTC(2025, 11, 28)), 1)],
      config,
    )
    expect(item.period.start).toBe(unix(2025, 11, 1)) // Dec 1, 2025
    expect(item.period.end).toBe(unix(2025, 11, 31)) // Dec 31, 2025
  })

  it('spans earliest to latest month across multiple months', () => {
    const item = buildLineItem(
      [entry(new Date(Date.UTC(2025, 11, 20)), 1), entry(new Date(Date.UTC(2026, 1, 5)), 1)],
      config,
    )
    expect(item.period.start).toBe(unix(2025, 11, 1)) // Dec 1, 2025
    expect(item.period.end).toBe(unix(2026, 1, 28)) // Feb 28, 2026
  })

  it('throws when there are no entries', () => {
    expect(() => buildLineItem([], config)).toThrow()
  })
})
