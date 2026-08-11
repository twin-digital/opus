import type { CooldownSetting } from '@grinbox/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'

import { api } from './api'
import { toApiError } from './api-error'

/**
 * Query + mutation hooks for the Notification cooldowns settings subsection.
 * A cooldown is the user's per-kind minimum push interval (d-k3wq81vn), keyed
 * by the kind's name and shared across every Pipeline; it is the user's to
 * set, change, and remove at will (d-6ptxams7). `GET /api/cooldowns` also
 * returns `kinds_in_use` — the kind names the enabled Notify Operators
 * currently send — so the Add form can offer a kind before any setting exists.
 *
 * Structured refusals (`invalid_kind_name` 400, `cooldown_conflict` 409)
 * surface via {@link toApiError} for the page to toast.
 */

export const cooldownsKey = ['cooldowns'] as const

/** The `GET /api/cooldowns` payload, inferred from the typed client. */
export type CooldownsResponse = InferResponseType<typeof api.api.cooldowns.$get, 200>

/** One stored cooldown setting as the table renders it. */
export type CooldownRow = CooldownsResponse['cooldowns'][number]

export function useCooldowns() {
  return useQuery({
    queryKey: cooldownsKey,
    queryFn: async (): Promise<CooldownsResponse> => {
      const res = await api.api.cooldowns.$get()
      if (!res.ok) {
        throw await toApiError(res)
      }
      return await res.json()
    },
  })
}

export function useCreateCooldown() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CooldownSetting) => {
      const res = await api.api.cooldowns.$post({ json: input })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: cooldownsKey })
    },
  })
}

export interface EditCooldownInput {
  id: number
  /** The only editable field — the kind is fixed at create (d-7c6u5nfn). */
  interval_seconds: number
}

export function useEditCooldown() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, interval_seconds }: EditCooldownInput) => {
      const res = await api.api.cooldowns[':id'].$patch({
        param: { id: String(id) },
        json: { interval_seconds },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: cooldownsKey })
    },
  })
}

export function useDeleteCooldown() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.api.cooldowns[':id'].$delete({
        param: { id: String(id) },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: cooldownsKey })
    },
  })
}
