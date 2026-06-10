import type { CredentialSummary, PipelineDetail, PipelineSummary } from '@twin-digital/grinbox-server'
import type { OperatorTypeKey, RuleBasedTaggerConfig } from '@twin-digital/grinbox-shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'

import { api } from './api.js'

/**
 * Query + mutation hooks for the Pipelines surface (list, detail, and the
 * create/edit/delete Pipeline + create/edit/enable/disable/delete Operator
 * mutations). All calls route through the typed `hc<ApiRoutes>` client so
 * request/response shapes are inferred from the server. Mutations invalidate the
 * relevant queries on success; structured error bodies
 * (`{ error: { code, message, details } }`) are surfaced via {@link PipelineApiError}
 * so the editor can render validation failures (collision / cycle / dangling
 * input / bad config) inline.
 */

export const pipelinesKey = ['pipelines'] as const
export const pipelineKey = (id: number) => ['pipelines', id] as const

/**
 * A structured-error wrapper carrying the API's `{ code, message, details }`
 * body. `details` carries case-specific context the editor renders inline — the
 * per-error list for `pipeline_validation_failed`, the Zod issue list for
 * `invalid_config`.
 */
export class PipelineApiError extends Error {
  readonly code: string
  readonly details: unknown
  constructor(code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'PipelineApiError'
    this.code = code
    this.details = details
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: unknown } | string
}

/** Pull a human message + code + details out of an API error response. */
async function toApiError(res: Response): Promise<PipelineApiError> {
  let body: ErrorBody = {}
  try {
    body = (await res.json()) as ErrorBody
  } catch {
    // non-JSON error body; fall through to a generic message
  }
  if (body.error && typeof body.error === 'object') {
    return new PipelineApiError(
      body.error.code ?? 'error',
      body.error.message ?? `Request failed (HTTP ${res.status}).`,
      body.error.details,
    )
  }
  if (typeof body.error === 'string') {
    return new PipelineApiError(body.error, `Request failed (HTTP ${res.status}).`)
  }
  return new PipelineApiError('error', `Request failed (HTTP ${res.status}).`)
}

export function usePipelineList() {
  return useQuery({
    queryKey: pipelinesKey,
    queryFn: async (): Promise<PipelineSummary[]> => {
      const res = await api.api.pipelines.$get()
      if (!res.ok) {
        throw await toApiError(res)
      }
      const { pipelines } = await res.json()
      return pipelines
    },
  })
}

export function usePipeline(id: number) {
  return useQuery({
    queryKey: pipelineKey(id),
    queryFn: async (): Promise<PipelineDetail> => {
      const res = await api.api.pipelines[':id'].$get({
        param: { id: String(id) },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      const { pipeline } = await res.json()
      return pipeline
    },
  })
}

export const credentialsKey = (kind?: string) => ['credentials', kind ?? 'all'] as const

/**
 * List the User's live Credentials' non-secret metadata, optionally narrowed to
 * a `kind` (the Notify editor passes `'pushover'`). The server never returns the
 * encrypted blob, so this is safe to surface in the UI.
 */
export function useCredentials(kind?: string) {
  return useQuery({
    queryKey: credentialsKey(kind),
    queryFn: async (): Promise<CredentialSummary[]> => {
      const res = await api.api.credentials.$get({
        query: kind !== undefined ? { kind } : {},
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      const { credentials } = await res.json()
      return credentials
    },
  })
}

export function useCreatePipeline() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; description?: string | null }): Promise<number> => {
      const res = await api.api.pipelines.$post({
        json: {
          name: input.name,
          ...(input.description != null ? { description: input.description } : {}),
        },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      const body = (await res.json()) as { id: number }
      return body.id
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: pipelinesKey })
    },
  })
}

export function useUpdatePipeline(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name?: string; description?: string | null }) => {
      const res = await api.api.pipelines[':id'].$patch({
        param: { id: String(id) },
        json: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: pipelineKey(id) })
      void qc.invalidateQueries({ queryKey: pipelinesKey })
    },
  })
}

export function useDeletePipeline(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.api.pipelines[':id'].$delete({
        param: { id: String(id) },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: pipelinesKey })
    },
  })
}

export function useCreateOperator(pipelineId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      name: string
      type_key: OperatorTypeKey
      config: unknown
      enabled?: boolean
    }): Promise<number> => {
      const res = await api.api.pipelines[':id'].operators.$post({
        param: { id: String(pipelineId) },
        json: {
          name: input.name,
          type_key: input.type_key,
          config: input.config,
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      const body = (await res.json()) as { id: number }
      return body.id
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: pipelineKey(pipelineId) })
    },
  })
}

export function useUpdateOperator(pipelineId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { operatorId: number; name?: string; config: unknown }) => {
      const res = await api.api.operators[':id'].$patch({
        param: { id: String(input.operatorId) },
        json: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          config: input.config,
        },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: pipelineKey(pipelineId) })
    },
  })
}

export function useSetOperatorEnabled(pipelineId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { operatorId: number; enabled: boolean }) => {
      const route = input.enabled ? api.api.operators[':id'].enable : api.api.operators[':id'].disable
      const res = await route.$post({
        param: { id: String(input.operatorId) },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: pipelineKey(pipelineId) })
    },
  })
}

export function useDeleteOperator(pipelineId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (operatorId: number) => {
      const res = await api.api.operators[':id'].$delete({
        param: { id: String(operatorId) },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: pipelineKey(pipelineId) })
    },
  })
}

// --- Rule-based Tagger live preview --------------------------------------

/**
 * The successful `POST /api/operators/preview` body (the impact diff): every
 * evaluated Message with its `current_value → draft_value` diff, plus the
 * `changed_count` / `total_evaluated` summary. Inferred from the typed RPC
 * client so it tracks the server route with no hand-written DTO.
 */
export type OperatorPreviewResponse = InferResponseType<typeof api.api.operators.preview.$post, 200>

export const operatorPreviewKey = (pipelineId: number, serializedConfig: string, limit: number) =>
  ['operator-preview', pipelineId, limit, serializedConfig] as const

/**
 * Parse a preview error response. The preview route surfaces a flat
 * `{ error, message }` body — `invalid_match_expression` carries the failing
 * rule's compile message, and any other 400/500 a generic one. Distinct from
 * the pipeline mutations' nested `{ error: { code, message } }` envelope, so it
 * gets its own reader.
 */
async function toPreviewError(res: Response): Promise<PipelineApiError> {
  let body: { error?: string; message?: string } = {}
  try {
    body = (await res.json()) as { error?: string; message?: string }
  } catch {
    // non-JSON error body; fall through to a generic message
  }
  return new PipelineApiError(body.error ?? 'error', body.message ?? `Request failed (HTTP ${res.status}).`)
}

/**
 * Live-preview the Rule-based Tagger draft against the Pipeline's recent
 * Triages. Disabled until `config` is non-null — the caller passes the
 * client-side-validated draft (or `null` while it's incomplete), so an invalid
 * config is never POSTed. The query key folds in the serialized draft, so each
 * edit (after the caller's debounce) is its own cache entry.
 */
export function useOperatorPreview(pipelineId: number, config: RuleBasedTaggerConfig | null, limit = 50) {
  const serialized = config === null ? '' : JSON.stringify(config)
  return useQuery({
    queryKey: operatorPreviewKey(pipelineId, serialized, limit),
    enabled: config !== null,
    // The diff is a point-in-time snapshot of an editing session; don't refetch
    // it out from under the author on focus/reconnect.
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<OperatorPreviewResponse> => {
      // `enabled` guarantees a non-null config here.
      const res = await api.api.operators.preview.$post({
        json: {
          pipeline_id: pipelineId,
          config: config as RuleBasedTaggerConfig,
          limit,
        },
      })
      if (!res.ok) {
        throw await toPreviewError(res)
      }
      return await res.json()
    },
  })
}

/** Best-effort human message for a thrown mutation error. */
export function errorMessage(err: unknown): string {
  if (err instanceof PipelineApiError) {
    return err.message
  }
  if (err instanceof Error) {
    return err.message
  }
  return 'Something went wrong.'
}
