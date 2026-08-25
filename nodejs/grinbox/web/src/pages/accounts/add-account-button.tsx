import type { AccountSummary } from '@grinbox/server'
import { ACCOUNT_CAPABILITIES } from '@grinbox/shared'
import { useQueryClient } from '@tanstack/react-query'
import { Mail, Plus, Server } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { accountsKey } from '@/lib/accounts'
import { CAPABILITY_LABELS } from '@/lib/capabilities'
import { type ImapLogin, type ImapProbe, imapRefusalMessage, useCreateImapAccount, useImapProbe } from '@/lib/imap'
import { type OAuthResult, runOAuthFlow } from '@/lib/oauth'
import {
  acceptedFolders,
  draftFromProposal,
  type FolderRoleDraft,
  FolderRoleFields,
  proposalFromFolders,
} from './folder-role-fields'
import { blankLogin, ImapConnectionFields, loginComplete } from './imap-connection-fields'

/**
 * "Add Account" — the backend choice, and then that backend's own flow
 * (d-rydjjggx). An Account carries the backend it was added with and that never
 * changes; a mailbox to be read through another backend is added as another
 * Account (d-oevikmal).
 *
 *  - **Gmail** runs the consent pop-up: the provider issues the grant, and the
 *    flow completes at grinbox's one public path (d-fuln110d).
 *  - **IMAP** takes a connection and a password on grinbox's own internal
 *    interface — a successful login is the authorization (d-fuln110d) — and
 *    then the four folders. The Account exists once those are accepted
 *    (d-8jc4taom): abandoning the dialog after a successful login leaves
 *    nothing behind.
 */
export function AddAccountButton({
  variant = 'default',
  size = 'default',
}: {
  variant?: 'default' | 'outline'
  size?: 'default' | 'lg'
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => {
          setOpen(true)
        }}
      >
        <Plus />
        Add Account
      </Button>
      {open ?
        <AddAccountDialog
          onClose={() => {
            setOpen(false)
          }}
        />
      : null}
    </>
  )
}

type Step = 'backend' | 'connection' | 'folders'

function AddAccountDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [step, setStep] = useState<Step>('backend')
  const [oauthPending, setOauthPending] = useState(false)

  const startGmail = async () => {
    setOauthPending(true)
    try {
      const result = await runOAuthFlow()
      handleOAuthResult(result, () => {
        void qc.invalidateQueries({ queryKey: accountsKey })
      })
      if (result.kind === 'success') {
        onClose()
      }
    } finally {
      setOauthPending(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) {
          onClose()
        }
      }}
    >
      <DialogContent className='max-w-2xl'>
        <DialogHeader>
          <DialogTitle>
            {step === 'backend' ?
              'Add an Account'
            : step === 'connection' ?
              'Connect an IMAP mailbox'
            : 'Choose this Account’s folders'}
          </DialogTitle>
        </DialogHeader>
        {step === 'backend' ?
          <BackendChoice
            oauthPending={oauthPending}
            onGmail={() => void startGmail()}
            onImap={() => {
              setStep('connection')
            }}
            onCancel={onClose}
          />
        : <ImapFlow
            step={step}
            onStep={setStep}
            onCancel={onClose}
            onCreated={() => {
              onClose()
            }}
          />
        }
      </DialogContent>
    </Dialog>
  )
}

function BackendChoice({
  oauthPending,
  onGmail,
  onImap,
  onCancel,
}: {
  oauthPending: boolean
  onGmail: () => void
  onImap: () => void
  onCancel: () => void
}) {
  return (
    <>
      <DialogBody className='space-y-3'>
        <p className='text-sm text-muted-foreground'>
          Which kind of mailbox is this? An Account keeps the backend it was added with — to read one mailbox two ways,
          add it twice.
        </p>
        <button
          type='button'
          className='flex w-full items-start gap-3 rounded-md border border-border p-3 text-left hover:bg-muted/50'
          disabled={oauthPending}
          onClick={onGmail}
        >
          <Mail className='mt-0.5 h-5 w-5 shrink-0 text-muted-foreground' />
          <span>
            <span className='block font-medium'>{oauthPending ? 'Waiting on Google…' : 'Gmail'}</span>
            <span className='block text-xs text-muted-foreground'>
              Authorize through Google. Grinbox can categorize, archive, file, and send on a Gmail Account.
            </span>
          </span>
        </button>
        <button
          type='button'
          className='flex w-full items-start gap-3 rounded-md border border-border p-3 text-left hover:bg-muted/50'
          onClick={onImap}
        >
          <Server className='mt-0.5 h-5 w-5 shrink-0 text-muted-foreground' />
          <span>
            <span className='block font-medium'>IMAP</span>
            <span className='block text-xs text-muted-foreground'>
              Any mailbox reachable by IMAP, with a password of your own. What grinbox can do on it depends on what the
              server offers; it cannot send mail through IMAP.
            </span>
          </span>
        </button>
      </DialogBody>
      <DialogFooter>
        <div />
        <Button variant='outline' onClick={onCancel}>
          Cancel
        </Button>
      </DialogFooter>
    </>
  )
}

/**
 * The IMAP half: log in, then accept the folders. The probe's result is held in
 * this component and nowhere else — nothing is stored until the create call, so
 * closing here leaves no Account, no credential, and no trace of the password.
 */
function ImapFlow({
  step,
  onStep,
  onCancel,
  onCreated,
}: {
  step: Step
  onStep: (step: Step) => void
  onCancel: () => void
  onCreated: () => void
}) {
  const nameId = useId()
  const [login, setLogin] = useState<ImapLogin>(blankLogin)
  const [name, setName] = useState('')
  const [probe, setProbe] = useState<ImapProbe | null>(null)
  const [folders, setFolders] = useState<FolderRoleDraft>(() => draftFromProposal({}))
  const [error, setError] = useState<string | null>(null)

  const probing = useImapProbe()
  const create = useCreateImapAccount()

  const identityComplete = name.trim().length > 0

  const onLogIn = () => {
    setError(null)
    probing.mutate(login, {
      onSuccess: (result) => {
        setProbe(result)
        setFolders(draftFromProposal(proposalFromFolders(result.folders)))
        onStep('folders')
      },
      onError: (err) => {
        setError(imapRefusalMessage(err))
      },
    })
  }

  const accepted = acceptedFolders(folders)

  const onCreate = () => {
    if (accepted === null) {
      return
    }
    setError(null)
    create.mutate(
      { login, name: name.trim(), folders: accepted },
      {
        onSuccess: () => {
          toast.success('Account added', {
            description: 'Grinbox will poll this mailbox on its next heartbeat.',
          })
          onCreated()
        },
        onError: (err) => {
          setError(imapRefusalMessage(err))
        },
      },
    )
  }

  return (
    <>
      <DialogBody className='space-y-6'>
        {step === 'connection' ?
          <>
            <div className='space-y-2'>
              <Label htmlFor={nameId}>Account name</Label>
              <p className='text-xs text-muted-foreground'>What this mailbox is called in grinbox.</p>
              <Input
                id={nameId}
                className='max-w-md'
                placeholder='Personal mail'
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                }}
              />
            </div>
            <ImapConnectionFields value={login} onChange={setLogin} />
          </>
        : <>
            <p className='text-sm text-muted-foreground'>
              Logged in. Grinbox proposed these from the roles the server advertises and the folder names it lists —
              accept them or name others. It creates no folder, so each of these must already exist.
            </p>
            <FolderRoleFields value={folders} onChange={setFolders} folders={probe?.folders ?? []} />
            <CapabilityNotice capabilities={probe?.capabilities ?? null} />
          </>
        }

        {error ?
          <p
            role='alert'
            className='rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm [color:var(--danger)]'
          >
            {error}
          </p>
        : null}
      </DialogBody>
      <DialogFooter>
        <div />
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            onClick={() => {
              if (step === 'folders') {
                onStep('connection')
                return
              }
              onCancel()
            }}
          >
            {step === 'folders' ? 'Back' : 'Cancel'}
          </Button>
          {step === 'connection' ?
            <Button onClick={onLogIn} disabled={!loginComplete(login) || !identityComplete || probing.isPending}>
              {probing.isPending ? 'Logging in…' : 'Log in'}
            </Button>
          : <Button onClick={onCreate} disabled={accepted === null || create.isPending}>
              {create.isPending ? 'Adding…' : 'Add Account'}
            </Button>
          }
        </div>
      </DialogFooter>
    </>
  )
}

/**
 * What this Account will not be able to do, read from the server when grinbox
 * logged in (d-bzw8qoiy). Saying it here is saying it before the user builds a
 * configuration around it (r-x3jb6wlq, d-5h66e3zl).
 */
export function CapabilityNotice({ capabilities }: { capabilities: AccountSummary['capabilities'] }) {
  if (capabilities === null) {
    return null
  }
  const missing = ACCOUNT_CAPABILITIES.filter((capability) => !capabilities.supported.includes(capability))
  if (missing.length === 0) {
    return null
  }
  return (
    <div className='rounded-md border border-[color:var(--warning)]/40 bg-[color:var(--warning)]/10 p-3 text-sm'>
      <p className='font-medium [color:var(--warning)]'>This Account cannot:</p>
      <ul className='mt-1 list-inside list-disc text-muted-foreground'>
        {missing.map((capability) => (
          <li key={capability}>
            {CAPABILITY_LABELS[capability]}
            {capabilities.unsupported[capability] ? ` — ${capabilities.unsupported[capability]}` : null}
          </li>
        ))}
      </ul>
      <p className='mt-2 text-xs text-muted-foreground'>
        An Operator naming one of these fails on this Account, and runs normally on Accounts that can carry it.
      </p>
    </div>
  )
}

/**
 * Map an OAuth outcome onto a toast (and run `onSuccess` for the success
 * branch). Shared so Add Account and Re-auth render the same copy.
 */
export function handleOAuthResult(result: OAuthResult, onSuccess: () => void): void {
  switch (result.kind) {
    case 'success':
      onSuccess()
      toast.success('Account authorized', {
        description: 'Gmail access granted. Grinbox will start polling shortly.',
      })
      break
    case 'not_configured':
      toast.error('Gmail OAuth not configured', {
        description: result.message,
      })
      break
    case 'popup_blocked':
      toast.error('Pop-up blocked', {
        description: 'Allow pop-ups for Grinbox and try Add Account again to open the Google consent window.',
      })
      break
    case 'cancelled':
      toast('Authorization cancelled', {
        description: 'The consent window closed before authorization finished.',
      })
      break
    case 'error':
      toast.error("Couldn't authorize Gmail", {
        description: result.message,
      })
      break
  }
}
