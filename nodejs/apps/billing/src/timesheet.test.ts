import { describe, expect, it } from 'vitest'
import { selectBillable, type TimeEntry } from './timesheet.js'

const entry = (overrides: Partial<TimeEntry>): TimeEntry => ({
  client: 'acme',
  billable: true,
  date: new Date(Date.UTC(2025, 11, 15)),
  hours: 1,
  ...overrides,
})

describe('selectBillable', () => {
  it('keeps billable, unbilled entries for the client', () => {
    const entries = [entry({}), entry({})]
    expect(selectBillable(entries, 'acme')).toHaveLength(2)
  })

  it('excludes other clients', () => {
    const entries = [entry({ client: 'acme' }), entry({ client: 'globex' })]
    expect(selectBillable(entries, 'acme')).toHaveLength(1)
  })

  it('excludes non-billable entries', () => {
    expect(selectBillable([entry({ billable: false })], 'acme')).toHaveLength(0)
  })

  it('excludes entries already billed (invoice number present)', () => {
    expect(selectBillable([entry({ invoiceNumber: 'INV-001' })], 'acme')).toHaveLength(0)
  })

  it('treats a blank/whitespace invoice number as unbilled', () => {
    expect(selectBillable([entry({ invoiceNumber: '  ' })], 'acme')).toHaveLength(1)
  })
})
