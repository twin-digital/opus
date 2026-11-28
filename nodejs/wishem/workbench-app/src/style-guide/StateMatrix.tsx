import type { ReactNode } from 'react'

export interface StateMatrixRow {
  label: string
  /**
   * One cell for each column. A `null` leaves the cell empty.
   */
  cells: readonly ReactNode[]
}

export interface StateMatrixProps {
  /**
   * The names of the state columns, for example `Default` and `Hover`.
   */
  columns: readonly string[]
  rows: readonly StateMatrixRow[]
}

const label = 'font-mono text-label font-medium text-fg-muted uppercase'

/**
 * A grid of specimens with a label for each row and each column.
 */
export const StateMatrix = ({ columns, rows }: StateMatrixProps) => (
  <div
    className='grid items-start gap-x-4 gap-y-3'
    style={{ gridTemplateColumns: `110px repeat(${columns.length}, minmax(0, 1fr))` }}
  >
    <span />
    {columns.map((column) => (
      <span key={column} className={label}>
        {column}
      </span>
    ))}
    {rows.map((row) => (
      <div key={row.label} className='contents'>
        <span className={`${label} pt-[7px]`}>{row.label}</span>
        {columns.map((column, index) => (
          <div key={column} className='min-w-0'>
            {row.cells[index] ?? null}
          </div>
        ))}
      </div>
    ))}
  </div>
)
