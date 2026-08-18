import type { AccountSummary } from '@grinbox/server'
import { operatorConfigSchemas } from '@grinbox/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The two Operator types that name a folder — File (d-jj2mymbi) and Set aside
 * (d-hj9nac5f) — the folder picker they share (r-e40s6olu, d-mehrbfcx), and the
 * Category character check a save runs (d-mbh2pthe, d-8v30vkou).
 */

const useAccounts = vi.fn()
vi.mock('@/lib/accounts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/accounts')>('@/lib/accounts')
  return { ...actual, useAccounts: () => useAccounts() }
})

const useAccountFolders = vi.fn()
vi.mock('@/lib/folders', () => ({
  useAccountFolders: (id: number | null) => useAccountFolders(id) as unknown,
  accountFoldersKey: (id: number) => ['accounts', id, 'folders'],
}))

import { FileEditor, SetAsideEditor } from './editors/action-editors'
import { OperatorEditor } from './editors/operator-editor'
import { blankConfigFor, OPERATOR_TYPE_BY_KEY } from './operator-types'

const FOLDERS = [
  { name: 'INBOX', roles: [] },
  { name: 'INBOX.Archive', roles: ['\\Archive'] },
  { name: 'INBOX.Receipts', roles: [] },
]

const ACCOUNT = { id: 1, name: 'mail@example.net' } as AccountSummary

function renderUi(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()
  useAccounts.mockReturnValue({ data: [ACCOUNT], isPending: false, isError: false, error: null, refetch: vi.fn() })
  useAccountFolders.mockReturnValue({ data: FOLDERS, isPending: false, isError: false, error: null, refetch: vi.fn() })
})

// --- The types themselves ------------------------------------------------

describe('the two new Action types (d-0oyit0qb)', () => {
  it('are offered in the type picker', () => {
    expect(OPERATOR_TYPE_BY_KEY.file.label).toBe('File')
    expect(OPERATOR_TYPE_BY_KEY.set_aside.label).toBe('Set aside')
  })

  it('open on the stored shape each type carries', () => {
    expect(blankConfigFor('file')).toEqual({ folder: '' })
    expect(blankConfigFor('set_aside')).toEqual({ category_template: '', folder: '' })
  })

  it('start invalid, so an unnamed folder cannot be saved', () => {
    expect(operatorConfigSchemas.file.safeParse(blankConfigFor('file')).success).toBe(false)
    expect(operatorConfigSchemas.set_aside.safeParse(blankConfigFor('set_aside')).success).toBe(false)
  })
})

// --- Naming a folder -----------------------------------------------------

describe('the folder picker (r-e40s6olu, d-mehrbfcx)', () => {
  it('offers the folders the Account actually has', () => {
    renderUi(<FileEditor value={{ folder: '' }} onChange={vi.fn()} />)

    const options = Array.from(document.querySelectorAll('datalist option')).map((o) => o.getAttribute('value'))
    expect(options).toEqual(['INBOX', 'INBOX.Archive', 'INBOX.Receipts'])
  })

  it('takes a name the listing does not hold, and says what that means', () => {
    const onChange = vi.fn()
    renderUi(<FileEditor value={{ folder: 'Somewhere else' }} onChange={onChange} />)

    expect(screen.getByText(/No folder of this name is in the listing/)).toBeInTheDocument()
    expect(screen.getByText(/fails on an Account that has no folder called this/)).toBeInTheDocument()
  })

  it('keeps a name exactly as typed — no trimming, no separator reading (d-axa16o94, d-k8va629q)', () => {
    const onChange = vi.fn()
    renderUi(<FileEditor value={{ folder: '' }} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Folder'), { target: { value: ' INBOX.Archive ' } })
    expect(onChange).toHaveBeenCalledWith({ folder: ' INBOX.Archive ' })
  })

  it('recognises a listed name, whatever separator it carries', () => {
    renderUi(<FileEditor value={{ folder: 'INBOX.Archive' }} onChange={vi.fn()} />)
    expect(screen.queryByText(/No folder of this name is in the listing/)).not.toBeInTheDocument()
  })
})

// --- Set aside -----------------------------------------------------------

describe('Set aside (d-hj9nac5f, r-blqzjemx)', () => {
  it('carries both a Category and a folder, and says which Account gets which', () => {
    renderUi(<SetAsideEditor value={{ category_template: '', folder: '' }} onChange={vi.fn()} />)

    expect(screen.getByLabelText('Category name')).toBeInTheDocument()
    expect(screen.getByLabelText('Folder')).toBeInTheDocument()
    expect(screen.getByText(/can apply Categories it applies the Category/)).toBeInTheDocument()
  })
})

// --- The Category character check ----------------------------------------

describe('a Category’s template is checked at save (d-mbh2pthe, d-8v30vkou)', () => {
  it('names the barred character the template’s own text carries', () => {
    renderUi(<SetAsideEditor value={{ category_template: 'Set aside', folder: 'Later' }} onChange={vi.fn()} />)
    // A space is barred from a Category.
    expect(screen.getByText(/A Category cannot carry ' '/)).toBeInTheDocument()
  })

  it('passes a template whose barred characters are all inside placeholders', () => {
    renderUi(
      <SetAsideEditor value={{ category_template: 'Grinbox/{{ subject }}', folder: 'Later' }} onChange={vi.fn()} />,
    )
    expect(screen.queryByText(/A Category cannot carry/)).not.toBeInTheDocument()
  })

  it('refuses the save the editor runs, naming what is wrong', () => {
    const parsed = operatorConfigSchemas.set_aside.safeParse({ category_template: 'set aside', folder: 'Later' })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toContain("a category cannot carry ' '")
  })
})

// --- Through the editor dialog -------------------------------------------

describe('the Operator editor dispatches to the new types', () => {
  it('saves a File Operator’s literal folder (d-0oyit0qb)', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    renderUi(
      <OperatorEditor
        open
        onOpenChange={vi.fn()}
        mode='create'
        typeKey='file'
        pipelineId={1}
        initialName=''
        onSave={onSave}
      />,
    )

    fireEvent.change(screen.getByLabelText('Operator name'), { target: { value: 'File receipts' } })
    fireEvent.change(screen.getByLabelText('Folder'), { target: { value: 'INBOX.Receipts' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ name: 'File receipts', config: { folder: 'INBOX.Receipts' } })
    })
  })
})
