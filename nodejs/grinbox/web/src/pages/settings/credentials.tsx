import type { CredentialSummary } from '@twin-digital/grinbox-server'
import { Bell, KeyRound, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../components/ui/alert-dialog.js'
import { Badge } from '../../components/ui/badge.js'
import { Button } from '../../components/ui/button.js'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog.js'
import { Input } from '../../components/ui/input.js'
import { Label } from '../../components/ui/label.js'
import { ApiError, errorMessage } from '../../lib/api-error.js'
import {
  operatorIdsFromInUse,
  useAddPushoverCredential,
  useCredentials,
  useDeleteCredential,
} from '../../lib/credentials.js'

/**
 * Settings → Notification credentials (ui-design.md "Settings"). Lists the
 * User's saved Credentials by non-secret metadata only — the server never
 * returns secret material — and offers an Add Pushover form plus per-Credential
 * delete. Secrets are write-only: the `app_token` / `user_key` inputs are
 * password-typed and never echoed back. A delete that's still referenced by an
 * Operator comes back as `409 credential_in_use`; the page reads the dependent
 * Operator ids from the error `details` and refuses gracefully.
 */
export function SettingsCredentialsPage() {
  const { data: credentials, isPending, isError, error } = useCredentials()

  return (
    <section className='space-y-6'>
      <div>
        <h2 className='text-xl font-semibold'>Notification credentials</h2>
        <p className='mt-1 text-sm text-muted-foreground'>
          Credentials Grinbox uses to notify you. Secrets are write-only — once saved they're stored encrypted and never
          shown again. Rotate by deleting and re-adding.
        </p>
      </div>

      {isError ?
        <div className='rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center'>
          <p className='text-base font-medium'>Couldn't load Credentials</p>
          <p className='mt-1 text-sm text-muted-foreground'>{error.message}</p>
        </div>
      : isPending ?
        <div className='space-y-3'>
          <div className='h-16 w-full animate-pulse rounded-lg bg-muted' />
          <div className='h-16 w-full animate-pulse rounded-lg bg-muted' />
        </div>
      : <CredentialsList credentials={credentials} />}
    </section>
  )
}

function CredentialsList({ credentials }: { credentials: CredentialSummary[] }) {
  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <AddPushoverDialog />
      </div>

      {credentials.length === 0 ?
        <div className='rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center'>
          <p className='text-xl font-medium'>:)</p>
          <p className='mt-2 max-w-sm text-sm text-muted-foreground'>
            No Credentials yet. Add your Pushover app token and user key so Notify Operators can reach you.
          </p>
          <div className='mt-4 flex justify-center'>
            <AddPushoverDialog />
          </div>
        </div>
      : <ul className='space-y-2'>
          {credentials.map((credential) => (
            <CredentialRow key={credential.id} credential={credential} />
          ))}
        </ul>
      }
    </div>
  )
}

function CredentialRow({ credential }: { credential: CredentialSummary }) {
  return (
    <li className='flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3'>
      <div className='flex min-w-0 items-center gap-3'>
        <span className='flex h-9 w-9 flex-none items-center justify-center rounded-md bg-muted'>
          {credential.kind === 'pushover' ?
            <Bell className='h-4 w-4 text-muted-foreground' />
          : <KeyRound className='h-4 w-4 text-muted-foreground' />}
        </span>
        <div className='min-w-0'>
          <div className='flex items-center gap-2'>
            <span className='text-sm font-medium capitalize'>{credential.kind}</span>
            <Badge variant='outline' className='font-mono text-[10px]'>
              #{credential.id}
            </Badge>
          </div>
          <p className='text-xs text-muted-foreground'>Added {formatDate(credential.created_at)}</p>
        </div>
      </div>
      <DeleteCredentialDialog credential={credential} />
    </li>
  )
}

/** UNIX-seconds → a short, locale date (e.g. "May 30, 2026"). */
function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function AddPushoverDialog() {
  const add = useAddPushoverCredential()
  const [open, setOpen] = useState(false)
  const [appToken, setAppToken] = useState('')
  const [userKey, setUserKey] = useState('')
  const [errors, setErrors] = useState<{
    app_token?: boolean
    user_key?: boolean
  }>({})

  const reset = () => {
    setAppToken('')
    setUserKey('')
    setErrors({})
  }

  const onSubmit = () => {
    const next = {
      app_token: appToken.trim() === '',
      user_key: userKey.trim() === '',
    }
    if (next.app_token || next.user_key) {
      setErrors(next)
      return
    }
    setErrors({})
    add.mutate(
      { app_token: appToken, user_key: userKey },
      {
        onSuccess: () => {
          toast.success('Pushover credential saved')
          setOpen(false)
          reset()
        },
        onError: (err) =>
          toast.error('Could not save credential', {
            description: errorMessage(err),
          }),
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          reset()
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Add Pushover
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>Add Pushover credential</DialogTitle>
        </DialogHeader>
        <DialogBody className='space-y-4'>
          <p className='text-xs text-muted-foreground'>
            Both values are sensitive. They're sent once, stored encrypted, and never shown again.
          </p>
          <div className='space-y-2'>
            <Label htmlFor='pushover-app-token'>App token</Label>
            <Input
              id='pushover-app-token'
              type='password'
              autoComplete='off'
              className='font-mono'
              value={appToken}
              onChange={(e) => {
                setAppToken(e.target.value)
              }}
              aria-invalid={errors.app_token === true}
            />
            {errors.app_token ?
              <p className='text-xs [color:var(--danger)]'>An app token is required.</p>
            : null}
          </div>
          <div className='space-y-2'>
            <Label htmlFor='pushover-user-key'>User key</Label>
            <Input
              id='pushover-user-key'
              type='password'
              autoComplete='off'
              className='font-mono'
              value={userKey}
              onChange={(e) => {
                setUserKey(e.target.value)
              }}
              aria-invalid={errors.user_key === true}
            />
            {errors.user_key ?
              <p className='text-xs [color:var(--danger)]'>A user key is required.</p>
            : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => {
              setOpen(false)
              reset()
            }}
          >
            Cancel
          </Button>
          <Button disabled={add.isPending} onClick={onSubmit}>
            {add.isPending ? 'Saving…' : 'Save credential'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteCredentialDialog({ credential }: { credential: CredentialSummary }) {
  const remove = useDeleteCredential()
  const [open, setOpen] = useState(false)
  const [blockedBy, setBlockedBy] = useState<number[] | null>(null)

  const onConfirm = () => {
    // The Delete button is a plain Button (not AlertDialogAction) so the dialog
    // stays open on failure: the in-use case surfaces inline rather than
    // dismissing. Success closes it explicitly via setOpen(false).
    setBlockedBy(null)
    remove.mutate(credential.id, {
      onSuccess: () => {
        toast.success('Credential deleted')
        setOpen(false)
      },
      onError: (err) => {
        if (err instanceof ApiError && err.code === 'credential_in_use') {
          setBlockedBy(operatorIdsFromInUse(err.details))
          return
        }
        toast.error('Could not delete credential', {
          description: errorMessage(err),
        })
      },
    })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setBlockedBy(null)
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          variant='ghost'
          size='icon'
          className='text-muted-foreground hover:text-[color:var(--danger)]'
          aria-label={`Delete ${credential.kind} credential #${credential.id}`}
        >
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {credential.kind} credential?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the stored secret. Operators that notify through it stop working until you add a new
            credential. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {blockedBy !== null ?
          <div className='rounded-md border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-3 py-2.5 text-sm'>
            <p className='font-medium [color:var(--danger)]'>Can't delete — still in use</p>
            {blockedBy.length > 0 ?
              <p className='mt-1 text-muted-foreground'>
                {blockedBy.length === 1 ? 'Operator ' : 'Operators '}
                {blockedBy.map((id, i) => (
                  <span key={id}>
                    {i > 0 ? ', ' : ''}
                    <span className='font-mono'>#{id}</span>
                  </span>
                ))}{' '}
                still reference{blockedBy.length === 1 ? 's' : ''} this credential. Point{' '}
                {blockedBy.length === 1 ? 'it' : 'them'} at another credential first.
              </p>
            : <p className='mt-1 text-muted-foreground'>
                An Operator still references this credential. Update it first.
              </p>
            }
          </div>
        : null}

        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant='outline'>{blockedBy !== null ? 'Close' : 'Cancel'}</Button>
          </AlertDialogCancel>
          {blockedBy === null ?
            <Button variant='destructive' disabled={remove.isPending} onClick={onConfirm}>
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          : null}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
