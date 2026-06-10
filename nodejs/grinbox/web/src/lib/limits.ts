import type { LimitEntry } from '@twin-digital/grinbox-server'
import type { LimitDefinition } from '@twin-digital/grinbox-shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './api.js'
import { toApiError } from './api-error.js'

/**
 * Query + mutation hooks for the Limits settings subsection (list with usage,
 * create, edit-caps, delete). Calls route through the typed `hc<ApiRoutes>`
 * client so request/response shapes are inferred from the server. Mutations
 * invalidate the limits query on success; structured error bodies surface via
 * {@link toApiError} for the caller to toast/inline.
 */

export const limitsKey = ['limits'] as const

export function useLimits() {
  return useQuery({
    queryKey: limitsKey,
    queryFn: async (): Promise<LimitEntry[]> => {
      const res = await api.api.limits.$get()
      if (!res.ok) {
        throw await toApiError(res)
      }
      const { limits } = await res.json()
      return limits
    },
  })
}

export function useCreateLimit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: LimitDefinition) => {
      const res = await api.api.limits.$post({ json: input })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: limitsKey })
    },
  })
}

export interface EditLimitInput {
  id: number
  max_count: number
  window_seconds: number | null
}

export function useEditLimit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, max_count, window_seconds }: EditLimitInput) => {
      const res = await api.api.limits[':id'].$patch({
        param: { id: String(id) },
        json: { max_count, window_seconds },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: limitsKey })
    },
  })
}

export function useDeleteLimit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.api.limits[':id'].$delete({
        param: { id: String(id) },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: limitsKey })
    },
  })
}
