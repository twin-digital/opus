import type { AccountSummary } from '@twin-digital/grinbox-server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Accounts list + detail tests (jsdom + RTL, not e2e). The data layer is mocked
 * at the hook boundary (`@/lib/accounts`) and the OAuth pop-up flow at
 * `@/lib/oauth`; the router primitives (`Link`, `useParams`, `useNavigate`) are
 * stubbed so the page components render synchronously — nothing touches the
 * network and there's no async route resolution to race. A throwaway
 * QueryClient backs the mutation hooks that close over one.
 */

// --- Mocks ---------------------------------------------------------------

// Stub the router primitives the pages use so they render synchronously without
// a RouterProvider (the dynamic `$accountId` route otherwise resolves a tick
// after mount, a source of flakiness under the loaded combined run).
const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => {
    // Strip router-only props (`to`, `params`) so they don't hit the DOM.
    const { to: _to, params: _params, ...rest } = props as Record<string, unknown>
    return <a {...rest}>{children}</a>
  },
  useParams: () => ({ accountId: '1' }),
  useNavigate: () => navigate,
}))

const useAccounts = vi.fn<() => unknown>()
const useAccount = vi.fn<(id: number) => unknown>()
const usePipelines = vi.fn<() => unknown>()
const useUpdateAccount = vi.fn<(id: number) => unknown>()
const useDeleteAccount = vi.fn<(id: number) => unknown>()

vi.mock('../../lib/accounts.js', async () => {
  const actual = await vi.importActual<typeof import('../../lib/accounts.js')>('../../lib/accounts.js')
  return {
    ...actual,
    useAccounts: () => useAccounts(),
    useAccount: (id: number) => useAccount(id),
    usePipelines: () => usePipelines(),
    useUpdateAccount: (id: number) => useUpdateAccount(id),
    useDeleteAccount: (id: number) => useDeleteAccount(id),
  }
})

const runOAuthFlow = vi.fn<(...args: unknown[]) => unknown>()
vi.mock('../../lib/oauth.js', () => ({
  runOAuthFlow: (...args: unknown[]) => runOAuthFlow(...args),
  callbackOriginFromConsentUrl: () => null,
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import { AccountDetailPage } from './detail.js'
import { AccountsListPage } from './list.js'

// --- Fixtures ------------------------------------------------------------

// Freeze the wall clock so any relative-time rendering (the account list's
// last-poll column calls `relativeTime` with no injectable clock) is
// deterministic regardless of test timing.
const NOW_MS = 1_700_000_000_000
const NOW_SEC = Math.floor(NOW_MS / 1000)

const okAccount: AccountSummary = {
  id: 1,
  name: 'sean@example.com',
  icon: null,
  color: null,
  provider_type: 'gmail',
  active_pipeline_id: 7,
  active_pipeline_name: 'Personal mail v2',
  last_polled_at: NOW_SEC - 120,
  poll_interval_seconds: 120,
  status: 'ok',
}

const noPipelineAccount: AccountSummary = {
  id: 2,
  name: 'work@example.com',
  icon: null,
  color: null,
  provider_type: 'gmail',
  active_pipeline_id: null,
  active_pipeline_name: null,
  last_polled_at: NOW_SEC - 840,
  poll_interval_seconds: 300,
  status: 'no_pipeline',
}

const needsAuthAccount: AccountSummary = {
  id: 3,
  name: 'archive@example.com',
  icon: null,
  color: null,
  provider_type: 'gmail',
  active_pipeline_id: 9,
  active_pipeline_name: 'Archive flow',
  last_polled_at: null,
  poll_interval_seconds: 120,
  status: 'needs_auth',
}

function queryStub<T>(data: T | undefined, overrides = {}) {
  return {
    data,
    isPending: data === undefined,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  }
}

function mutationStub() {
  return { mutate: vi.fn(), isPending: false }
}

// --- Render helper -------------------------------------------------------

function renderPage(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(Date, 'now').mockReturnValue(NOW_MS)
  usePipelines.mockReturnValue(queryStub([{ id: 7, name: 'Personal mail v2' }]))
  useUpdateAccount.mockReturnValue(mutationStub())
  useDeleteAccount.mockReturnValue(mutationStub())
})

afterEach(() => {
  vi.restoreAllMocks()
})

// --- List tests ----------------------------------------------------------

describe('AccountsListPage', () => {
  it('renders a row per account with status indicators', () => {
    useAccounts.mockReturnValue(queryStub([okAccount, noPipelineAccount, needsAuthAccount]))
    renderPage(<AccountsListPage />)

    expect(screen.getByText('sean@example.com')).toBeInTheDocument()
    expect(screen.getByText('work@example.com')).toBeInTheDocument()
    expect(screen.getByText('archive@example.com')).toBeInTheDocument()

    // Status labels from the dot+label indicator.
    expect(screen.getByText('OK')).toBeInTheDocument()
    expect(screen.getByText('Needs re-auth')).toBeInTheDocument()
    // The no_pipeline row shows both the indicator label and the warning chip.
    expect(screen.getByText('No Pipeline assigned')).toBeInTheDocument()
    expect(screen.getByText('no Pipeline assigned')).toBeInTheDocument()
  })

  it('renders the active pipeline name for an ok account', () => {
    useAccounts.mockReturnValue(queryStub([okAccount]))
    renderPage(<AccountsListPage />)
    expect(screen.getAllByText('Personal mail v2').length).toBeGreaterThan(0)
  })

  it('renders the empty-state CTA when there are no accounts', () => {
    useAccounts.mockReturnValue(queryStub([]))
    renderPage(<AccountsListPage />)
    expect(screen.getByText('No mailboxes yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add Account/i })).toBeInTheDocument()
  })

  it('shows a skeleton on first load', () => {
    useAccounts.mockReturnValue(queryStub(undefined))
    const { container } = renderPage(<AccountsListPage />)
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })
})

// --- Detail tests --------------------------------------------------------

describe('AccountDetailPage', () => {
  it('renders the pipeline select, cadence input, and delete button', () => {
    useAccount.mockReturnValue(queryStub(okAccount))
    renderPage(<AccountDetailPage />)

    expect(screen.getByText('Active Pipeline')).toBeInTheDocument()
    // Active Pipeline picker (Radix Select trigger is a combobox).
    expect(screen.getByRole('combobox')).toBeInTheDocument()

    // Cadence input seeded from the account.
    const cadence = screen.getByLabelText<HTMLInputElement>(/Poll cadence/i)
    expect(cadence.value).toBe('120')

    expect(screen.getByRole('button', { name: 'Delete Account' })).toBeInTheDocument()
  })

  it('saves a renamed account with a chosen icon and color', () => {
    useAccount.mockReturnValue(queryStub(okAccount))
    const update = mutationStub()
    useUpdateAccount.mockReturnValue(update)
    renderPage(<AccountDetailPage />)

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Personal' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Icon briefcase' }))
    fireEvent.click(screen.getByRole('button', { name: 'Color sky' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(update.mutate).toHaveBeenCalledTimes(1)
    expect(update.mutate.mock.calls[0]?.[0]).toMatchObject({
      name: 'Personal',
      icon: 'briefcase',
      color: 'sky',
    })
  })

  it('opens the delete confirmation dialog', async () => {
    useAccount.mockReturnValue(queryStub(okAccount))
    renderPage(<AccountDetailPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }))

    // The AlertDialog content mounts into a portal on open.
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/Delete sean@example.com\?/)).toBeInTheDocument()
  })
})
