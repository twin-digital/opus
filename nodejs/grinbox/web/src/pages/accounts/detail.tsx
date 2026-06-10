import type { AccountSummary, PipelineSummary } from '@twin-digital/grinbox-server'
import { ACCOUNT_COLORS, ACCOUNT_ICONS } from '@twin-digital/grinbox-shared'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { AccountIcon } from '../../components/account-icon.js'
import { Page } from '../../components/page.js'
import { StatusIndicator } from '../../components/status-indicator.js'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../components/ui/alert-dialog.js'
import { Button } from '../../components/ui/button.js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.js'
import { Input } from '../../components/ui/input.js'
import { Label } from '../../components/ui/label.js'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select.js'
import {
  ApiError,
  accountsKey,
  useAccount,
  useDeleteAccount,
  usePipelines,
  useUpdateAccount,
} from '../../lib/accounts.js'
import { runOAuthFlow } from '../../lib/oauth.js'
import { cn } from '../../lib/utils.js'
import { handleOAuthResult } from './add-account-button.js'

/** Cadence bounds the daemon enforces (oauth/account-config out-of-range error). */
const MIN_CADENCE = 60
const MAX_CADENCE = 86_400
/** Sentinel for the "— none —" option (Radix Select forbids an empty value). */
const NO_PIPELINE = 'none'

/**
 * Account detail — a thin settings page (ui-design.md "Account detail"): change
 * the active Pipeline, change poll cadence, re-auth, and delete. All edits go
 * through TanStack Query mutations that invalidate the account + list queries;
 * structured API errors surface as toasts/inline messages.
 */
export function AccountDetailPage() {
  const { accountId } = useParams({ from: '/accounts/$accountId' })
  const id = Number(accountId)
  const { data: account, isPending, isError, error } = useAccount(id)

  return (
    <Page>
      <Link
        to='/accounts'
        className='mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground'
      >
        <ArrowLeft className='h-4 w-4' />
        Back to Accounts
      </Link>

      {isError ?
        <div className='rounded-lg border border-dashed border-border bg-card/40 px-6 py-12 text-center'>
          <p className='text-base font-medium'>Couldn't load this Account</p>
          <p className='mt-1 text-sm text-muted-foreground'>{error.message}</p>
        </div>
      : isPending ?
        <div className='space-y-4'>
          <div className='h-8 w-64 animate-pulse rounded bg-muted' />
          <div className='h-40 w-full animate-pulse rounded-lg bg-muted' />
        </div>
      : <AccountSettings account={account} id={id} />}
    </Page>
  )
}

function AccountSettings({ account, id }: { account: AccountSummary; id: number }) {
  const pipelinesQuery = usePipelines()
  const update = useUpdateAccount(id)
  const remove = useDeleteAccount(id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [reauthPending, setReauthPending] = useState(false)

  // Local form state, seeded from the loaded account; reset when it changes
  // (e.g. after a refetch). Save is explicit (sticky footer).
  const [pipelineValue, setPipelineValue] = useState<string>(
    account.active_pipeline_id === null ? NO_PIPELINE : String(account.active_pipeline_id),
  )
  const [cadence, setCadence] = useState<string>(String(account.poll_interval_seconds))
  // Display badge: name, icon (`''` = default mail), color (`''` = neutral).
  const [name, setName] = useState<string>(account.name)
  const [icon, setIcon] = useState<string>(account.icon ?? '')
  const [color, setColor] = useState<string>(account.color ?? '')

  useEffect(() => {
    setPipelineValue(account.active_pipeline_id === null ? NO_PIPELINE : String(account.active_pipeline_id))
    setCadence(String(account.poll_interval_seconds))
    setName(account.name)
    setIcon(account.icon ?? '')
    setColor(account.color ?? '')
  }, [account.active_pipeline_id, account.poll_interval_seconds, account.name, account.icon, account.color])

  const cadenceNum = Number(cadence)
  const cadenceValid = Number.isInteger(cadenceNum) && cadenceNum >= MIN_CADENCE && cadenceNum <= MAX_CADENCE
  const nameValid = name.trim().length > 0

  const pipelineChanged =
    pipelineValue !== (account.active_pipeline_id === null ? NO_PIPELINE : String(account.active_pipeline_id))
  const cadenceChanged = cadenceNum !== account.poll_interval_seconds
  const nameChanged = name.trim() !== account.name
  const iconChanged = (icon || null) !== (account.icon ?? null)
  const colorChanged = (color || null) !== (account.color ?? null)
  const dirty = pipelineChanged || cadenceChanged || nameChanged || iconChanged || colorChanged

  const onSave = () => {
    if (!cadenceValid || !nameValid) {
      return
    }
    update.mutate(
      {
        activePipelineId:
          pipelineChanged ?
            pipelineValue === NO_PIPELINE ?
              null
            : Number(pipelineValue)
          : undefined,
        pollIntervalSeconds: cadenceChanged ? cadenceNum : undefined,
        name: nameChanged ? name.trim() : undefined,
        icon: iconChanged ? icon || null : undefined,
        color: colorChanged ? color || null : undefined,
      },
      {
        onSuccess: () => toast.success('Account settings saved'),
        onError: (err) => toast.error('Save failed', { description: msg(err) }),
      },
    )
  }

  const onReauth = async () => {
    if (reauthPending) {
      return
    }
    setReauthPending(true)
    try {
      const result = await runOAuthFlow({ accountId: id })
      handleOAuthResult(result, () => {
        void qc.invalidateQueries({ queryKey: accountsKey })
        void qc.invalidateQueries({ queryKey: ['accounts', id] })
      })
    } finally {
      setReauthPending(false)
    }
  }

  const onDelete = () => {
    remove.mutate(undefined, {
      onSuccess: () => {
        toast.success('Account deleted')
        void navigate({ to: '/accounts' })
      },
      onError: (err) => toast.error('Delete failed', { description: msg(err) }),
    })
  }

  return (
    <div className='space-y-6'>
      <header>
        <h1 className='text-3xl font-semibold tracking-tight'>{account.name}</h1>
        <div className='mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground'>
          <span className='capitalize'>{account.provider_type === 'gmail' ? 'Gmail' : account.provider_type}</span>
          <span aria-hidden='true'>·</span>
          <StatusIndicator status={account.status} />
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Display</CardTitle>
          <CardDescription>
            The name, icon, and color shown in the Inbox and account list. The icon marks this Account when several are
            interleaved.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-5'>
          <div className='flex items-center gap-3'>
            <AccountIcon accountId={id} name={name || undefined} icon={icon || undefined} color={color || undefined} />
            <div className='flex-1 space-y-2'>
              <Label htmlFor='acct-name'>Name</Label>
              <Input
                id='acct-name'
                className='max-w-sm'
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                }}
                aria-invalid={!nameValid}
              />
              {!nameValid ?
                <p className='text-xs [color:var(--danger)]'>Name can't be empty.</p>
              : null}
            </div>
          </div>

          <div className='space-y-2'>
            <Label>Icon</Label>
            <div className='flex flex-wrap gap-1.5'>
              {ACCOUNT_ICONS.map((opt) => (
                <button
                  key={opt}
                  type='button'
                  onClick={() => {
                    setIcon(opt)
                  }}
                  aria-pressed={icon === opt}
                  aria-label={`Icon ${opt}`}
                  title={opt}
                  className={cn(
                    'rounded-md border p-0.5',
                    icon === opt ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-accent/50',
                  )}
                >
                  <AccountIcon accountId={id} icon={opt} color={color || undefined} />
                </button>
              ))}
            </div>
          </div>

          <div className='space-y-2'>
            <Label>Color</Label>
            <div className='flex flex-wrap gap-1.5'>
              <button
                type='button'
                onClick={() => {
                  setColor('')
                }}
                aria-pressed={color === ''}
                aria-label='Color neutral'
                title='Neutral'
                className={cn(
                  'rounded-md border p-0.5',
                  color === '' ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-accent/50',
                )}
              >
                <AccountIcon accountId={id} icon={icon || undefined} />
              </button>
              {ACCOUNT_COLORS.map((opt) => (
                <button
                  key={opt}
                  type='button'
                  onClick={() => {
                    setColor(opt)
                  }}
                  aria-pressed={color === opt}
                  aria-label={`Color ${opt}`}
                  title={opt}
                  className={cn(
                    'rounded-md border p-0.5',
                    color === opt ? 'border-primary ring-1 ring-primary' : 'border-border hover:bg-accent/50',
                  )}
                >
                  <AccountIcon accountId={id} icon={icon || undefined} color={opt} />
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
          <CardDescription>
            Pick which Pipeline triages new Messages on this Account. Swap freely — the change applies on the next poll.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-2'>
          <Label htmlFor='pipeline'>Active Pipeline</Label>
          <Select value={pipelineValue} onValueChange={setPipelineValue}>
            <SelectTrigger id='pipeline' className='max-w-sm'>
              <SelectValue placeholder='Select a Pipeline' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PIPELINE}>— none —</SelectItem>
              {(pipelinesQuery.data ?? []).map((p: PipelineSummary) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pipelineValue === NO_PIPELINE ?
            <p className='text-xs text-muted-foreground'>
              With no Pipeline assigned, new Messages on this Account won't be triaged.
            </p>
          : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Polling</CardTitle>
          <CardDescription>How often the daemon checks Gmail for new Messages on this Account.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-2'>
          <Label htmlFor='cadence'>Poll cadence (seconds)</Label>
          <Input
            id='cadence'
            type='number'
            min={MIN_CADENCE}
            max={MAX_CADENCE}
            className='max-w-[12rem]'
            value={cadence}
            onChange={(e) => {
              setCadence(e.target.value)
            }}
            aria-invalid={!cadenceValid}
          />
          {cadenceValid ?
            <p className='text-xs text-muted-foreground'>
              Minimum {MIN_CADENCE}s, maximum {MAX_CADENCE}s.
            </p>
          : <p className='text-xs [color:var(--danger)]'>
              Enter a whole number between {MIN_CADENCE} and {MAX_CADENCE} seconds.
            </p>
          }
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Authorization</CardTitle>
          <CardDescription>
            Re-run Google consent for this Account — needed after a revoked or expired grant, or to widen scopes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant='outline'
            disabled={reauthPending}
            onClick={() => {
              void onReauth()
            }}
          >
            <KeyRound />
            {reauthPending ? 'Waiting on Google…' : 'Re-authorize'}
          </Button>
        </CardContent>
      </Card>

      <div className='sticky bottom-0 -mx-8 flex items-center justify-between gap-4 border-t border-border bg-background/95 px-8 py-4 backdrop-blur'>
        <DeleteAccountDialog accountName={account.name} pending={remove.isPending} onConfirm={onDelete} />
        <div className='flex items-center gap-3'>
          {dirty ?
            <span className='text-sm [color:var(--warning)]'>● Unsaved changes</span>
          : <span className='text-sm text-muted-foreground'>No unsaved changes</span>}
          <Button disabled={!dirty || !cadenceValid || !nameValid || update.isPending} onClick={onSave}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function DeleteAccountDialog({
  accountName,
  pending,
  onConfirm,
}: {
  accountName: string
  pending: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant='destructive' disabled={pending}>
          Delete Account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {accountName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the Account and stops Grinbox from polling it. Its stored Gmail authorization is revoked from
            Grinbox. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant='outline'>Cancel</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant='destructive' onClick={onConfirm}>
              Delete
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Best-effort human message for a thrown mutation error. */
function msg(err: unknown): string {
  if (err instanceof ApiError) {
    return err.message
  }
  if (err instanceof Error) {
    return err.message
  }
  return 'Something went wrong.'
}
