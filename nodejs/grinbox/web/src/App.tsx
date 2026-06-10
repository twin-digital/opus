import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { Toaster } from 'sonner'

import { queryClient } from './lib/query.js'
import { ThemeProvider } from './lib/theme.js'
import { router } from './router.js'

/**
 * App root: provider stack (Query + theme) wrapping the router. The router owns
 * the shell (sidebar + outlet). `<Toaster>` is mounted once here so any surface
 * can fire `sonner` toasts (ui-design.md "Toast notifications": bottom-right).
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
        <Toaster position='bottom-right' richColors closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  )
}
