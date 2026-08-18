import { useId, useState } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAccounts } from '@/lib/accounts'
import { type AccountFolder, useAccountFolders } from '@/lib/folders'

/**
 * Naming a folder. Wherever grinbox asks for one it offers the folders the
 * Account actually has (r-e40s6olu), and still takes a name the listing does
 * not hold (d-mehrbfcx) — a Pipeline runs on Accounts whose folders differ, and
 * a folder that is not there fails the run rather than the save.
 *
 * The name is matched character for character (d-k8va629q, d-axa16o94): the
 * field neither trims nor case-folds what was typed, and the offered names are
 * rendered in the server's own order, unsorted and unsplit — `INBOX.Archive` is
 * one name, not a path.
 */

/**
 * A folder name field over a known list of folders. The list is offered through
 * a native datalist, so the user picks from it or types past it.
 */
export function FolderNameField({
  id,
  label,
  description,
  value,
  onChange,
  folders,
  emptyHint,
  invalid,
}: {
  id: string
  label: string
  description?: string
  value: string
  onChange: (next: string) => void
  folders: readonly AccountFolder[]
  /** What to say when no listing is available (not looked up, or the look failed). */
  emptyHint?: string
  invalid?: string | null
}) {
  const listId = `${id}-folders`
  const known = folders.some((folder) => folder.name === value)
  return (
    <div className='space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      {description ?
        <p className='text-xs text-muted-foreground'>{description}</p>
      : null}
      <Input
        id={id}
        list={listId}
        className='max-w-md font-mono'
        autoComplete='off'
        spellCheck={false}
        placeholder='INBOX'
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
        }}
      />
      <datalist id={listId}>
        {folders.map((folder) => (
          <option key={folder.name} value={folder.name} />
        ))}
      </datalist>
      {invalid ?
        <p className='text-xs [color:var(--danger)]'>{invalid}</p>
      : folders.length === 0 ?
        <p className='text-xs text-muted-foreground'>{emptyHint ?? 'No folder listing to offer — type the name.'}</p>
      : value.length > 0 && !known ?
        <p className='text-xs [color:var(--warning)]'>
          No folder of this name is in the listing. It is saved as typed; the Operator fails on an Account that has no
          folder called this.
        </p>
      : null}
    </div>
  )
}

/**
 * A folder name field that browses one Account's folders. A Pipeline may run on
 * several Accounts, so which Account's folders to offer is the user's choice
 * and does not constrain what is saved (d-mehrbfcx).
 */
export function FolderPicker({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description?: string
  value: string
  onChange: (next: string) => void
}) {
  const fieldId = useId()
  const accountId = useId()
  const { data: accounts } = useAccounts()
  const [browsing, setBrowsing] = useState<number | null>(null)
  const chosen = browsing ?? accounts?.[0]?.id ?? null
  const { data: folders, isPending, isError } = useAccountFolders(chosen)

  return (
    <div className='space-y-3'>
      <FolderNameField
        id={fieldId}
        label={label}
        description={description}
        value={value}
        onChange={onChange}
        folders={folders ?? []}
        emptyHint={
          chosen === null ? 'Add an Account to see its folders offered here.'
          : isPending ?
            'Reading this Account’s folders…'
          : isError ?
            'Grinbox could not read this Account’s folders just now. The name is saved as typed.'
          : 'This Account lists no folders.'
        }
      />
      {accounts && accounts.length > 1 ?
        <div className='flex items-center gap-2'>
          <Label htmlFor={accountId} className='text-xs font-normal text-muted-foreground'>
            Offer folders from
          </Label>
          <Select
            value={chosen === null ? '' : String(chosen)}
            onValueChange={(v) => {
              setBrowsing(Number(v))
            }}
          >
            <SelectTrigger id={accountId} className='h-8 max-w-56 text-xs'>
              <SelectValue placeholder='an Account' />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={String(account.id)}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      : null}
    </div>
  )
}
