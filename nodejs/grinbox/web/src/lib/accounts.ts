import type { AccountSummary, PipelineSummary } from '@grinbox/server'
import type { AccountColor, AccountIcon } from '@grinbox/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './api'
import { toApiError } from './api-error'

/**
 * Query + mutation hooks for the Accounts surface (list, detail, pipeline
 * picker, and the PATCH/DELETE mutations). All calls route through the typed
 * `hc<ApiRoutes>` client so request/response shapes are inferred from the
 * server. Mutations invalidate the relevant queries on success; structured
 * error bodies (`{ error: { code, message } }`) are surfaced via the shared
 * {@link toApiError} for the caller to toast.
 */

export const accountsKey = ['accounts'] as const
export const accountKey = (id: number) => ['accounts', id] as const
export const pipelinesKey = ['pipelines'] as const

export function useAccounts() {
  return useQuery({
    queryKey: accountsKey,
    queryFn: async (): Promise<AccountSummary[]> => {
      const res = await api.api.accounts.$get()
      if (!res.ok) {
        throw await toApiError(res)
      }
      const { accounts } = await res.json()
      return accounts
    },
  })
}

export function useAccount(id: number) {
  return useQuery({
    queryKey: accountKey(id),
    queryFn: async (): Promise<AccountSummary> => {
      const res = await api.api.accounts[':id'].$get({
        param: { id: String(id) },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      const { account } = await res.json()
      return account
    },
  })
}

export function usePipelines() {
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

export interface UpdateAccountInput {
  activePipelineId?: number | null
  pollIntervalSeconds?: number
  name?: string
  /** Display icon name; `null` clears it back to the default glyph. */
  icon?: string | null
  /** Display color token; `null` clears it back to a neutral badge. */
  color?: string | null
}

export function useUpdateAccount(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpdateAccountInput) => {
      const res = await api.api.accounts[':id'].$patch({
        param: { id: String(id) },
        json: {
          ...(input.activePipelineId !== undefined ? { active_pipeline_id: input.activePipelineId } : {}),
          ...(input.pollIntervalSeconds !== undefined ? { poll_interval_seconds: input.pollIntervalSeconds } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          // Server validates against the closed icon/color vocabularies; the
          // cast satisfies the RPC's enum-typed body from our looser input.
          ...(input.icon !== undefined ? { icon: input.icon as AccountIcon | null } : {}),
          ...(input.color !== undefined ? { color: input.color as AccountColor | null } : {}),
        },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accountKey(id) })
      void qc.invalidateQueries({ queryKey: accountsKey })
    },
  })
}

export function useDeleteAccount(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.api.accounts[':id'].$delete({
        param: { id: String(id) },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: accountsKey })
    },
  })
}
