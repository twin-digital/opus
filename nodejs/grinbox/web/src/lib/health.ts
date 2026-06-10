import { useQuery } from '@tanstack/react-query'

import { apiBase } from './api.js'

/**
 * Health query for the About settings subsection. `/healthz` lives on the root
 * app (not the `/api` router), so it isn't part of the typed `ApiRoutes` RPC
 * surface — a plain same-origin fetch against {@link apiBase} reads its
 * `{ status, version }` body (server `app.ts`).
 */

export interface Health {
  status: string
  version: string
}

export const healthKey = ['health'] as const

export function useHealth() {
  return useQuery({
    queryKey: healthKey,
    queryFn: async (): Promise<Health> => {
      const res = await fetch(`${apiBase}/healthz`)
      if (!res.ok) {
        throw new Error(`Health check failed (HTTP ${res.status}).`)
      }
      return (await res.json()) as Health
    },
  })
}
