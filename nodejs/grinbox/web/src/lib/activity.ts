import type { ActivityEntry, ActivityResponse, ActivitySeverity } from '@twin-digital/grinbox-server'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { api } from './api.js'

/**
 * Query hook for the Activity Log (ui-design.md "Activity Log"): the
 * chronological, most-recent-first feed of operational events. Routes through
 * the typed `hc<ApiRoutes>` client so the request/response shapes are inferred
 * from `GET /api/activity`.
 *
 * The feed is **Triage-derived**: per the route's own note, daemon-level events
 * (startup / shutdown / fetch errors) live in the systemd journal, not the
 * State DB, so this surface unions Resource-op Limit-hits / failures and failed
 * Operator runs. The page reflects that scope honestly in its copy.
 */

/** A structured-error wrapper carrying the API's `{ code, message }` body. */
export class ActivityApiError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ActivityApiError'
    this.code = code
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string } | string
}

async function toApiError(res: Response): Promise<ActivityApiError> {
  let body: ErrorBody = {}
  try {
    body = (await res.json()) as ErrorBody
  } catch {
    // non-JSON error body; fall through to a generic message
  }
  if (body.error && typeof body.error === 'object') {
    return new ActivityApiError(
      body.error.code ?? 'error',
      body.error.message ?? `Request failed (HTTP ${res.status}).`,
    )
  }
  if (typeof body.error === 'string') {
    return new ActivityApiError(body.error, `Request failed (HTTP ${res.status}).`)
  }
  return new ActivityApiError('error', `Request failed (HTTP ${res.status}).`)
}

/** The active Activity-Log filter + pagination set, mirrored into the URL. */
export interface ActivityFilters {
  readonly severity?: ActivitySeverity
  readonly resource?: string
  readonly limit: number
  readonly offset: number
}

/** Stable query key (filters are part of the cache identity). */
export function activityKey(filters: ActivityFilters) {
  return ['activity', filters] as const
}

/** Build the `query` object passed to the typed client from active filters. */
function toQueryParams(f: ActivityFilters): Record<string, string> {
  const params: Record<string, string> = {
    limit: String(f.limit),
    offset: String(f.offset),
  }
  if (f.severity !== undefined) {
    params.severity = f.severity
  }
  if (f.resource !== undefined) {
    params.resource = f.resource
  }
  return params
}

export function useActivity(filters: ActivityFilters) {
  return useQuery({
    queryKey: activityKey(filters),
    queryFn: async (): Promise<ActivityResponse> => {
      const res = await api.api.activity.$get({ query: toQueryParams(filters) })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return await res.json()
    },
    // Keep the prior page visible while the next page / filtered set loads, so
    // pagination doesn't flash a skeleton on every step.
    placeholderData: keepPreviousData,
  })
}

export type { ActivityEntry, ActivityResponse, ActivitySeverity }
