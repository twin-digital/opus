import type { ActivityFilters, ActivitySeverity } from '../../lib/activity.js'

/**
 * URL search-param schema for the Activity Log (ui-design.md "Activity Log":
 * severity + Resource filters, linkable). The route's `validateSearch` coerces
 * raw query into this shape; the page derives its {@link ActivityFilters} from
 * it. Hand-rolled (matching the Inbox) so the param surface stays small and the
 * coercion rules live in one place.
 *
 * Honoring an incoming filter is what lets the Dashboard alert card deep-link
 * here pre-filtered (e.g. `/activity?severity=error`).
 */

const SEVERITY_VALUES: readonly ActivitySeverity[] = ['warning', 'error']

export interface ActivitySearch {
  readonly severity?: ActivitySeverity
  readonly resource?: string
  readonly page?: number
}

/** Default page size for the feed. */
export const ACTIVITY_PAGE_SIZE = 50

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

/** Coerce raw router search into the typed {@link ActivitySearch}. */
export function validateActivitySearch(raw: Record<string, unknown>): ActivitySearch {
  const out: { severity?: ActivitySeverity; resource?: string; page?: number } = {}

  const severity = str(raw.severity)
  if (severity !== undefined && SEVERITY_VALUES.includes(severity as never)) {
    out.severity = severity as ActivitySeverity
  }

  const resource = str(raw.resource)
  if (resource !== undefined) {
    out.resource = resource
  }

  const page = num(raw.page)
  if (page !== undefined && page >= 1) {
    out.page = Math.floor(page)
  }

  return out
}

/** Derive the API {@link ActivityFilters} (offset/limit + filters) from search. */
export function filtersFromSearch(search: ActivitySearch): ActivityFilters {
  const page = search.page ?? 1
  return {
    severity: search.severity,
    resource: search.resource,
    limit: ACTIVITY_PAGE_SIZE,
    offset: (page - 1) * ACTIVITY_PAGE_SIZE,
  }
}

/** True when any narrowing filter (not pagination) is active. */
export function hasActiveFilters(search: ActivitySearch): boolean {
  return search.severity !== undefined || search.resource !== undefined
}
