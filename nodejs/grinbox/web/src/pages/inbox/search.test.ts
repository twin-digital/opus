import { describe, expect, it } from 'vitest'

import { INBOX_PAGE_SIZE, filtersFromSearch, hasActiveFilters, validateInboxSearch } from './search.js'

/**
 * Inbox URL search coercion (pure). Raw query → typed search → API filters; the
 * page relies on this for linkable filtered views, so the coercion and the
 * page→offset math are pinned here.
 */

describe('validateInboxSearch', () => {
  it('coerces numeric + string params and drops junk', () => {
    const out = validateInboxSearch({
      accountId: '3',
      pipelineId: '7',
      status: 'failed',
      tagKey: 'urgency',
      q: 'hi',
      page: '2',
      bogus: 'x',
    })
    expect(out).toEqual({
      accountId: 3,
      pipelineId: 7,
      status: 'failed',
      tagKey: 'urgency',
      q: 'hi',
      page: 2,
    })
  })

  it('rejects an unknown status and a non-positive page', () => {
    const out = validateInboxSearch({ status: 'weird', page: '0' })
    expect(out.status).toBeUndefined()
    expect(out.page).toBeUndefined()
  })
})

describe('filtersFromSearch', () => {
  it('maps page 1 to offset 0 and the default page size', () => {
    const f = filtersFromSearch({})
    expect(f.offset).toBe(0)
    expect(f.limit).toBe(INBOX_PAGE_SIZE)
  })

  it('maps page N to (N-1)*pageSize offset', () => {
    expect(filtersFromSearch({ page: 3 }).offset).toBe(2 * INBOX_PAGE_SIZE)
  })
})

describe('hasActiveFilters', () => {
  it('is false for an empty or page-only search', () => {
    expect(hasActiveFilters({})).toBe(false)
    expect(hasActiveFilters({ page: 4 })).toBe(false)
  })

  it('is true when any narrowing filter is set', () => {
    expect(hasActiveFilters({ q: 'x' })).toBe(true)
    expect(hasActiveFilters({ status: 'failed' })).toBe(true)
  })
})
