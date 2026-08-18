import type { AccountSummary } from '@grinbox/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Adding an IMAP Account, repairing one the server refused, and what an
 * Account's detail says about what it can carry.
 *
 * The data layer is mocked at the hook boundary; the router primitives are
 * stubbed so the pages render synchronously.
 */

const navigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...props }: { children: ReactNode }) => {
    const { to: _to, params: _params, ...rest } = props as Record<string, unknown>
    return <a {...rest}>{children}</a>
  },
  useParams: () => ({ accountId: '2' }),
  useNavigate: () => navigate,
}))

const useAccounts = vi.fn()
const useAccount = vi.fn()
const usePipelines = vi.fn()
const useUpdateAccount = vi.fn()
const useDeleteAccount = vi.fn()
vi.mock('@/lib/accounts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/accounts')>('@/lib/accounts')
  return {
    ...actual,
    useAccounts: () => useAccounts(),
    useAccount: (id: number) => useAccount(id),
    usePipelines: () => usePipelines(),
    useUpdateAccount: (id: number) => useUpdateAccount(id),
    useDeleteAccount: (id: number) => useDeleteAccount(id),
  }
})

const probeMutate = vi.fn()
const createMutate = vi.fn()
const repairMutateAsync = vi.fn()
const repointMutate = vi.fn()
const repointMutateAsync = vi.fn()
vi.mock('@/lib/imap', async () => {
  const actual = await vi.importActual<typeof import('@/lib/imap')>('@/lib/imap')
  return {
    ...actual,
    useImapProbe: () => ({ mutate: probeMutate, isPending: false }),
    useCreateImapAccount: () => ({ mutate: createMutate, isPending: false }),
    useRepairImapConnection: () => ({ mutateAsync: repairMutateAsync, isPending: false }),
    useRepointFolders: () => ({ mutate: repointMutate, mutateAsync: repointMutateAsync, isPending: false }),
  }
})

const useAccountFolders = vi.fn()
vi.mock('@/lib/folders', () => ({
  useAccountFolders: (id: number | null) => useAccountFolders(id) as unknown,
  accountFoldersKey: (id: number) => ['accounts', id, 'folders'],
}))

vi.mock('@/lib/oauth', () => ({
  runOAuthFlow: vi.fn(),
  callbackOriginFromConsentUrl: () => null,
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

import { ApiError } from '@/lib/api-error'
import { AddAccountButton } from './add-account-button'
import { AccountDetailPage } from './detail'

// --- Fixtures ------------------------------------------------------------

const SERVER_FOLDERS = [
  { name: 'INBOX', roles: [] },
  { name: 'INBOX.Archive', roles: ['\\Archive'] },
  { name: 'Trash', roles: ['\\Trash'] },
  { name: 'Junk', roles: ['\\Junk'] },
  { name: 'INBOX.Receipts', roles: [] },
]

const PROBE = {
  folders: SERVER_FOLDERS,
  proposed: { arrival: 'INBOX', archived: 'INBOX.Archive', trashed: 'Trash', spam: 'Junk' },
  capabilities: {
    supported: ['apply_category', 'archive', 'file'] as const,
    unsupported: { send_message: 'grinbox cannot send mail through IMAP' },
    readAt: 100,
  },
}

const imapAccount = {
  id: 2,
  name: 'mail@example.net',
  icon: null,
  color: null,
  provider_type: 'imap',
  active_pipeline_id: null,
  active_pipeline_name: null,
  last_polled_at: null,
  poll_interval_seconds: 300,
  status: 'ok',
  capabilities: {
    supported: ['apply_category', 'archive', 'file'],
    unsupported: { send_message: 'grinbox cannot send mail through IMAP' },
    readAt: 100,
  },
  paused_reason: null,
  // The stored connection the interface reads back — never the password.
  settings: {
    host: 'imap.example.net',
    port: 993,
    security: 'implicit',
    username: 'sean',
    address: 'mail@example.net',
    folders: { arrival: 'INBOX', archived: 'INBOX.Archive', trashed: 'Trash', spam: 'Junk' },
  },
} as unknown as AccountSummary

const pausedAccount = {
  ...imapAccount,
  status: 'paused',
  paused_reason: 'the server refused the stored password',
} as unknown as AccountSummary

function queryStub<T>(data: T | undefined) {
  return { data, isPending: data === undefined, isError: false, error: null, refetch: vi.fn() }
}

function renderPage(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  useAccounts.mockReturnValue(queryStub([imapAccount]))
  useAccount.mockReturnValue(queryStub(imapAccount))
  usePipelines.mockReturnValue(queryStub([]))
  useUpdateAccount.mockReturnValue({ mutate: vi.fn(), isPending: false })
  useDeleteAccount.mockReturnValue({ mutate: vi.fn(), isPending: false })
  useAccountFolders.mockReturnValue(queryStub(SERVER_FOLDERS))
})

/** Open Add Account and walk to the IMAP connection form. */
function openImapForm() {
  renderPage(<AddAccountButton />)
  fireEvent.click(screen.getByRole('button', { name: /Add Account/i }))
  fireEvent.click(screen.getByRole('button', { name: /IMAP/i }))
}

/** Fill a complete login and press Log in. */
function logIn() {
  fireEvent.change(screen.getByLabelText('Account name'), { target: { value: 'Personal' } })
  fireEvent.change(screen.getByLabelText('Mail address'), { target: { value: 'mail@example.net' } })
  fireEvent.change(screen.getByLabelText('Server'), { target: { value: 'imap.example.net' } })
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'sean' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
}

// --- Adding --------------------------------------------------------------

describe('adding an Account (d-rydjjggx)', () => {
  it('opens on the backend choice, and each choice leads to its own flow', () => {
    renderPage(<AddAccountButton />)
    fireEvent.click(screen.getByRole('button', { name: /Add Account/i }))

    expect(screen.getByRole('button', { name: /Gmail/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /IMAP/ })).toBeInTheDocument()
  })

  it('asks for the host, port, protection, username, and password (d-ioso3voc)', () => {
    openImapForm()

    expect(screen.getByLabelText('Server')).toBeInTheDocument()
    expect(screen.getByLabelText('Port')).toHaveValue('993')
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
    expect(screen.getByLabelText('Connection')).toBeInTheDocument()
  })

  it('offers no way to waive certificate verification (d-lru4i8rp)', () => {
    openImapForm()
    expect(screen.getByText(/refuses an Account whose certificate it cannot verify/)).toBeInTheDocument()
    expect(screen.queryByText(/insecure|skip.*verif|ignore.*certificate/i)).not.toBeInTheDocument()
  })

  it('will not log in until the whole connection is given', () => {
    openImapForm()
    expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled()
  })

  it('proposes the four folders from what the server advertises (d-zxvkt95o)', () => {
    probeMutate.mockImplementation((_login, opts: { onSuccess: (p: typeof PROBE) => void }) => {
      opts.onSuccess(PROBE)
    })
    openImapForm()
    logIn()

    expect(screen.getByLabelText('Arrival folder')).toHaveValue('INBOX')
    expect(screen.getByLabelText('Archived mail')).toHaveValue('INBOX.Archive')
    expect(screen.getByLabelText('Trashed mail')).toHaveValue('Trash')
    expect(screen.getByLabelText('Spam')).toHaveValue('Junk')
  })

  it('offers the folders the account actually has (r-e40s6olu)', () => {
    probeMutate.mockImplementation((_login, opts: { onSuccess: (p: typeof PROBE) => void }) => {
      opts.onSuccess(PROBE)
    })
    openImapForm()
    logIn()

    const options = Array.from(document.querySelectorAll('datalist option')).map((o) => o.getAttribute('value'))
    // Every listed folder is offered, spelled exactly as the server spells it —
    // `INBOX.Archive` is one name, not a path (d-axa16o94).
    expect(options).toContain('INBOX.Archive')
    expect(options).toContain('INBOX.Receipts')
    expect(options).not.toContain('Archive')
  })

  it('refuses to create while two roles name one folder (d-zxvkt95o)', () => {
    probeMutate.mockImplementation((_login, opts: { onSuccess: (p: typeof PROBE) => void }) => {
      opts.onSuccess(PROBE)
    })
    openImapForm()
    logIn()

    fireEvent.change(screen.getByLabelText('Spam'), { target: { value: 'Trash' } })
    expect(screen.getByRole('button', { name: 'Add Account' })).toBeDisabled()
    expect(screen.getByText(/Another role already names this folder/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Spam'), { target: { value: 'Junk' } })
    expect(screen.getByRole('button', { name: 'Add Account' })).toBeEnabled()
  })

  it('creates the Account only once the folders are accepted (d-8jc4taom)', () => {
    probeMutate.mockImplementation((_login, opts: { onSuccess: (p: typeof PROBE) => void }) => {
      opts.onSuccess(PROBE)
    })
    openImapForm()
    logIn()

    // A successful login on its own creates nothing.
    expect(createMutate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Add Account' }))
    expect(createMutate).toHaveBeenCalledTimes(1)
    expect(createMutate.mock.calls[0]?.[0]).toMatchObject({
      name: 'Personal',
      address: 'mail@example.net',
      folders: { arrival: 'INBOX', archived: 'INBOX.Archive', trashed: 'Trash', spam: 'Junk' },
    })
  })

  it('leaves nothing behind when the dialog closes after a successful login (d-8jc4taom)', () => {
    probeMutate.mockImplementation((_login, opts: { onSuccess: (p: typeof PROBE) => void }) => {
      opts.onSuccess(PROBE)
    })
    openImapForm()
    logIn()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(createMutate).not.toHaveBeenCalled()
  })

  it('says the password was refused when the server refuses it (d-v4mejzw5, d-oaaz2fwk)', () => {
    probeMutate.mockImplementation((_login, opts: { onError: (e: unknown) => void }) => {
      opts.onError(new ApiError('account_login_failed', 'login failed'))
    })
    openImapForm()
    logIn()

    expect(screen.getByRole('alert')).toHaveTextContent(/refused this username and password/)
  })

  it('renders an unverifiable certificate as its own refusal, with no override (d-lru4i8rp)', () => {
    probeMutate.mockImplementation((_login, opts: { onError: (e: unknown) => void }) => {
      opts.onError(new ApiError('certificate_unverified', 'certificate could not be verified'))
    })
    openImapForm()
    logIn()

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/could not verify this server’s certificate/)
    expect(alert).toHaveTextContent(/no way to turn that check off/)
  })
})

// --- The Account afterwards ----------------------------------------------

describe('an IMAP Account’s detail', () => {
  it('shows the stored connection and never the password (r-0kn0oida, d-ioso3voc)', () => {
    renderPage(<AccountDetailPage />)

    expect(screen.getByText('imap.example.net:993')).toBeInTheDocument()
    expect(screen.getByText('sean')).toBeInTheDocument()
    expect(screen.getByText(/Stored encrypted/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument()
  })

  it('says which operations it cannot carry, and why (d-5h66e3zl, d-jl5giafw)', () => {
    renderPage(<AccountDetailPage />)

    expect(screen.getByText(/Cannot send mail/)).toBeInTheDocument()
    expect(screen.getByText(/grinbox cannot send mail through IMAP/)).toBeInTheDocument()
    expect(screen.getByText(/claims no occurrence for this Account/)).toBeInTheDocument()
  })

  it('offers repair rather than re-authorization while paused (d-v4mejzw5, d-hinqfmdf)', () => {
    useAccount.mockReturnValue(queryStub(pausedAccount))
    renderPage(<AccountDetailPage />)

    expect(screen.getByText(/the server refused the stored password/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Re-authorize/ })).not.toBeInTheDocument()
  })

  it('opens repair on the whole connection, pre-filled but for the password (d-r3ogwkv7, d-mcdtvppm)', async () => {
    useAccount.mockReturnValue(queryStub(pausedAccount))
    renderPage(<AccountDetailPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Server')).toHaveValue('imap.example.net')
    expect(within(dialog).getByLabelText('Username')).toHaveValue('sean')
    expect(within(dialog).getByLabelText('Port')).toHaveValue('993')
    expect(within(dialog).getByLabelText('Password')).toHaveValue('')
    // The backend is not offered: an Account keeps the one it was added with.
    expect(within(dialog).queryByRole('button', { name: /Gmail/ })).not.toBeInTheDocument()
  })

  it('re-points a folder role (d-8pdx8qsd)', () => {
    renderPage(<AccountDetailPage />)

    const archived = screen.getByLabelText('Archived mail')
    expect(archived).toHaveValue('INBOX.Archive')
    fireEvent.change(archived, { target: { value: 'INBOX.Receipts' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save folders' }))

    expect(repointMutate).toHaveBeenCalledTimes(1)
    expect(repointMutate.mock.calls[0]?.[0]).toEqual({
      arrival: 'INBOX',
      archived: 'INBOX.Receipts',
      trashed: 'Trash',
      spam: 'Junk',
    })
  })

  it('will not save folders while two roles name one (d-zxvkt95o)', () => {
    renderPage(<AccountDetailPage />)

    fireEvent.change(screen.getByLabelText('Archived mail'), { target: { value: 'Trash' } })
    expect(screen.getByRole('button', { name: 'Save folders' })).toBeDisabled()
    expect(repointMutate).not.toHaveBeenCalled()
  })
})
