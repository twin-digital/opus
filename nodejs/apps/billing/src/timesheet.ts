/**
 * A single time entry, as recorded in the Nextcloud timesheet. Mirrors the
 * spreadsheet columns: Client, Billable, Date, Hours, Invoice #.
 */
export interface TimeEntry {
  /** Client this entry belongs to (the `Client` column). */
  client: string
  /** Whether the entry is billable (`Billable` = Yes). */
  billable: boolean
  /** Date the work was performed (`Date` column), midnight UTC. */
  date: Date
  /** Hours worked (`Hours` column). */
  hours: number
  /**
   * Invoice number the entry was billed on, if any (`Invoice #` column). A
   * blank value means the entry has not yet been billed.
   */
  invoiceNumber?: string
}

/**
 * Selects the entries that should appear on a client's next invoice: those for
 * the given client that are billable and not yet billed (no invoice number).
 *
 * The blank-invoice-number rule is what prevents double-billing — once an entry
 * is stamped with an invoice number it drops out of future selections.
 */
export const selectBillable = (entries: readonly TimeEntry[], client: string): TimeEntry[] =>
  entries.filter(
    (entry) =>
      entry.client === client &&
      entry.billable &&
      (entry.invoiceNumber === undefined || entry.invoiceNumber.trim() === ''),
  )
