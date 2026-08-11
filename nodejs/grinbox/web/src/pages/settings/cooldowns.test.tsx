import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CooldownRow } from '@/lib/cooldowns'

/**
 * Settings → Notification cooldowns tests (jsdom + RTL). The data layer is
 * mocked at the hook boundary (`@/lib/cooldowns`) so nothing touches the
 * network; the Add/Edit forms keep their real client-side validation (the
 * shared `cooldownSettingSchema`), so the whole-seconds-at-least-one and
 * non-empty-kind assertions exercise the genuine paths.
 */

const useCooldowns = vi.fn()
const createCooldownMutate = vi.fn()
const editCooldownMutate = vi.fn()
const deleteCooldownMutate = vi.fn()

vi.mock('@/lib/cooldowns', async () => {
  const actual = await vi.importActual<typeof import('@/lib/cooldowns')>('@/lib/cooldowns')
  return {
    ...actual,
    useCooldowns: () => useCooldowns(),
    useCreateCooldown: () => ({ mutate: createCooldownMutate, isPending: false }),
    useEditCooldown: () => ({ mutate: editCooldownMutate, isPending: false }),
    useDeleteCooldown: () => ({ mutate: deleteCooldownMutate, isPending: false }),
  }
})

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import { SettingsCooldownsPage } from './cooldowns'

// --- Fixtures --------------------------------------------------------------

const bankAlerts: CooldownRow = {
  id: 1,
  kind: 'Bank alerts',
  interval_seconds: 3600,
  created_at: 1_716_000_000,
}

const shipping: CooldownRow = {
  id: 2,
  kind: 'Shipping',
  interval_seconds: 45,
  created_at: 1_716_000_100,
}

function cooldownsStub(cooldowns: CooldownRow[], kindsInUse: string[]) {
  return {
    data: { cooldowns, kinds_in_use: kindsInUse },
    isPending: false,
    isError: false,
    error: null,
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

// --- Tests ------------------------------------------------------------------

describe('SettingsCooldownsPage', () => {
  it('renders a row per cooldown with its kind and interval', () => {
    useCooldowns.mockReturnValue(cooldownsStub([bankAlerts, shipping], ['Bank alerts']))
    renderPage(<SettingsCooldownsPage />)

    const table = screen.getByRole('table')
    expect(within(table).getByText('Bank alerts')).toBeInTheDocument()
    expect(within(table).getByText('Shipping')).toBeInTheDocument()
    expect(within(table).getByText('1h')).toBeInTheDocument()
    expect(within(table).getByText('45s')).toBeInTheDocument()
  })

  // d-6ptxams7: the cooldown is the user's — every row is freely editable and
  // removable, with none of the Limits table's locked seeded rows.
  it('offers edit and delete on every row', () => {
    useCooldowns.mockReturnValue(cooldownsStub([bankAlerts, shipping], []))
    renderPage(<SettingsCooldownsPage />)

    for (const kind of ['Bank alerts', 'Shipping']) {
      expect(screen.getByRole('button', { name: `Edit ${kind} cooldown` })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: `Delete ${kind} cooldown` })).toBeInTheDocument()
    }
  })

  // d-k3wq81vn: the setting outlives the Operators naming its kind — a dormant
  // kind keeps its row (badged), and a kind in use with no setting simply has
  // no cooldown (d-t6mhv3aq).
  it('badges a cooldown no enabled operator sends, and lists in-use kinds without one', () => {
    useCooldowns.mockReturnValue(cooldownsStub([bankAlerts], ['Newsletters']))
    renderPage(<SettingsCooldownsPage />)

    expect(screen.getByText('No operator sends this kind')).toBeInTheDocument()
    expect(screen.getByText(/Kinds in use without a cooldown/i)).toBeInTheDocument()
    expect(screen.getByText('Newsletters')).toBeInTheDocument()
  })

  it('offers kinds_in_use without a cooldown as suggestions when adding', async () => {
    useCooldowns.mockReturnValue(cooldownsStub([bankAlerts], ['Bank alerts', 'Newsletters']))
    renderPage(<SettingsCooldownsPage />)

    fireEvent.click(screen.getByRole('button', { name: /Add cooldown/i }))
    const dialog = await screen.findByRole('dialog')

    // 'Bank alerts' already has a cooldown, so only 'Newsletters' is offered.
    const suggestion = within(dialog).getByRole('button', { name: 'Newsletters' })
    expect(within(dialog).queryByRole('button', { name: 'Bank alerts' })).not.toBeInTheDocument()

    fireEvent.click(suggestion)
    expect(within(dialog).getByLabelText('Notification kind')).toHaveValue('Newsletters')
  })

  it('submits a valid kind + whole-second interval', async () => {
    useCooldowns.mockReturnValue(cooldownsStub([], []))
    renderPage(<SettingsCooldownsPage />)

    fireEvent.click(screen.getByRole('button', { name: /Add cooldown/i }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('Notification kind'), {
      target: { value: '  Bank alerts  ' },
    })
    fireEvent.change(within(dialog).getByLabelText(/Interval \(seconds\)/i), {
      target: { value: '900' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add cooldown' }))

    expect(createCooldownMutate).toHaveBeenCalledTimes(1)
    // The shared schema stores the kind trimmed (d-p8xrn2ce).
    expect(createCooldownMutate.mock.calls[0]?.[0]).toEqual({
      kind: 'Bank alerts',
      interval_seconds: 900,
    })
  })

  // d-t6mhv3aq: whole seconds, at least one — 0 and fractions are rejected
  // client-side before any request.
  it.each(['0', '1.5', '-30', ''])('rejects the interval %j before submitting', async (bad) => {
    useCooldowns.mockReturnValue(cooldownsStub([], []))
    renderPage(<SettingsCooldownsPage />)

    fireEvent.click(screen.getByRole('button', { name: /Add cooldown/i }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('Notification kind'), {
      target: { value: 'Bank alerts' },
    })
    fireEvent.change(within(dialog).getByLabelText(/Interval \(seconds\)/i), {
      target: { value: bad },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add cooldown' }))

    expect(within(dialog).getByText(/whole number of seconds, at least 1/i)).toBeInTheDocument()
    expect(createCooldownMutate).not.toHaveBeenCalled()
  })

  it('rejects a blank kind before submitting', async () => {
    useCooldowns.mockReturnValue(cooldownsStub([], []))
    renderPage(<SettingsCooldownsPage />)

    fireEvent.click(screen.getByRole('button', { name: /Add cooldown/i }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText(/Interval \(seconds\)/i), {
      target: { value: '60' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add cooldown' }))

    expect(createCooldownMutate).not.toHaveBeenCalled()
    // The kind field carries the error, not the interval.
    expect(within(dialog).getByLabelText('Notification kind')).toHaveAttribute('aria-invalid', 'true')
  })

  // d-7c6u5nfn: the kind is fixed at create — the edit dialog offers only the
  // interval, and renaming is delete + create.
  it('edit changes the interval only; the kind is not an input', async () => {
    useCooldowns.mockReturnValue(cooldownsStub([bankAlerts], []))
    renderPage(<SettingsCooldownsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit Bank alerts cooldown' }))
    const dialog = await screen.findByRole('dialog')

    // The kind renders as fixed text; the only input is the interval.
    expect(within(dialog).getByText('Bank alerts')).toBeInTheDocument()
    const inputs = within(dialog).getAllByRole('spinbutton')
    expect(inputs).toHaveLength(1)
    expect(within(dialog).queryByLabelText('Notification kind')).not.toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText(/Interval \(seconds\)/i), {
      target: { value: '7200' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(editCooldownMutate).toHaveBeenCalledTimes(1)
    expect(editCooldownMutate.mock.calls[0]?.[0]).toEqual({ id: 1, interval_seconds: 7200 })
  })

  it('delete confirms, then removes the setting', async () => {
    useCooldowns.mockReturnValue(cooldownsStub([bankAlerts], []))
    renderPage(<SettingsCooldownsPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Bank alerts cooldown' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/Remove this cooldown\?/)).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect(deleteCooldownMutate).toHaveBeenCalledTimes(1)
    expect(deleteCooldownMutate.mock.calls[0]?.[0]).toBe(1)
  })

  it('renders an empty state when no cooldowns are set', () => {
    useCooldowns.mockReturnValue(cooldownsStub([], []))
    renderPage(<SettingsCooldownsPage />)
    expect(screen.getByText(/No cooldowns set/i)).toBeInTheDocument()
  })
})
