import { describe, expect, it } from 'vitest'
import { parseTimesheet } from './parse-timesheet.js'

const HEADER =
  'Who,Client,Task,Billable,Date,Hours,Description,Billable Hours,Non-Billable Hours,Invoice #,Unbilled Hours,Month,Total Hours'

const sample = [
  HEADER,
  'Jen,4th Street Lofts,Customer Service,Yes,07/15/2025,1,"Follow up, re: OTAs (Carl)",1,,4SL-0011,,07/2025,1',
  'Sean,Internal,Bookkeeping,No,07/22/2025,1,Partial bookkeeping for 12/2024,,1,,,07/2025,1',
  'Sean,4th Street Lofts,Contracted Maintenance,No,07/29/2025,0.25,Added banner,,0.25,,,07/2025,0.25',
  'Jen,4th Street Lofts,OTA Integration,Yes,09/02/2025,0.75,Resolved AirBNB sync,0.75,,4SL-0012,,09/2025,0.75',
  ',,,,,,,,,,,,',
  ',,,,,,,,,,,,',
].join('\n')

describe('parseTimesheet', () => {
  it('skips blank filler rows', () => {
    expect(parseTimesheet(sample)).toHaveLength(4)
  })

  it('maps columns and parses US dates as UTC', () => {
    const [first] = parseTimesheet(sample)
    expect(first).toEqual({
      client: '4th Street Lofts',
      billable: true,
      date: new Date(Date.UTC(2025, 6, 15)),
      hours: 1,
      invoiceNumber: '4SL-0011',
    })
  })

  it('treats Billable other than "Yes" as non-billable', () => {
    expect(parseTimesheet(sample)[1].billable).toBe(false)
  })

  it('omits invoiceNumber when the cell is blank', () => {
    expect(parseTimesheet(sample)[1]).not.toHaveProperty('invoiceNumber')
  })

  it('preserves fractional hours and commas inside quoted descriptions', () => {
    const entries = parseTimesheet(sample)
    expect(entries[2].hours).toBe(0.25)
    expect(entries).toHaveLength(4) // the quoted comma in row 1 did not split a column
  })

  it('throws on a malformed date', () => {
    const bad = [HEADER, 'Sean,X,Task,No,2025-07-15,1,desc,,1,,,07/2025,1'].join('\n')
    expect(() => parseTimesheet(bad)).toThrow(/MM\/DD\/YYYY/)
  })
})
