import { type ModelId, type ModelOption, modelLabel } from '@grinbox/shared'
import { useQuery } from '@tanstack/react-query'

import { api } from './api'
import { toApiError } from './api-error'

/**
 * Query hook for `GET /api/models`: which of the offered models this daemon can
 * actually invoke, for the model pickers (LLM tagger `model_id`, digest
 * `summary_model_id`). The route answers what is available; the display label
 * comes from `@grinbox/shared`, which declares the offered set (d-kv9ipb56), so
 * the picker's copy does not depend on the route's response shape.
 *
 * The list is static per daemon build; cache it for the session.
 */

export const modelsKey = ['models'] as const

export function useModelOptions() {
  return useQuery({
    queryKey: modelsKey,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async (): Promise<readonly ModelOption[]> => {
      const res = await api.api.models.$get()
      if (!res.ok) {
        throw await toApiError(res)
      }
      const { models } = await res.json()
      return models.map((m) => ({
        id: m.id,
        label: modelLabel(m.id),
      }))
    },
  })
}

export type { ModelId, ModelOption }
