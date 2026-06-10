import type { DashboardResponse } from '@twin-digital/grinbox-server'
import { useQuery } from '@tanstack/react-query'

import { api } from './api.js'

/**
 * Example end-to-end typed call: fetch the Dashboard aggregate through the typed
 * RPC client, wrapped in TanStack Query. Proves the `hc<ApiRoutes>` type flows
 * from the server route to the component layer — `data` is `DashboardResponse`
 * with no hand-written cast. Pages stay otherwise empty at the shell stage; this
 * is the single wired call.
 */
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async (): Promise<DashboardResponse> => {
      const res = await api.api.dashboard.$get()
      if (!res.ok) {
        throw new Error(`Dashboard request failed: ${res.status}`)
      }
      return res.json()
    },
  })
}
