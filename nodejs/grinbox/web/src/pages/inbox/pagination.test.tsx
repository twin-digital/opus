import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Pagination, displayFrom } from './list.js'

/**
 * Inbox pager + From-header trimming (off-by-one-prone presentation logic that
 * the page tests assert the offset *into* but never render). Pinned directly.
 */

describe('Pagination', () => {
  it('derives page/last-page and the first–last display from offset/limit/total', () => {
    // offset 50, limit 25 → page 3; total 130 → ceil(130/25)=6 pages; window 51–75.
    render(<Pagination offset={50} limit={25} total={130} onPage={() => undefined} />)
    expect(screen.getByText('Page 3 of 6')).toBeInTheDocument()
    expect(screen.getByText('51–75 of 130')).toBeInTheDocument()
  })

  it('clamps the last window to total and shows last page boundaries', () => {
    // offset 125, limit 25, total 130 → page 6 of 6; window 126–130 (clamped).
    render(<Pagination offset={125} limit={25} total={130} onPage={() => undefined} />)
    expect(screen.getByText('Page 6 of 6')).toBeInTheDocument()
    expect(screen.getByText('126–130 of 130')).toBeInTheDocument()
  })

  it('shows 0–0 of 0 and a single page when empty', () => {
    render(<Pagination offset={0} limit={25} total={0} onPage={() => undefined} />)
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument()
    expect(screen.getByText('0–0 of 0')).toBeInTheDocument()
  })

  it('disables Previous on the first page and Next on the last', () => {
    render(<Pagination offset={0} limit={25} total={130} onPage={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled()
  })

  it('disables Next on the last page and enables Previous', () => {
    render(<Pagination offset={125} limit={25} total={130} onPage={() => undefined} />)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous' })).not.toBeDisabled()
  })

  it('navigates to the adjacent page on click', () => {
    const onPage = vi.fn()
    render(<Pagination offset={50} limit={25} total={130} onPage={onPage} />)
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onPage).toHaveBeenNthCalledWith(1, 2)
    expect(onPage).toHaveBeenNthCalledWith(2, 4)
  })
})

describe('displayFrom', () => {
  it('extracts the display name from a "Name <addr>" header', () => {
    expect(displayFrom('Alice Example <alice@example.com>')).toBe('Alice Example')
  })

  it('strips surrounding quotes from a quoted display name', () => {
    expect(displayFrom('"Bob, Jr." <bob@example.com>')).toBe('Bob, Jr.')
  })

  it('falls back to the address when the display name is whitespace', () => {
    expect(displayFrom(' <carol@example.com>')).toBe('carol@example.com')
  })

  it('returns a bare address unchanged', () => {
    expect(displayFrom('dave@example.com')).toBe('dave@example.com')
  })

  it('returns the unknown-sender placeholder for null', () => {
    expect(displayFrom(null)).toBe('(unknown sender)')
  })
})
