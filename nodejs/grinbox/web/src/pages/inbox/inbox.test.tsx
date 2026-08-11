import type { MessageRow } from '@grinbox/server'
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

const useMessages = vi.fn()
const useMessage = vi.fn()
const useReplayMessage = vi.fn()
const syncMutate = vi.fn()

vi.mock('@/lib/messages', async () => {
  const actual = await vi.importActual<typeof import('@/lib/messages')>('@/lib/messages')
  return {
    ...actual,
    useMessages: (filters: unknown) => useMessages(filters),
    useMessage: (id: number) => useMessage(id),
    useReplayMessage: (id: number) => useReplayMessage(id),
    useSyncNow: () => ({ mutate: syncMutate, isPending: false }),
  }
})

const useAccounts = vi.fn()
vi.mock('@/lib/accounts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/accounts')>('@/lib/accounts')
  return { ...actual, useAccounts: () => useAccounts() }
})

const usePipelineList = vi.fn()
vi.mock('@/lib/pipelines', async () => {
  const actual = await vi.importActual<typeof import('@/lib/pipelines')>('@/lib/pipelines')
  return { ...actual, usePipelineList: () => usePipelineList() }
})

// The per-Pipeline money-key lookup is mocked (it queries pipeline details);
// the display rendering itself stays real, so the money assertions below
// exercise `@grinbox/shared`'s formatMoneyDisplay through `displayTagValue`.
const useMoneyKeysByPipeline = vi.fn()
vi.mock('@/lib/money', async () => {
  const actual = await vi.importActual<typeof import('@/lib/money')>('@/lib/money')
  return {
    ...actual,
    useMoneyKeysByPipeline: (ids: readonly number[]) => useMoneyKeysByPipeline(ids),
  }
})

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import { MessageDetailPage } from './detail'
import { InboxPage } from './list'

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
  useMoneyKeysByPipeline.mockReturnValue(new Map())
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

  // d-u4gpx6ke / d-m6ingqyv: a chip under a key the Pipeline types as extracted
  // money renders in display form; a non-money stored value under the same key
  // renders verbatim, as does a money-shaped value under any other key.
  it('renders money-typed tag chips in display form and everything else verbatim', () => {
    useMoneyKeysByPipeline.mockReturnValue(new Map([[1, new Set(['amount'])]]))
    useMessages.mockReturnValue(
      listStub([
        {
          ...plainMessage,
          current_tags: [
            tag('amount', '19503:USD', 1),
            tag('note', '19503:USD', 1), // not money-typed → verbatim
          ],
        },
        {
          ...plainMessage,
          id: 44,
          current_tags: [tag('amount', 'about twelve dollars', 1)], // not money → verbatim
        },
      ]),
    )
    renderPage(<InboxPage />)

    expect(screen.getByText('$195.03')).toBeInTheDocument()
    expect(screen.getByText('19503:USD')).toBeInTheDocument()
    expect(screen.getByText('about twelve dollars')).toBeInTheDocument()
  })

  // d-oc073wsp cases: an unknown-symbol currency renders its ISO code before
  // the amount, through the same shared formatter the digest uses.
  it('renders an unknown-symbol currency as ISO code before the amount', () => {
    useMoneyKeysByPipeline.mockReturnValue(new Map([[1, new Set(['amount'])]]))
    useMessages.mockReturnValue(listStub([{ ...plainMessage, current_tags: [tag('amount', '123456:CHF', 1)] }]))
    renderPage(<InboxPage />)

    expect(screen.getByText('CHF 1,234.56')).toBeInTheDocument()
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
          // The configuration this run executed against, captured at enqueue.
          // Deliberately not what the operator says today — see the snapshot test.
          op_config_json: JSON.stringify({
            output_tag_key: 'urgency',
            rules: [{ match: 'subject ~ "report"', output: 'high' }],
          }),
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

  // r-k6gh82fx / d-nr71oscu: a historical outcome resolves to the configuration
  // that produced it. The run carries the snapshot taken at enqueue, so what is
  // shown here does not move when the operator is edited afterwards.
  it('shows the configuration snapshot each run executed against', () => {
    renderPage(<MessageDetailPage />)
    selectTab('Triage history')

    const snapshot = screen.getByTestId('run-config-snapshot')
    expect(snapshot).toBeInTheDocument()
    // The rule the run actually evaluated, read back out of the stored snapshot.
    expect(snapshot.textContent).toContain('subject ~ \\"report\\"')
    expect(snapshot.textContent).toContain('urgency')
  })

  it('renders a run with no snapshot without inventing one', () => {
    // A run predating the snapshot's arrival on the wire shows no panel rather
    // than falling back to the operator's current configuration.
    useMessage.mockReturnValue(
      queryStub({
        ...detailFixture,
        triages: detailFixture.triages.map((t) => ({
          ...t,
          operator_runs: t.operator_runs.map((r) => ({
            ...r,
            op_config_json: null,
          })),
        })),
      }),
    )
    renderPage(<MessageDetailPage />)
    selectTab('Triage history')

    expect(screen.queryByTestId('run-config-snapshot')).not.toBeInTheDocument()
  })

  // r-etj0gluz: naming a mail backend is confined to the account a message
  // arrived on, so the message record carries no provider deep link. The naive
  // version — a hardcoded Gmail web URL — is what this guards against coming
  // back; a neutral one built from the provider seam is backlogged (b-rh4kku7d).
  it('offers no mail-backend deep link on the message record', () => {
    renderPage(<MessageDetailPage />)

    expect(screen.queryByText(/Open in Gmail/i)).not.toBeInTheDocument()
    const links = screen.queryAllByRole('link')
    for (const link of links) {
      expect(link.getAttribute('href') ?? '').not.toMatch(/mail\.google\.com/)
    }
  })

  // d-u4gpx6ke: the detail page shows money in display form wherever a Tag's
  // value appears — Overview chips, the Tags tab, and tag_set event values.
  it('renders money-typed tag values in display form across the detail surfaces', () => {
    useMoneyKeysByPipeline.mockReturnValue(new Map([[7, new Set(['amount'])]]))
    useMessage.mockReturnValue(
      queryStub({
        ...detailFixture,
        current_tags: [{ key: 'amount', value: '19503:USD', triage_id: 200, operator_id: 10, pipeline_id: 7 }],
        triages: [
          {
            ...detailFixture.triages[0],
            events: [
              {
                operator_id: 10,
                sequence_num: 1,
                event_type: 'tag_set',
                details_json: JSON.stringify({ key: 'amount', value: '19503:USD' }),
                recorded_at: now - 59,
              },
            ],
            tags: [{ operator_id: 10, key: 'amount', value: '19503:USD' }],
          },
        ],
      }),
    )
    renderPage(<MessageDetailPage />)

    // Overview chip (default tab).
    expect(screen.getByText('$195.03')).toBeInTheDocument()

    // Tags tab chip.
    selectTab('Tags')
    expect(screen.getByText('$195.03')).toBeInTheDocument()

    // tag_set event value in the Triage history event log.
    selectTab('Triage history')
    expect(screen.getByText(/value=\$195\.03/)).toBeInTheDocument()
  })
})

// --- Suppression rendering (d-5amonj40 / d-e9jslw4x) -----------------------

/** A Triage whose notify run was cooldown-suppressed: it completed, sent nothing. */
function suppressedTriage(deferredToTriageId: number) {
  return {
    id: 201,
    pipeline_id: 7,
    triggered_by: 'poll',
    actor_user_id: null,
    started_at: now - 30,
    ended_at: now - 29,
    status: 'completed',
    error_summary: null,
    operator_runs: [
      {
        operator_id: 11,
        type_key: 'notify',
        type_code_version: '1.0.0',
        status: 'completed',
        started_at: now - 30,
        finished_at: now - 29,
        duration_ms: 40,
        skip_reason: null,
        error_summary: null,
        resource_usage_json: null,
        op_config_json: null,
      },
    ],
    events: [
      {
        operator_id: 11,
        sequence_num: 1,
        event_type: 'resource_op_suppressed',
        details_json: JSON.stringify({
          kind: 'Bank alerts',
          deferred_to_triage_id: deferredToTriageId,
          deferred_to_operator_id: 11,
        }),
        recorded_at: now - 29,
      },
    ],
    tags: [],
  }
}

describe('MessageDetailPage · suppressed push', () => {
  beforeEach(() => {
    useReplayMessage.mockReturnValue({ mutate: vi.fn(), isPending: false })
  })

  // d-5amonj40: a suppressed push is an outcome, not a failure — the run and
  // its triage render as completed, and the suppression shows on the run with
  // its kind.
  it('renders a suppressed run as completed, with the suppression and its kind', () => {
    useMessage.mockReturnValue(
      queryStub({
        ...detailFixture,
        triages: [suppressedTriage(199), ...detailFixture.triages],
      }),
    )
    renderPage(<MessageDetailPage />)
    selectTab('Triage history')

    // Latest triage (the suppressed one) selected by default. The run reads
    // Completed — nothing renders as failed.
    const runStatuses = screen.getAllByText('Completed')
    expect(runStatuses.length).toBeGreaterThan(0)
    expect(screen.queryByText('Failed')).not.toBeInTheDocument()

    // The suppression is visible on the run itself, naming the kind…
    const note = screen.getByTestId('run-suppression')
    expect(note).toHaveTextContent('push suppressed')
    expect(note).toHaveTextContent('Bank alerts')

    // …and in the event log as its own outcome kind.
    expect(screen.getByText('Push suppressed')).toBeInTheDocument()
  })

  // d-e9jslw4x: the record carries the run it deferred to; when that run's
  // Triage is in this Message's own history, the reference resolves in place.
  it('links a deferral to one of this message’s own triages', () => {
    useMessage.mockReturnValue(
      queryStub({
        ...detailFixture,
        triages: [suppressedTriage(199), ...detailFixture.triages],
      }),
    )
    renderPage(<MessageDetailPage />)
    selectTab('Triage history')

    const details = screen.getByTestId('suppression-details')
    expect(details).toHaveTextContent('Bank alerts')

    // The deferred-to reference is a control that selects Triage 199.
    fireEvent.click(screen.getByRole('button', { name: 'Triage 199' }))
    expect(screen.getByText('Resource op limited')).toBeInTheDocument()
  })

  it('names a deferral to another message’s triage without a dead link', () => {
    useMessage.mockReturnValue(
      queryStub({
        ...detailFixture,
        triages: [suppressedTriage(4242), ...detailFixture.triages],
      }),
    )
    renderPage(<MessageDetailPage />)
    selectTab('Triage history')

    const details = screen.getByTestId('suppression-details')
    expect(details).toHaveTextContent('Triage 4242')
    expect(screen.queryByRole('button', { name: 'Triage 4242' })).not.toBeInTheDocument()
  })
})
