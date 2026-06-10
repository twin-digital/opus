import type { DashboardResponse } from '@twin-digital/grinbox-server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Dashboard tests (jsdom + RTL, not e2e). The data layer is mocked at the hook
 * boundary (`@/lib/hooks`) and the router `Link` is stubbed so the page renders
 * synchronously without a RouterProvider — nothing touches the network. Global
 * `afterEach` cleanup lives in `src/test/setup.ts`.
 */

// --- Mocks ---------------------------------------------------------------

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => {
    const { to, params: _params, ...rest } = props as Record<string, unknown>
    return (
      <a href={typeof to === 'string' ? to : '#'} {...rest}>
        {children}
      </a>
    )
  },
}))

const useDashboard = vi.fn<() => unknown>()
vi.mock('../lib/hooks.js', () => ({
  useDashboard: () => useDashboard(),
}))

import { DashboardPage } from './dashboard.js'

// --- Fixtures ------------------------------------------------------------

// Freeze the wall clock so any relative-time rendering (recent-edit timestamps
// pass through `relativeTime`, which reads `Date.now()` with no injectable
// clock) is deterministic regardless of test timing.
const NOW_MS = 1_700_000_000_000
const NOW_SEC = Math.floor(NOW_MS / 1000)

const baseData: DashboardResponse = {
  first_run: {
    has_account: true,
    has_pipeline: true,
    has_assigned_pipeline: true,
  },
  triages_last_24h: 187,
  notifications_sent_today: 12,
  top_tags: [
    { key: 'urgency', value: 'high', count: 12 },
    { key: 'category', value: 'bills', count: 31 },
  ],
  errors_last_24h: 0,
  limit_hits_last_24h: 0,
  failed_triages_last_24h: 0,
  recent_operator_edits: [
    {
      change_log_id: 5,
      operator_id: 42,
      action: 'updated',
      actor_user_id: 1,
      recorded_at: NOW_SEC - 7200,
    },
  ],
}

function withData(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return { ...baseData, ...overrides }
}

function queryStub(data: DashboardResponse | undefined, overrides = {}) {
  return {
    data,
    isPending: data === undefined,
    isError: false,
    refetch: vi.fn(),
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// --- Tests ---------------------------------------------------------------

describe('DashboardPage', () => {
  it('shows a skeleton on first load', () => {
    useDashboard.mockReturnValue(queryStub(undefined))
    const { container } = renderPage()
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('renders the card numbers from the dashboard response', () => {
    useDashboard.mockReturnValue(queryStub(withData()))
    renderPage()

    // Each metric's number sits in the same card as its label; scope the
    // lookup to that card so the value isn't confused with a tag count.
    const triages = screen.getByText('Triages last 24h').closest('div')
    expect(triages).not.toBeNull()
    expect(within(triages as HTMLElement).getByText('187')).toBeInTheDocument()

    const notifications = screen.getByText('Notifications sent today').closest('div')
    expect(notifications).not.toBeNull()
    expect(within(notifications as HTMLElement).getByText('12')).toBeInTheDocument()
  })

  it('renders the top tags with their counts', () => {
    useDashboard.mockReturnValue(queryStub(withData()))
    renderPage()

    expect(screen.getByText('high')).toBeInTheDocument()
    expect(screen.getByText('bills')).toBeInTheDocument()
    // Counts render next to the chips.
    expect(screen.getByText('31')).toBeInTheDocument()
  })

  describe('first-run checklist', () => {
    it('renders incomplete items with links when setup is unfinished', () => {
      useDashboard.mockReturnValue(
        queryStub(
          withData({
            first_run: {
              has_account: true,
              has_pipeline: false,
              has_assigned_pipeline: false,
            },
          }),
        ),
      )
      renderPage()

      expect(screen.getByText('Finish setup')).toBeInTheDocument()
      expect(screen.getByText('Create a Pipeline')).toBeInTheDocument()
      // The completed item shows "Done"; the incomplete ones show "Go".
      expect(screen.getByText('Done')).toBeInTheDocument()
      expect(screen.getAllByText('Go').length).toBe(2)

      // The Pipeline step links to the Pipelines surface.
      const pipelineLink = screen.getByText('Create a Pipeline').closest('li')?.querySelector('a')
      expect(pipelineLink).toHaveAttribute('href', '/pipelines')
    })

    it('is hidden once all three steps are complete', () => {
      useDashboard.mockReturnValue(queryStub(withData()))
      renderPage()
      expect(screen.queryByText('Finish setup')).not.toBeInTheDocument()
    })
  })

  describe('alerts card', () => {
    it('is absent when all alert counts are zero', () => {
      useDashboard.mockReturnValue(queryStub(withData()))
      renderPage()
      expect(screen.queryByText('Alerts')).not.toBeInTheDocument()
    })

    it('appears when any alert count is non-zero and links to Activity Log', () => {
      useDashboard.mockReturnValue(queryStub(withData({ errors_last_24h: 2, limit_hits_last_24h: 1 })))
      renderPage()

      expect(screen.getByText('Alerts')).toBeInTheDocument()
      // Total across error + limit-hit counts.
      expect(screen.getByText('3')).toBeInTheDocument()
      const summary = screen.getByText(/2 errors · 1 limit hit/)
      expect(summary.closest('a')).toHaveAttribute('href', '/activity')
    })
  })

  it('renders an error state with retry when the query fails', () => {
    useDashboard.mockReturnValue(queryStub(undefined, { isPending: false, isError: true }))
    renderPage()
    expect(screen.getByText("Couldn't load the Dashboard")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument()
  })
})
