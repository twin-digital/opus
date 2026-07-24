import { parse } from 'csv-parse/sync'
import type { TimeEntry } from './timesheet.js'

/**
 * The timesheet columns we read. The CSV has more (Who, Task, Description, and
 * several derived totals), but billing only depends on these five.
 */
interface TimesheetRow {
  Client: string
  Billable: string
  Date: string
  Hours: string
  'Invoice #': string
}

/** Parses a `MM/DD/YYYY` cell into a midnight-UTC Date. */
const parseUsDate = (value: string): Date => {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim())
  if (!match) {
    throw new Error(`Unrecognized date: "${value}" (expected MM/DD/YYYY)`)
  }
  const [, month, day, year] = match
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
}

/**
 * Parses an exported timesheet CSV into time entries.
 *
 * Rows without a Date are treated as blank filler (the export pads the sheet
 * with many empty rows) and skipped. Client names are passed through verbatim —
 * normalizing their minor variations is a manual cleanup step upstream.
 */
export const parseTimesheet = (csv: string): TimeEntry[] => {
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as TimesheetRow[]

  return rows
    .filter((row) => row.Date.trim() !== '')
    .map((row) => {
      const hours = Number(row.Hours)
      if (Number.isNaN(hours)) {
        throw new Error(`Invalid Hours value "${row.Hours}" for ${row.Client} on ${row.Date}`)
      }
      const invoiceNumber = row['Invoice #'].trim()
      return {
        client: row.Client.trim(),
        billable: row.Billable.trim().toLowerCase() === 'yes',
        date: parseUsDate(row.Date),
        hours,
        ...(invoiceNumber !== '' && { invoiceNumber }),
      }
    })
}
