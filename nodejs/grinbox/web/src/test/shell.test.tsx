import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { NAV_ITEMS } from '../lib/nav.js'
import { ThemeProvider } from '../lib/theme.js'
import { routeTree } from '../router.js'

/**
 * Shell smoke test (jsdom + RTL, not e2e). Renders the app shell on a memory
 * history and asserts the seven sidebar areas and the theme toggle are present.
 * A throwaway QueryClient with retries off keeps the un-mocked dashboard fetch
 * from holding the test open.
 */
function renderShell() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

describe('app shell', () => {
  it('renders the seven sidebar areas', async () => {
    renderShell()
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    })
    expect(NAV_ITEMS).toHaveLength(7)
    // Assert the seven labels *literally* (not iterating NAV_ITEMS as its own
    // oracle) so a dropped/renamed area is caught against the spec's sitemap.
    // Scope to the sidebar — area names like "Dashboard" also appear as the
    // page heading, so a document-wide query would be ambiguous.
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    for (const label of ['Dashboard', 'Inbox', 'Pipelines', 'Accounts', 'Activity Log', 'Settings', 'Metrics']) {
      expect(within(nav).getByText(label)).toBeInTheDocument()
    }
  })

  it('renders the theme toggle', async () => {
    renderShell()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Toggle theme' })).toBeInTheDocument()
    })
  })
})
