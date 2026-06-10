import type { CredentialSummary, LimitEntry } from '@twin-digital/grinbox-server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../lib/api-error.js'

// Radix Select probes pointer-capture + scrollIntoView on its options; jsdom
// stubs neither. Provide no-ops so the dropdown can open under jsdom.
// jsdom omits these at runtime even though its types declare them, so assign
// unconditionally.
Element.prototype.scrollIntoView = () => undefined
Element.prototype.hasPointerCapture = () => false
Element.prototype.releasePointerCapture = () => undefined

/**
 * Settings sub-page tests (jsdom + RTL, not e2e). The data layer is mocked at
 * the hook boundary (`@/lib/limits`, `@/lib/credentials`, `@/lib/health`) so
 * nothing touches the network. The Add forms keep their real client-side
 * validation (`limitDefinitionSchema` for Limits, required-field checks for the
 * Pushover form), so the validation assertions exercise the genuine paths. A
 * throwaway QueryClient backs the mutation hooks that close over one; the global
 * `afterEach` in `src/test/setup.ts` clears portal residue between tests.
 */

// --- Limits hook mocks ---------------------------------------------------

const useLimits = vi.fn<() => unknown>()
const createLimitMutate = vi.fn()
const editLimitMutate = vi.fn()
const deleteLimitMutate = vi.fn()

vi.mock('../../lib/limits.js', () => ({
  useLimits: () => useLimits(),
  useCreateLimit: () => ({ mutate: createLimitMutate, isPending: false }),
  useEditLimit: () => ({ mutate: editLimitMutate, isPending: false }),
  useDeleteLimit: () => ({ mutate: deleteLimitMutate, isPending: false }),
}))

// --- Credentials hook mocks ----------------------------------------------

const useCredentials = vi.fn<() => unknown>()
const addPushoverMutate = vi.fn()
const deleteCredentialMutate = vi.fn<(id: number, opts: { onError: (err: unknown) => void }) => void>()

vi.mock('../../lib/credentials.js', async () => {
  const actual = await vi.importActual<typeof import('../../lib/credentials.js')>('../../lib/credentials.js')
  return {
    ...actual,
    useCredentials: () => useCredentials(),
    useAddPushoverCredential: () => ({
      mutate: addPushoverMutate,
      isPending: false,
    }),
    useDeleteCredential: () => ({
      mutate: deleteCredentialMutate,
      isPending: false,
    }),
  }
})

// --- Health hook mock ----------------------------------------------------

const useHealth = vi.fn<() => unknown>()
vi.mock('../../lib/health.js', () => ({ useHealth: () => useHealth() }))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import { SettingsAboutPage } from './about.js'
import { SettingsCredentialsPage } from './credentials.js'
import { SettingsLimitsPage } from './limits.js'

// --- Fixtures ------------------------------------------------------------

const windowLimit: LimitEntry = {
  id: 1,
  resource: 'pushover_api',
  operation: 'send_notification',
  scope: 'per_window',
  max_count: 10,
  window_seconds: 600,
  usage: {
    kind: 'per_window',
    window_start: 1000,
    current_count: 8,
    window_active: true,
  },
}

const messageLimit: LimitEntry = {
  id: 2,
  resource: 'pushover_api',
  operation: 'send_notification',
  scope: 'per_message',
  max_count: 1,
  window_seconds: null,
  usage: { kind: 'per_message', messages_counted: 3, max_message_count: 1 },
}

const pushoverCredential: CredentialSummary = {
  id: 5,
  kind: 'pushover',
  account_id: null,
  created_at: 1_716_000_000,
  updated_at: null,
}

function queryStub<T>(data: T | undefined, overrides = {}) {
  return {
    data,
    isPending: data === undefined,
    isError: false,
    error: null,
    ...overrides,
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
})

// --- Limits --------------------------------------------------------------

describe('SettingsLimitsPage', () => {
  it('renders a table row per limit with usage', () => {
    useLimits.mockReturnValue(queryStub([windowLimit, messageLimit]))
    renderPage(<SettingsLimitsPage />)

    expect(screen.getAllByText('pushover_api.send_notification').length).toBeGreaterThan(0)
    // per_window usage rendered as current / cap.
    expect(screen.getByText('8 / 10')).toBeInTheDocument()
    // per_message usage names the Message count + per-message max.
    expect(screen.getByText(/3 Messages · max 1 \/ 1/)).toBeInTheDocument()
    // Both scope badges show in the table.
    const table = screen.getByRole('table')
    expect(within(table).getByText('per_window')).toBeInTheDocument()
    expect(within(table).getByText('per_message')).toBeInTheDocument()
  })

  it('per_window add rejects a missing window before submitting', async () => {
    useLimits.mockReturnValue(queryStub([windowLimit]))
    renderPage(<SettingsLimitsPage />)

    fireEvent.click(screen.getByRole('button', { name: /Add Limit/i }))
    const dialog = await screen.findByRole('dialog')

    // Default scope is per_window; blank the required window and submit.
    fireEvent.change(within(dialog).getByLabelText(/Window \(seconds\)/i), {
      target: { value: '' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Limit' }))

    expect(within(dialog).getByText(/per_window limits require a positive/i)).toBeInTheDocument()
    expect(createLimitMutate).not.toHaveBeenCalled()
  })

  it('per_message add submits with a null window', async () => {
    useLimits.mockReturnValue(queryStub([windowLimit]))
    renderPage(<SettingsLimitsPage />)

    fireEvent.click(screen.getByRole('button', { name: /Add Limit/i }))
    const dialog = await screen.findByRole('dialog')

    // Switch scope to per_message — the window field disappears entirely, so the
    // schema's "per_message must have null window_seconds" branch is satisfied.
    fireEvent.click(within(dialog).getByLabelText('Scope'))
    fireEvent.click(await screen.findByRole('option', { name: 'per_message' }))

    expect(within(dialog).queryByLabelText(/Window \(seconds\)/i)).not.toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Limit' }))

    expect(createLimitMutate).toHaveBeenCalledTimes(1)
    const payload = createLimitMutate.mock.calls[0]?.[0] as {
      scope: string
      window_seconds: number | null
    }
    expect(payload.scope).toBe('per_message')
    expect(payload.window_seconds).toBeNull()
  })

  it('opens the delete confirmation dialog for a limit', async () => {
    useLimits.mockReturnValue(queryStub([windowLimit]))
    renderPage(<SettingsLimitsPage />)

    fireEvent.click(
      screen.getByRole('button', {
        name: /Delete pushover_api.send_notification limit/i,
      }),
    )

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/Remove this Limit\?/)).toBeInTheDocument()
  })

  it('renders an empty state when there are no limits', () => {
    useLimits.mockReturnValue(queryStub([]))
    renderPage(<SettingsLimitsPage />)
    expect(screen.getByText(/No Limits defined/i)).toBeInTheDocument()
  })
})

// --- Credentials ---------------------------------------------------------

describe('SettingsCredentialsPage', () => {
  it('renders credential metadata without any secret', () => {
    useCredentials.mockReturnValue(queryStub([pushoverCredential]))
    const { container } = renderPage(<SettingsCredentialsPage />)

    expect(screen.getByText('pushover')).toBeInTheDocument()
    expect(screen.getByText('#5')).toBeInTheDocument()
    expect(screen.getByText(/Added/i)).toBeInTheDocument()
    // No password fields / secret values are present in the list view.
    expect(container.querySelector('input[type="password"]')).toBeNull()
  })

  it('renders the empty state guiding the user to add one', () => {
    useCredentials.mockReturnValue(queryStub([]))
    renderPage(<SettingsCredentialsPage />)
    expect(screen.getByText(/No Credentials yet/i)).toBeInTheDocument()
  })

  it('submits the add form with sensitive, password-typed inputs', async () => {
    useCredentials.mockReturnValue(queryStub([pushoverCredential]))
    renderPage(<SettingsCredentialsPage />)

    fireEvent.click(screen.getByRole('button', { name: /Add Pushover/i }))
    const dialog = await screen.findByRole('dialog')

    const appToken = within(dialog).getByLabelText<HTMLInputElement>('App token')
    const userKey = within(dialog).getByLabelText<HTMLInputElement>('User key')
    expect(appToken.type).toBe('password')
    expect(userKey.type).toBe('password')

    fireEvent.change(appToken, { target: { value: 'tok-123' } })
    fireEvent.change(userKey, { target: { value: 'usr-456' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /Save credential/i }))

    expect(addPushoverMutate).toHaveBeenCalledTimes(1)
    const payload = addPushoverMutate.mock.calls[0]?.[0]
    expect(payload).toEqual({ app_token: 'tok-123', user_key: 'usr-456' })
  })

  it('add form rejects empty inputs without submitting', async () => {
    useCredentials.mockReturnValue(queryStub([pushoverCredential]))
    renderPage(<SettingsCredentialsPage />)

    fireEvent.click(screen.getByRole('button', { name: /Add Pushover/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Save credential/i }))

    expect(within(dialog).getByText(/An app token is required/i)).toBeInTheDocument()
    expect(addPushoverMutate).not.toHaveBeenCalled()
  })

  it('surfaces dependent Operators on a credential_in_use 409', async () => {
    useCredentials.mockReturnValue(queryStub([pushoverCredential]))
    // The delete mutation reports the in-use 409 via its onError callback.
    deleteCredentialMutate.mockImplementation((_id, opts) => {
      opts.onError(
        new ApiError('credential_in_use', 'Credential 5 is still referenced by 2 Operators.', {
          operator_ids: [11, 12],
        }),
      )
    })
    renderPage(<SettingsCredentialsPage />)

    fireEvent.click(
      screen.getByRole('button', {
        name: /Delete pushover credential #5/i,
      }),
    )
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(within(dialog).getByText(/Can't delete — still in use/i)).toBeInTheDocument()
    expect(within(dialog).getByText('#11')).toBeInTheDocument()
    expect(within(dialog).getByText('#12')).toBeInTheDocument()
  })
})

// --- About ---------------------------------------------------------------

describe('SettingsAboutPage', () => {
  it('renders the version from a mocked health response', () => {
    useHealth.mockReturnValue(queryStub({ status: 'ok', version: '1.2.3' }))
    renderPage(<SettingsAboutPage />)
    expect(screen.getByTestId('about-version')).toHaveTextContent('1.2.3')
  })

  it('shows a placeholder while health is pending', () => {
    useHealth.mockReturnValue(queryStub(undefined))
    renderPage(<SettingsAboutPage />)
    expect(screen.getByTestId('about-version')).toHaveTextContent('…')
  })
})
