import type { CredentialSummary } from '@twin-digital/grinbox-server'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './api.js'
import { toApiError } from './api-error.js'

/**
 * Query + mutation hooks for the Notification credentials settings subsection
 * (non-secret metadata list, add Pushover, delete). The list never carries any
 * secret material — the server returns metadata only (`credentials.ts`). The
 * delete mutation surfaces the `409 credential_in_use` body (with the dependent
 * Operator ids in `details`) via {@link toApiError} so the page can refuse
 * gracefully and name the blocking Operators.
 */

export const credentialsKey = ['credentials'] as const

export function useCredentials(kind?: string) {
  return useQuery({
    queryKey: [...credentialsKey, kind ?? null] as const,
    queryFn: async (): Promise<CredentialSummary[]> => {
      const res = await api.api.credentials.$get({
        query: kind ? { kind } : {},
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      const { credentials } = await res.json()
      return credentials
    },
  })
}

export interface AddPushoverInput {
  app_token: string
  user_key: string
}

export function useAddPushoverCredential() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: AddPushoverInput) => {
      const res = await api.api.credentials.$post({
        json: { kind: 'pushover', ...input },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: credentialsKey })
    },
  })
}

export function useDeleteCredential() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.api.credentials[':id'].$delete({
        param: { id: String(id) },
      })
      if (!res.ok) {
        throw await toApiError(res)
      }
      return res.json()
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: credentialsKey })
    },
  })
}

/** The dependent Operator ids carried by a `credential_in_use` 409 `details`. */
export function operatorIdsFromInUse(details: unknown): number[] {
  if (
    details !== null &&
    typeof details === 'object' &&
    'operator_ids' in details &&
    Array.isArray(details.operator_ids)
  ) {
    return (details as { operator_ids: unknown[] }).operator_ids.filter((v): v is number => typeof v === 'number')
  }
  return []
}
