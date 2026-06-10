import type {
  CurrentTag,
  MessageListResponse,
  MessageRow,
  OperatorRunDetail,
  TriageEventDetail,
  TriageTagDetail,
} from '@twin-digital/grinbox-server'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './api.js'

/**
 * Query + mutation hooks for the Inbox + Message detail surface (ui-design.md
 * "Inbox / Message browser" and "Message detail"). All calls route through the
 * typed `hc<ApiRoutes>` client so request/response shapes are inferred from the
 * server. The Inbox list query closes over the active filter set; the detail
 * query carries the full Triage history; Replay is a mutation that invalidates
 * the message detail + list.
 */

/** A structured-error wrapper carrying the API's `{ code, message }` body. */
export class MessageApiError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'MessageApiError'
    this.code = code
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string } | string
}

export async function toApiError(res: Response): Promise<MessageApiError> {
  let body: ErrorBody = {}
  try {
    body = (await res.json()) as ErrorBody
  } catch {
    // non-JSON error body; fall through to a generic message
  }
  if (body.error && typeof body.error === 'object') {
    return new MessageApiError(body.error.code ?? 'error', body.error.message ?? `Request failed (HTTP ${res.status}).`)
  }
  if (typeof body.error === 'string') {
    return new MessageApiError(body.error, `Request failed (HTTP ${res.status}).`)
  }
  return new MessageApiError('error', `Request failed (HTTP ${res.status}).`)
}

/** Latest-Triage status filter values accepted by `GET /api/messages`. */
export type TriageStatusFilter = 'running' | 'completed' | 'partial' | 'failed'

/**
 * Backend-disposition filter accepted by `GET /api/messages` (`sourceState`).
 * Omitting it defaults to `present` (the live inbox); `all` shows every
 * disposition.
 */
export type SourceStateFilter = 'present' | 'archived' | 'trashed' | 'spam' | 'deleted' | 'all'

/** The active Inbox filter/search/pagination set, mirrored into the URL. */
export interface InboxFilters {
  readonly accountId?: number
  readonly pipelineId?: number
  readonly status?: TriageStatusFilter
  readonly tagKey?: string
  readonly tagValue?: string
  readonly dateFrom?: number
  readonly dateTo?: number
  readonly q?: string
  /** Omit for the default `present` scope; set to widen/redirect the scope. */
  readonly sourceState?: SourceStateFilter
  readonly limit: number
  readonly offset: number
}

/** Stable query key for an Inbox page (filters are part of the cache identity). */
export function messagesKey(filters: InboxFilters) {
  return ['messages', filters] as const
}

export const messageKey = (id: number) => ['messages', 'detail', id] as const

/** Build the `query` object passed to the typed client from active filters. */
export function toQueryParams(f: InboxFilters): Record<string, string> {
  const params: Record<string, string> = {
    limit: String(f.limit),
    offset: String(f.offset),
  }
  if (f.accountId !== undefined) {
    params.accountId = String(f.accountId)
  }
  if (f.pipelineId !== undefined) {
    params.pipelineId = String(f.pipelineId)
  }
  if (f.status !== undefined) {
    params.status = f.status
  }
  if (f.tagKey !== undefined) {
    params.tagKey = f.tagKey
  }
  if (f.tagValue !== undefined) {
    params.tagValue = f.tagValue
  }
  if (f.dateFrom !== undefined) {
    params.dateFrom = String(f.dateFrom)
  }
  if (f.dateTo !== undefined) {
    params.dateTo = String(f.dateTo)
  }
  if (f.q !== undefined && f.q.length > 0) {
    params.q = f.q
  }
  if (f.sourceState !== undefined) {
    params.sourceState = f.sourceState
  }
  return params
}

export function useMessages(filters: InboxFilters) {
  return useQuery({
    queryKey: messagesKey(filters),
    queryFn: async (): Promise<MessageListResponse> => {
      const res = await api.api.messages.$get({ query: toQueryParams(filters) })
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

/** A single Operator run within a Triage. */
export type MessageTriageRun = OperatorRunDetail

/** A single chronological event within a Triage. */
export type MessageTriageEvent = TriageEventDetail

/** A Tag produced within a Triage. */
export type MessageTriageTag = TriageTagDetail

/** One Triage in a Message's history, with its runs / events / tags inline. */
export interface MessageTriage {
  readonly id: number
  readonly pipeline_id: number
  readonly triggered_by: string
  readonly actor_user_id: number | null
  readonly started_at: number | null
  readonly ended_at: number | null
  readonly status: string
  readonly error_summary: string | null
  readonly operator_runs: readonly MessageTriageRun[]
  readonly events: readonly MessageTriageEvent[]
  readonly tags: readonly MessageTriageTag[]
}

export interface MessageDetailMessage {
  readonly id: number
  readonly account_id: number
  readonly backend_message_id: string | null
  readonly backend_thread_id: string | null
  readonly from_header: string | null
  readonly to_header: string | null
  readonly subject: string | null
  readonly snippet: string | null
  readonly body_text: string | null
  readonly body_html: string | null
  readonly received_at: number | null
  readonly created_at: number | null
  readonly body_fetched_at: number | null
  readonly source_state: string
}

export interface MessageDetail {
  readonly message: MessageDetailMessage
  readonly current_tags: readonly CurrentTag[]
  readonly triages: readonly MessageTriage[]
}

export function useMessage(id: number) {
  return useQuery({
    queryKey: messageKey(id),
    queryFn: async (): Promise<MessageDetail> => {
      const res = await api.api.messages[':id'].$get({
        param: { id: String(id) },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return await res.json()
    },
  })
}

export function useReplayMessage(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.api.messages[':id'].replay.$post({
        param: { id: String(id) },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: messageKey(id) })
      void qc.invalidateQueries({ queryKey: ['messages'] })
    },
  })
}

/** Result of a manual sync: accounts polled + new Messages found. */
export interface SyncResult {
  readonly accounts: number
  readonly newMessages: number
}

/**
 * Trigger an on-demand Gmail poll (`POST /api/sync`) — the Inbox refresh button.
 * On success, invalidates the message list so the freshly-synced rows load.
 */
export function useSyncNow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<SyncResult> => {
      const res = await api.api.sync.$post()
      if (!res.ok) {
        throw await toApiError(res)
      }
      return await res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['messages'] })
    },
  })
}

/** Best-effort human message for a thrown mutation/query error. */
export function errorMessage(err: unknown): string {
  if (err instanceof MessageApiError) {
    return err.message
  }
  if (err instanceof Error) {
    return err.message
  }
  return 'Something went wrong.'
}

export type { MessageRow }
