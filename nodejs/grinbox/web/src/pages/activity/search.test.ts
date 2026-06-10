import { describe, expect, it } from 'vitest'

import { ACTIVITY_PAGE_SIZE, filtersFromSearch, hasActiveFilters, validateActivitySearch } from './search.js'

/**
 * Activity-Log URL search coercion (pure). Mirrors the Inbox version: raw query
 * → typed search → API filters. The Dashboard alert card deep-links here
 * pre-filtered, so the severity-enum rejection and page→offset math are pinned.
 */

describe('validateActivitySearch', () => {
  it('coerces a valid severity + resource + page', () => {
    const out = validateActivitySearch({
      severity: 'error',
      resource: 'pushover_api',
      page: '3',
      bogus: 'x',
    })
    expect(out).toEqual({
      severity: 'error',
      resource: 'pushover_api',
      page: 3,
    })
  })

  it('drops a severity outside the SEVERITY_VALUES enum', () => {
    // 'info' (and anything not warning/error) is silently dropped.
    expect(validateActivitySearch({ severity: 'info' }).severity).toBeUndefined()
    expect(validateActivitySearch({ severity: 'whatever' }).severity).toBeUndefined()
  })

  it('accepts both enum members', () => {
    expect(validateActivitySearch({ severity: 'warning' }).severity).toBe('warning')
    expect(validateActivitySearch({ severity: 'error' }).severity).toBe('error')
  })

  it('rejects a non-positive page and floors a fractional one', () => {
    expect(validateActivitySearch({ page: '0' }).page).toBeUndefined()
    expect(validateActivitySearch({ page: '-2' }).page).toBeUndefined()
    expect(validateActivitySearch({ page: '2.9' }).page).toBe(2)
  })
})

describe('filtersFromSearch', () => {
  it('maps page 1 to offset 0 and the default page size', () => {
    const f = filtersFromSearch({})
    expect(f.offset).toBe(0)
    expect(f.limit).toBe(ACTIVITY_PAGE_SIZE)
  })

  it('maps page N to (N-1)*pageSize offset', () => {
    expect(filtersFromSearch({ page: 3 }).offset).toBe(2 * ACTIVITY_PAGE_SIZE)
  })
})

describe('hasActiveFilters', () => {
  it('is false for an empty or page-only search', () => {
    expect(hasActiveFilters({})).toBe(false)
    expect(hasActiveFilters({ page: 4 })).toBe(false)
  })

  it('is true when severity or resource is set', () => {
    expect(hasActiveFilters({ severity: 'error' })).toBe(true)
    expect(hasActiveFilters({ resource: 'pushover_api' })).toBe(true)
  })
})
