import type { InboxFilters, SourceStateFilter, TriageStatusFilter } from '../../lib/messages.js'

/**
 * URL search-param schema for the Inbox (ui-design.md "Inbox": linkable filtered
 * views). The route's `validateSearch` coerces raw query into this shape; the
 * page derives its {@link InboxFilters} from it. Kept as a hand-rolled validator
 * (rather than pulling Zod into the router tree) so the param surface is small
 * and the coercion rules live in one place.
 */

const STATUS_VALUES: readonly TriageStatusFilter[] = ['running', 'completed', 'partial', 'failed']

const SOURCE_STATE_VALUES: readonly SourceStateFilter[] = ['present', 'archived', 'trashed', 'spam', 'deleted', 'all']

export interface InboxSearch {
  readonly accountId?: number
  readonly pipelineId?: number
  readonly status?: TriageStatusFilter
  readonly tagKey?: string
  readonly dateFrom?: number
  readonly dateTo?: number
  readonly q?: string
  /** Backend-disposition scope; absent means the default `present` (inbox). */
  readonly sourceState?: SourceStateFilter
  readonly page?: number
}

/** Default page size; ~15-20 rows above the fold at 1080p (ui-design.md). */
export const INBOX_PAGE_SIZE = 25

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isFinite(n)) {
      return n
    }
  }
  return undefined
}

function str(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }
  return undefined
}

/** Coerce raw router search into the typed {@link InboxSearch}. */
export function validateInboxSearch(raw: Record<string, unknown>): InboxSearch {
  const out: {
    accountId?: number
    pipelineId?: number
    status?: TriageStatusFilter
    tagKey?: string
    dateFrom?: number
    dateTo?: number
    q?: string
    sourceState?: SourceStateFilter
    page?: number
  } = {}

  const accountId = num(raw.accountId)
  if (accountId !== undefined && accountId > 0) {
    out.accountId = accountId
  }

  const pipelineId = num(raw.pipelineId)
  if (pipelineId !== undefined && pipelineId > 0) {
    out.pipelineId = pipelineId
  }

  const status = str(raw.status)
  if (status !== undefined && STATUS_VALUES.includes(status as never)) {
    out.status = status as TriageStatusFilter
  }

  const tagKey = str(raw.tagKey)
  if (tagKey !== undefined) {
    out.tagKey = tagKey
  }

  const dateFrom = num(raw.dateFrom)
  if (dateFrom !== undefined) {
    out.dateFrom = dateFrom
  }

  const dateTo = num(raw.dateTo)
  if (dateTo !== undefined) {
    out.dateTo = dateTo
  }

  const q = str(raw.q)
  if (q !== undefined) {
    out.q = q
  }

  const sourceState = str(raw.sourceState)
  if (
    sourceState !== undefined &&
    SOURCE_STATE_VALUES.includes(sourceState as never) &&
    sourceState !== 'present' // the default; keep it out of the URL
  ) {
    out.sourceState = sourceState as SourceStateFilter
  }

  const page = num(raw.page)
  if (page !== undefined && page >= 1) {
    out.page = Math.floor(page)
  }

  return out
}

/** Derive the API {@link InboxFilters} (offset/limit + filters) from search. */
export function filtersFromSearch(search: InboxSearch): InboxFilters {
  const page = search.page ?? 1
  return {
    accountId: search.accountId,
    pipelineId: search.pipelineId,
    status: search.status,
    tagKey: search.tagKey,
    dateFrom: search.dateFrom,
    dateTo: search.dateTo,
    q: search.q,
    sourceState: search.sourceState,
    limit: INBOX_PAGE_SIZE,
    offset: (page - 1) * INBOX_PAGE_SIZE,
  }
}

/** True when any narrowing filter (not pagination) is active. */
export function hasActiveFilters(search: InboxSearch): boolean {
  return (
    search.accountId !== undefined ||
    search.pipelineId !== undefined ||
    search.status !== undefined ||
    search.tagKey !== undefined ||
    search.dateFrom !== undefined ||
    search.dateTo !== undefined ||
    (search.q !== undefined && search.q.length > 0)
  )
}
