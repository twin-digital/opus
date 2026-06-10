import type { MessageRow } from '@twin-digital/grinbox-server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Inbox + Message detail tests (jsdom + RTL, not e2e). The data layer is mocked
 * at the hook boundary (`@/lib/messages`, `@/lib/accounts`, `@/lib/pipelines`);
 * the router primitives (`Link`, `useParams`, `useSearch`, `useNavigate`) are
 * stubbed so the pages render synchronously without a RouterProvider — nothing
 * touches the network and there's no async route resolution to race. `useSearch`
 * returns a mutable `currentSearch` object so filter wiring is observable; the
 * `useMessages` mock asserts the filters it's called with.
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
    const { to: _to, params: _params, ...rest } = props as Record<string, unknown>
    return <a {...rest}>{children}</a>
  },
  useParams: () => ({ messageId: '42' }),
  useSearch: () => currentSearch,
  useNavigate: () => navigate,
}))

// --- Hook mocks ----------------------------------------------------------

const useMessages = vi.fn<(filters: unknown) => unknown>()
const useMessage = vi.fn<(id: number) => unknown>()
const useReplayMessage = vi.fn<(id: number) => unknown>()
const syncMutate = vi.fn()

vi.mock('../../lib/messages.js', async () => {
  const actual = await vi.importActual<typeof import('../../lib/messages.js')>('../../lib/messages.js')
  return {
    ...actual,
    useMessages: (filters: unknown) => useMessages(filters),
    useMessage: (id: number) => useMessage(id),
    useReplayMessage: (id: number) => useReplayMessage(id),
    useSyncNow: () => ({ mutate: syncMutate, isPending: false }),
  }
})

const useAccounts = vi.fn<() => unknown>()
vi.mock('../../lib/accounts.js', async () => {
  const actual = await vi.importActual<typeof import('../../lib/accounts.js')>('../../lib/accounts.js')
  return { ...actual, useAccounts: () => useAccounts() }
})

const usePipelineList = vi.fn<() => unknown>()
vi.mock('../../lib/pipelines.js', async () => {
  const actual = await vi.importActual<typeof import('../../lib/pipelines.js')>('../../lib/pipelines.js')
  return { ...actual, usePipelineList: () => usePipelineList() }
})

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import { MessageDetailPage } from './detail.js'
import { InboxPage } from './list.js'

// --- Fixtures ------------------------------------------------------------

// Freeze the wall clock so the relative-time strings the component renders
// (via `relativeTime(received_at)`, which reads `Date.now()` with no injectable
// clock) are deterministic regardless of how long the test takes to run.
const NOW_MS = 1_700_000_000_000
const now = Math.floor(NOW_MS / 1000)

const taggedMessage: MessageRow = {
  id: 42,
  account_id: 1,
  from_header: 'Alice Example <alice@example.com>',
  subject: 'Quarterly report',
  snippet: 'Please review the attached numbers before Friday.',
  received_at: now - 120,
  source_state: 'present',
  latest_triage_status: 'completed',
  // Five tags so the row shows 3 chips + a "+2" overflow.
  current_tags: [
    tag('urgency', 'high', 1),
    tag('domain', 'work', 1),
    tag('action', 'review', 1),
    tag('sender', 'alice', 1),
    tag('thread', 'q3', 1),
  ],
}

const plainMessage: MessageRow = {
  id: 43,
  account_id: 1,
  from_header: 'bob@example.com',
  subject: 'Lunch?',
  snippet: 'Are you free?',
  received_at: now - 3600,
  source_state: 'present',
  latest_triage_status: 'partial',
  current_tags: [],
}

function tag(key: string, value: string, pipelineId: number) {
  return {
    key,
    value,
    triage_id: 100,
    operator_id: 10,
    pipeline_id: pipelineId,
  }
}

function listStub(messages: MessageRow[], total = messages.length) {
  return {
    data: { messages, page: { limit: 25, offset: 0, total } },
    isPending: false,
    isError: false,
    error: null,
    isPlaceholderData: false,
    isFetching: false,
    refetch: vi.fn(),
  }
}

function queryStub<T>(data: T) {
  return { data, isPending: false, isError: false, error: null }
}

/**
 * Activate a Radix Tabs trigger. Under jsdom the trigger selects on
 * pointer-down (not the synthetic `click`), so fire that explicitly.
 */
function selectTab(name: string) {
  const tab = screen.getByRole('tab', { name })
  // Radix Tabs triggers select on mouse-down (button 0, no ctrl), not click.
  fireEvent.mouseDown(tab, { button: 0 })
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
  useAccounts.mockReturnValue(queryStub([{ id: 1, name: 'sean@example.com' }]))
  usePipelineList.mockReturnValue(queryStub([{ id: 7, name: 'Personal mail' }]))
})

afterEach(() => {
  vi.restoreAllMocks()
})

// --- Inbox tests ---------------------------------------------------------

describe('InboxPage', () => {
  it('renders a row per message with all tag chips (wrapping), status, and time', () => {
    useMessages.mockReturnValue(listStub([taggedMessage, plainMessage]))
    renderPage(<InboxPage />)

    // Sender display name extracted from the From header.
    expect(screen.getByText('Alice Example')).toBeInTheDocument()
    expect(screen.getByText('Quarterly report')).toBeInTheDocument()

    // Tags now wrap onto their own row — all five render, no `+N` overflow.
    expect(screen.queryByText('+2')).not.toBeInTheDocument()
    const chips = screen.getAllByText((_, el) => el?.getAttribute('data-tag-key') !== null)
    expect(chips).toHaveLength(5)

    // Latest Triage status indicators.
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Partial')).toBeInTheDocument()

    // Relative time.
    expect(screen.getByText('2m ago')).toBeInTheDocument()
  })

  it('badges a non-present message with its backend disposition', () => {
    useMessages.mockReturnValue(listStub([{ ...plainMessage, source_state: 'archived' }]))
    renderPage(<InboxPage />)
    expect(screen.getByText('Archived')).toBeInTheDocument()
  })

  it('triggers a Gmail sync when the refresh button is clicked', () => {
    syncMutate.mockClear()
    useMessages.mockReturnValue(listStub([taggedMessage]))
    renderPage(<InboxPage />)

    fireEvent.click(screen.getByLabelText('Sync with Gmail'))
    expect(syncMutate).toHaveBeenCalledTimes(1)
  })

  it('wires the search box into the q query param', async () => {
    useMessages.mockReturnValue(listStub([taggedMessage]))
    renderPage(<InboxPage />)

    const input = screen.getByLabelText('Search messages')
    fireEvent.change(input, { target: { value: 'invoice' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => {
      expect(navigate).toHaveBeenCalled()
    })
    expect(currentSearch.q).toBe('invoice')
  })

  it('passes the active filters into useMessages', () => {
    currentSearch = { status: 'failed', accountId: 1, page: 2 }
    useMessages.mockReturnValue(listStub([taggedMessage]))
    renderPage(<InboxPage />)

    const filters = useMessages.mock.calls[0]?.[0]
    expect(filters).toMatchObject({
      status: 'failed',
      accountId: 1,
      limit: 25,
      offset: 25, // page 2
    })
  })

  it('renders the first-run empty state when there are no messages', () => {
    useMessages.mockReturnValue(listStub([]))
    renderPage(<InboxPage />)
    expect(screen.getByText('No messages yet')).toBeInTheDocument()
  })

  it('renders the no-match empty state when filters are active', () => {
    currentSearch = { q: 'nothing' }
    useMessages.mockReturnValue(listStub([]))
    renderPage(<InboxPage />)
    expect(screen.getByText('No matching messages')).toBeInTheDocument()
  })

  it('shows a skeleton on first load', () => {
    useMessages.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
      isPlaceholderData: false,
    })
    const { container } = renderPage(<InboxPage />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})

// --- Message detail tests ------------------------------------------------

const detailFixture = {
  message: {
    id: 42,
    account_id: 1,
    backend_message_id: 'm',
    backend_thread_id: null,
    from_header: 'Alice Example <alice@example.com>',
    to_header: 'me@example.com',
    subject: 'Quarterly report',
    snippet: 'Please review',
    body_text: 'Body',
    body_html: null,
    received_at: now - 120,
    created_at: now - 120,
    body_fetched_at: now - 100,
    source_state: 'present',
  },
  current_tags: [
    {
      key: 'urgency',
      value: 'high',
      triage_id: 200,
      operator_id: 10,
      pipeline_id: 7,
    },
  ],
  triages: [
    {
      id: 200,
      pipeline_id: 7,
      triggered_by: 'user_replay',
      actor_user_id: 1,
      started_at: now - 60,
      ended_at: now - 59,
      status: 'completed',
      error_summary: null,
      operator_runs: [
        {
          operator_id: 10,
          type_key: 'rule_based_tagger',
          type_code_version: '1.0.0',
          status: 'completed',
          started_at: now - 60,
          finished_at: now - 59,
          duration_ms: 1200,
          skip_reason: null,
          error_summary: null,
          resource_usage_json: JSON.stringify({ tokens: 42 }),
        },
      ],
      events: [
        {
          operator_id: 10,
          sequence_num: 1,
          event_type: 'tag_set',
          details_json: JSON.stringify({ key: 'urgency', value: 'high' }),
          recorded_at: now - 59,
        },
      ],
      tags: [{ operator_id: 10, key: 'urgency', value: 'high' }],
    },
    {
      id: 199,
      pipeline_id: 7,
      triggered_by: 'poll',
      actor_user_id: null,
      started_at: now - 600,
      ended_at: now - 599,
      status: 'completed',
      error_summary: null,
      operator_runs: [
        {
          operator_id: 10,
          type_key: 'rule_based_tagger',
          type_code_version: '1.0.0',
          status: 'completed',
          started_at: now - 600,
          finished_at: now - 599,
          duration_ms: 800,
          skip_reason: null,
          error_summary: null,
          resource_usage_json: null,
        },
      ],
      events: [
        {
          operator_id: 10,
          sequence_num: 1,
          event_type: 'resource_op_limited',
          details_json: JSON.stringify({ resource: 'pushover_api' }),
          recorded_at: now - 599,
        },
      ],
      tags: [{ operator_id: 10, key: 'urgency', value: 'low' }],
    },
  ],
}

describe('MessageDetailPage', () => {
  beforeEach(() => {
    useMessage.mockReturnValue(queryStub(detailFixture))
    useReplayMessage.mockReturnValue({ mutate: vi.fn(), isPending: false })
  })

  it('renders the header and the three tabs', () => {
    renderPage(<MessageDetailPage />)
    expect(screen.getByRole('heading', { name: 'Quarterly report' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Tags' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Triage history' })).toBeInTheDocument()
  })

  it('shows current tags grouped by provenance on Overview', () => {
    renderPage(<MessageDetailPage />)
    // Overview is the default tab. The provenance line names the Triage + Operator.
    expect(screen.getByText(/Triage 200 · rule_based_tagger @ 1.0.0/)).toBeInTheDocument()
  })

  it('selects the latest Triage by default and expands its runs + event log', () => {
    renderPage(<MessageDetailPage />)
    selectTab('Triage history')

    // Latest triage (200) selected by default → its run + event are shown.
    expect(screen.getByText('Operator runs (1)')).toBeInTheDocument()
    expect(screen.getByText('Event log (1)')).toBeInTheDocument()
    expect(screen.getByText('Tag set')).toBeInTheDocument()
    // resource usage from the run JSON.
    expect(screen.getByText('tokens: 42')).toBeInTheDocument()

    // Selecting the older Triage swaps the event panel.
    fireEvent.click(screen.getByRole('button', { name: /Triage 199/ }))
    expect(screen.getByText('Resource op limited')).toBeInTheDocument()
  })

  it('fires the replay mutation from Overview', () => {
    const mutate = vi.fn()
    useReplayMessage.mockReturnValue({ mutate, isPending: false })
    renderPage(<MessageDetailPage />)

    fireEvent.click(screen.getByRole('button', { name: /Replay/ }))
    expect(mutate).toHaveBeenCalledTimes(1)
  })
})
