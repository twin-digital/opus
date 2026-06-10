import type { ActivityEntry } from '@twin-digital/grinbox-server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Activity Log tests (jsdom + RTL, not e2e). The data layer is mocked at the
 * hook boundary (`@/lib/activity`); the router primitives (`Link`, `useSearch`,
 * `useNavigate`) are stubbed so the page renders synchronously without a
 * RouterProvider — nothing touches the network. `useSearch` returns a mutable
 * `currentSearch` object so filter wiring is observable; the `useActivity` mock
 * asserts the filters it's called with.
 */

// --- Router stubs --------------------------------------------------------

let currentSearch: Record<string, unknown> = {}
const navigate = vi.fn((opts: { search?: (prev: Record<string, unknown>) => Record<string, unknown> }) => {
  if (typeof opts.search === 'function') {
    currentSearch = opts.search(currentSearch)
  }
})

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => {
    const { to: _to, params, ...rest } = props as Record<string, unknown>
    return (
      <a data-message-id={(params as { messageId?: string } | undefined)?.messageId} {...rest}>
        {children}
      </a>
    )
  },
  useSearch: () => currentSearch,
  useNavigate: () => navigate,
}))

// --- Select stub ---------------------------------------------------------
// Radix Select doesn't drive open/select reliably under jsdom; swap it for a
// native <select> so the severity filter's onValueChange wiring is testable
// deterministically without portals or pointer-event quirks. The trigger's
// aria-label is lifted onto the native <select> so it stays queryable.
vi.mock('../../components/ui/select.js', () => {
  function findTriggerLabel(node: ReactNode): string | undefined {
    let label: string | undefined
    const visit = (n: ReactNode) => {
      if (!n || typeof n !== 'object') {
        return
      }
      if (Array.isArray(n)) {
        for (const c of n) {
          visit(c)
        }
        return
      }
      const el = n as {
        props?: { 'aria-label'?: string; children?: ReactNode }
      }
      if (el.props?.['aria-label']) {
        label = el.props['aria-label']
      }
      if (el.props?.children) {
        visit(el.props.children)
      }
    }
    visit(node)
    return label
  }
  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value: string
      onValueChange: (v: string) => void
      children: ReactNode
    }) => (
      <select
        aria-label={findTriggerLabel(children)}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value)
        }}
      >
        {children}
      </select>
    ),
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  }
})

// --- Hook mock -----------------------------------------------------------

const useActivity = vi.fn<(filters: unknown) => unknown>()
vi.mock('../../lib/activity.js', async () => {
  const actual = await vi.importActual<typeof import('../../lib/activity.js')>('../../lib/activity.js')
  return { ...actual, useActivity: (filters: unknown) => useActivity(filters) }
})

import { ActivityPage } from './list.js'

// --- Fixtures ------------------------------------------------------------

// Freeze the wall clock so the relative-time strings the component renders
// (via `relativeTime(recorded_at)`, which reads `Date.now()` with no injectable
// clock) are deterministic regardless of how long the test takes to run.
const NOW_MS = 1_700_000_000_000
const now = Math.floor(NOW_MS / 1000)

const limitHit: ActivityEntry = {
  source: 'triage_event',
  severity: 'warning',
  event_type: 'resource_op_limited',
  resource: 'pushover_api',
  operation: 'send_notification',
  triage_id: 100,
  operator_id: 10,
  message_id: 42,
  recorded_at: now - 120,
  detail: 'limit scope: per_window',
}

const failure: ActivityEntry = {
  source: 'operator_run',
  severity: 'error',
  event_type: 'operator_run_failed',
  resource: null,
  operation: null,
  triage_id: 101,
  operator_id: 11,
  message_id: 43,
  recorded_at: now - 3600,
  detail: 'rule parse error at line 4',
}

function feedStub(events: ActivityEntry[]) {
  return {
    data: { events, page: { limit: 50, offset: 0 } },
    isPending: false,
    isError: false,
    error: null,
    isPlaceholderData: false,
  }
}

function renderPage(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  // Stub only Date.now (not the whole timer system) so the component's
  // relative-time rendering is deterministic while RTL's async waitFor keeps
  // using real timers.
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS)
  currentSearch = {}
})

afterEach(() => {
  vi.restoreAllMocks()
})

// --- Tests ---------------------------------------------------------------

describe('ActivityPage', () => {
  it('renders a limit-hit and a failure with severity, resource, time, and message link', () => {
    useActivity.mockReturnValue(feedStub([limitHit, failure]))
    renderPage(<ActivityPage />)

    // Limit hit: severity label + human description + resource.op.
    expect(screen.getByText('Limit hit')).toBeInTheDocument()
    expect(screen.getByText(/send_notification limited/)).toBeInTheDocument()
    // Resource + operation column (rendered as `resource` + `.operation`).
    expect(
      screen.getByText(
        (_, el) => el?.textContent === 'pushover_api.send_notification' && el.className.includes('font-mono'),
      ),
    ).toBeInTheDocument()

    // Failure: severity label + error detail.
    expect(screen.getByText('Error')).toBeInTheDocument()
    expect(screen.getByText(/Operator run failed — rule parse error at line 4/)).toBeInTheDocument()

    // Relative time (most-recent first; both events carry a time).
    expect(screen.getByText('2m ago')).toBeInTheDocument()

    // Message links carry the originating message id.
    const links = screen.getAllByText('View Message')
    expect(links).toHaveLength(2)
    expect(links[0]?.closest('a')).toHaveAttribute('data-message-id', '42')
  })

  it('wires the severity filter into the query params and into useActivity', async () => {
    useActivity.mockReturnValue(feedStub([failure]))
    renderPage(<ActivityPage />)

    fireEvent.change(screen.getByLabelText('Severity'), {
      target: { value: 'error' },
    })

    await waitFor(() => {
      expect(navigate).toHaveBeenCalled()
    })
    expect(currentSearch.severity).toBe('error')
  })

  it('passes the active severity + resource filters into useActivity', () => {
    currentSearch = { severity: 'error', resource: 'pushover_api', page: 2 }
    useActivity.mockReturnValue(feedStub([failure]))
    renderPage(<ActivityPage />)

    const filters = useActivity.mock.calls[0]?.[0]
    expect(filters).toMatchObject({
      severity: 'error',
      resource: 'pushover_api',
      limit: 50,
      offset: 50, // page 2
    })
  })

  it('wires the resource filter into the query params', async () => {
    useActivity.mockReturnValue(feedStub([limitHit]))
    renderPage(<ActivityPage />)

    const input = screen.getByLabelText('Resource')
    fireEvent.change(input, { target: { value: 'pushover_api' } })
    fireEvent.blur(input)

    await waitFor(() => {
      expect(navigate).toHaveBeenCalled()
    })
    expect(currentSearch.resource).toBe('pushover_api')
  })

  it('honors an incoming Dashboard filter (severity in the URL)', () => {
    currentSearch = { severity: 'error' }
    useActivity.mockReturnValue(feedStub([failure]))
    renderPage(<ActivityPage />)

    // The Clear-filters affordance appears, proving the URL filter is reflected.
    expect(screen.getByText('Clear filters')).toBeInTheDocument()
    const filters = useActivity.mock.calls[0]?.[0]
    expect(filters).toMatchObject({ severity: 'error' })
  })

  it('renders the empty state when there are no events', () => {
    useActivity.mockReturnValue(feedStub([]))
    renderPage(<ActivityPage />)
    expect(screen.getByText('No operational events')).toBeInTheDocument()
  })

  it('shows a skeleton on first load', () => {
    useActivity.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
      isPlaceholderData: false,
    })
    const { container } = renderPage(<ActivityPage />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})
