import { QueryClient } from '@tanstack/react-query'

/**
 * App-wide TanStack Query client. Defaults keep refetches quiet (ui-design.md:
 * "refetches are silent") and avoid hammering the lab-internal daemon.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
